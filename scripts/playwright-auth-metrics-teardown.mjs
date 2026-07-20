import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export default async function authMetricsTeardown() {
  if (process.env.VO_AUTH_METRICS !== '1') return;

  const shutdownPath = resolve(
    process.env.VO_AUTH_METRICS_SHUTDOWN_FILE ?? 'test-results/auth-metrics.shutdown'
  );
  const shutdownAckPath = resolve(
    process.env.VO_AUTH_METRICS_SHUTDOWN_ACK_FILE ?? 'test-results/auth-metrics.shutdown.ack'
  );
  mkdirSync(dirname(shutdownPath), { recursive: true });
  writeFileSync(shutdownPath, 'shutdown\n', { encoding: 'utf8', flag: 'w' });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(shutdownAckPath) && readFileSync(shutdownAckPath, 'utf8') === 'drained\n') {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }

  throw new Error('Auth metrics server did not acknowledge a drained shutdown within 20 seconds.');
}
