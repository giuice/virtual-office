import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `next dev` rewrites next-env.d.ts to import route types from its distDir.
// After a local-mode run it points at .next-messaging-local; restore the
// default .next reference so `npm run type-check` keeps using the normal output.
const LOCAL_MARKER = './.next-messaging-local/';

export default function restoreNextEnv() {
  const nextEnvPath = resolve('next-env.d.ts');
  if (!existsSync(nextEnvPath)) return;
  const current = readFileSync(nextEnvPath, 'utf8');
  if (!current.includes(LOCAL_MARKER)) return;
  writeFileSync(nextEnvPath, current.replaceAll(LOCAL_MARKER, './.next/'), 'utf8');
}
