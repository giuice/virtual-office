import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { sanitizeAuthMetricLine } from './auth-metrics-sanitizer.mjs';

const outputPath = resolve(process.env.VO_AUTH_METRICS_FILE ?? 'test-results/auth-metrics.ndjson');
const shutdownPath = resolve(
  process.env.VO_AUTH_METRICS_SHUTDOWN_FILE ?? 'test-results/auth-metrics.shutdown'
);
const shutdownAckPath = resolve(
  process.env.VO_AUTH_METRICS_SHUTDOWN_ACK_FILE ?? 'test-results/auth-metrics.shutdown.ack'
);
const nextEnvPath = resolve('next-env.d.ts');
const nextDistDir = process.env.VO_NEXT_DIST_DIR ?? '.next-auth-metrics-webpack';
const ownedNextEnvMarker = `./${nextDistDir.replaceAll('\\', '/')}/`;
const originalNextEnv = existsSync(nextEnvPath)
  ? readFileSync(nextEnvPath, 'utf8').replaceAll(ownedNextEnvMarker, './.next/')
  : undefined;
const serverPort = process.env.VO_AUTH_METRICS_PORT ?? '3100';
if (!/^\d{1,5}$/.test(serverPort) || Number(serverPort) < 1 || Number(serverPort) > 65_535) {
  throw new Error('VO_AUTH_METRICS_PORT must be a valid TCP port.');
}
mkdirSync(dirname(outputPath), { recursive: true });
rmSync(outputPath, { force: true });
rmSync(shutdownPath, { force: true });
rmSync(shutdownAckPath, { force: true });

function restoreNextEnvIfOwned() {
  if (!existsSync(nextEnvPath)) return;
  const current = readFileSync(nextEnvPath, 'utf8');
  if (!current.includes(ownedNextEnvMarker)) return;
  if (originalNextEnv === undefined) {
    rmSync(nextEnvPath, { force: true });
  } else {
    writeFileSync(nextEnvPath, originalNextEnv, 'utf8');
  }
}

function inspectStream(stream, destination) {
  return new Promise((resolveDrain) => {
    let pending = '';
    let isDrained = false;

    const drain = () => {
      if (isDrained) return;
      isDrained = true;
      const metric = sanitizeAuthMetricLine(pending);
      if (metric) appendFileSync(outputPath, `${JSON.stringify(metric)}\n`, 'utf8');
      pending = '';
      resolveDrain();
    };

    stream.on('data', (chunk) => {
      destination.write(chunk);
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const metric = sanitizeAuthMetricLine(line);
        if (metric) appendFileSync(outputPath, `${JSON.stringify(metric)}\n`, 'utf8');
      }
    });
    stream.once('end', drain);
    stream.once('close', drain);
    stream.once('error', drain);
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isPosixProcessGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForPosixProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPosixProcessGroupAlive(pid)) return true;
    await delay(50);
  }
  return !isPosixProcessGroupAlive(pid);
}

function runTaskkill(pid) {
  return new Promise((resolveTaskkill) => {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    taskkill.once('error', resolveTaskkill);
    taskkill.once('close', resolveTaskkill);
  });
}

const childExecutable = process.platform === 'win32'
  ? (process.env.ComSpec ?? 'cmd.exe')
  : './node_modules/.bin/next';
const childArguments = process.platform === 'win32'
  ? ['/d', '/s', '/c', `node_modules\\.bin\\next.cmd dev --webpack --port ${serverPort}`]
  : ['dev', '--webpack', '--port', serverPort];
const child = spawn(childExecutable, childArguments, {
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    VO_AUTH_METRICS: '1',
    VO_NEXT_DIST_DIR: nextDistDir,
    VO_NEXT_TSCONFIG: process.env.VO_NEXT_TSCONFIG ?? 'tsconfig.auth-metrics.json',
  },
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true,
});

let spawnFailure;
let childClosed = false;
let requestedSignal;
let shutdownStarted = false;
const closeResult = new Promise((resolveClose) => {
  child.once('error', (error) => {
    spawnFailure = error;
    console.error(`Failed to start the Playwright auth metrics server: ${error.message}`);
  });
  child.once('close', (code, signal) => {
    childClosed = true;
    resolveClose({ code, signal });
  });
});
const stdoutDrained = inspectStream(child.stdout, process.stdout);
const stderrDrained = inspectStream(child.stderr, process.stderr);

async function terminateProcessTree(signal) {
  if (!child.pid || childClosed) return;

  if (process.platform === 'win32') {
    await runTaskkill(child.pid);
    if (!childClosed) child.kill();
  } else {
    try {
      process.kill(-child.pid, signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }

  const childDidClose = await Promise.race([
    closeResult.then(() => true),
    delay(5_000).then(() => false),
  ]);
  const processTreeDidClose = process.platform === 'win32'
    ? childDidClose
    : await waitForPosixProcessGroupExit(child.pid, 5_000);
  if (childDidClose && processTreeDidClose) return;

  if (process.platform === 'win32') {
    await runTaskkill(child.pid);
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }

  if (process.platform !== 'win32') {
    await waitForPosixProcessGroupExit(child.pid, 5_000);
  }
}

function requestShutdown(signal = 'SIGTERM') {
  if (shutdownStarted) return;
  shutdownStarted = true;
  requestedSignal = signal;
  void (async () => {
    try {
      await terminateProcessTree(signal);
      await Promise.race([
        Promise.allSettled([stdoutDrained, stderrDrained]),
        delay(2_000),
      ]);
      restoreNextEnvIfOwned();
      writeFileSync(shutdownAckPath, 'drained\n', 'utf8');
      process.exit(0);
    } catch (error) {
      restoreNextEnvIfOwned();
      console.error(`Failed to stop the Playwright auth metrics server tree: ${error.message}`);
      process.exit(1);
    }
  })();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => requestShutdown(signal));
}

const shutdownPoll = setInterval(() => {
  if (existsSync(shutdownPath)) requestShutdown();
}, 100);
shutdownPoll.unref();

const [{ code }] = await Promise.all([closeResult, stdoutDrained, stderrDrained]);
restoreNextEnvIfOwned();
process.exitCode = spawnFailure ? 1 : code ?? (requestedSignal ? 0 : 1);
