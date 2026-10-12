// Phase 5 T24: runs the local E2E web server and copies its raw output to a file
// that tests can read (helpers/server-log.ts), while still passing it through to
// Playwright's `[WebServer]` output.
//
// Usage: node scripts/playwright-server-log-tee.mjs <command> [args...]
// Env:   VO_E2E_SERVER_LOG_FILE — absolute path of the raw log (truncated at start).
//
// Nothing is filtered, redacted, or reformatted: every stdout and stderr line is
// written byte for byte as the server printed it. The only processing is
// line-atomic interleaving: each stream is buffered up to its next newline and
// only whole lines are written, so a stdout line and a stderr line never splice
// into one another. When a stream ends with an unterminated fragment, the
// fragment is written followed by a line feed (0x0a) — the one byte the tee ever adds — so
// the next line of the other stream still starts on a line of its own. This is
// a local test aid only; the log file lives in an ignored directory and is never
// uploaded.
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';

const logPath = process.env.VO_E2E_SERVER_LOG_FILE;
if (!logPath || !isAbsolute(logPath)) {
  console.error('[server-log-tee] VO_E2E_SERVER_LOG_FILE must be an absolute path.');
  process.exit(2);
}
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('[server-log-tee] Missing the server command.');
  process.exit(2);
}

mkdirSync(dirname(logPath), { recursive: true });
const fd = openSync(logPath, 'w');

const LINE_FEED = Buffer.from([0x0a]);

function tee(stream, destination) {
  let pending = Buffer.alloc(0);
  stream.on('data', (chunk) => {
    destination.write(chunk);
    pending = Buffer.concat([pending, chunk]);
    const lastNewline = pending.lastIndexOf(0x0a);
    if (lastNewline >= 0) {
      writeSync(fd, pending.subarray(0, lastNewline + 1));
      pending = pending.subarray(lastNewline + 1);
    }
  });
  return new Promise((resolveEnd) => {
    const flush = () => {
      if (pending.length > 0) {
        // Terminate the EOF fragment (the only byte the tee adds).
        writeSync(fd, Buffer.concat([pending, LINE_FEED]));
        pending = Buffer.alloc(0);
      }
      resolveEnd();
    };
    stream.once('end', flush);
    stream.once('close', flush);
    stream.once('error', flush);
  });
}

// Deterministic output whatever launched the runner (a terminal, a pipe, a
// file redirect, NO_COLOR in the shell): Next colours its log lines only when
// NO_COLOR is absent and FORCE_COLOR is set or stdout is a TTY — and the
// server's stdout is always this pipe. Colour on, so raw lines keep their
// escape codes.
// (Windows environment names are case-insensitive, so match them that way.)
const serverEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !['NO_COLOR', 'FORCE_COLOR'].includes(name.toUpperCase())),
);
serverEnvironment.FORCE_COLOR = '1';

// `command` is the Node binary path or a script given by the config, never user
// input; no shell is involved.
const child = spawn(command === 'node' ? process.execPath : command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: serverEnvironment,
  windowsHide: true,
});

const drained = Promise.all([tee(child.stdout, process.stdout), tee(child.stderr, process.stderr)]);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error(`[server-log-tee] Failed to start the server: ${error.message}`);
  process.exitCode = 1;
});

child.once('exit', async (code, signal) => {
  await drained;
  closeSync(fd);
  process.exit(code ?? (signal ? 1 : 0));
});
