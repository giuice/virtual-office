import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * Phase 5 T24 — raw log lines of the local app server, readable by tests.
 *
 * The Phase 5 runner (playwright.messaging-phase5.config.ts) starts the dev
 * server through scripts/playwright-server-log-tee.mjs, which copies every
 * stdout/stderr line, unmodified, to the file named by
 * VO_E2E_SERVER_LOG_FILE. Lines are read here exactly as the server printed
 * them — before any sanitization (no ANSI stripping, no redaction) — so a test
 * can, for example, scan the real `console.info` metric lines (AC-028) for
 * forbidden content. A test reads only the lines written after its own mark.
 *
 * Usage:
 *   const mark = serverLog.mark();
 *   // ... act ...
 *   const line = await serverLog.waitForLine((l) => l.includes('"type":"send_outcome"'), { since: mark });
 *   const all = serverLog.linesSince(mark);
 */
export interface ServerLogMark {
  /** Byte offset in the log file when the mark was taken. */
  readonly offset: number;
}

export interface ServerLog {
  /** Absolute path of the raw log file. */
  readonly path: string;
  /** Marks the current end of the log; later reads start here. */
  mark(): ServerLogMark;
  /** Complete lines (without their line terminator) written since `since`. */
  linesSince(since: ServerLogMark): string[];
  /**
   * Polls until a complete line written since `since` matches, and returns it.
   * Throws with the number of lines seen when `timeoutMs` (default 10 s) passes.
   */
  waitForLine(
    match: (line: string) => boolean,
    options: { since: ServerLogMark; timeoutMs?: number },
  ): Promise<string>;
}

export const SERVER_LOG_FILE_ENV = 'VO_E2E_SERVER_LOG_FILE';

const POLL_INTERVAL_MS = 100;

function readBytesFrom(path: string, offset: number): Buffer {
  if (!existsSync(path)) {
    throw new Error(`The raw server log ${path} does not exist; run through the Phase 5 runner.`);
  }
  const content = readFileSync(path);
  // The tee truncates the file when a new server starts; a mark from before
  // that restart reads the whole new file.
  return content.length >= offset ? content.subarray(offset) : content;
}

function completeLines(bytes: Buffer): string[] {
  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) return [];
  return bytes
    .subarray(0, lastNewline)
    .toString('utf8')
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

export function openServerLog(path = process.env[SERVER_LOG_FILE_ENV]): ServerLog {
  if (!path) {
    throw new Error(`${SERVER_LOG_FILE_ENV} is not set: raw server logs exist only under the Phase 5 runner.`);
  }
  const logPath = path;
  return {
    path: logPath,
    mark() {
      return { offset: existsSync(logPath) ? statSync(logPath).size : 0 };
    },
    linesSince(since) {
      return completeLines(readBytesFrom(logPath, since.offset));
    },
    async waitForLine(match, { since, timeoutMs = 10_000 }) {
      const deadline = Date.now() + timeoutMs;
      let seen = 0;
      for (;;) {
        const lines = completeLines(readBytesFrom(logPath, since.offset));
        seen = lines.length;
        const found = lines.find(match);
        if (found !== undefined) return found;
        if (Date.now() >= deadline) {
          throw new Error(`No matching server log line within ${timeoutMs} ms (${seen} line(s) since the mark).`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    },
  };
}
