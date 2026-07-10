#!/usr/bin/env node
// Temporary Phase 0 movement gate (removed once the central transition
// coordinator lands). Fails when a NEW direct location fetch or a browser-side
// knock_requests mutation is introduced outside the audited allowlist.
//
// Allowlist source: docs/presence-remediation/phase-0-writer-caller-inventory-2026-07-10.md
import { execSync } from 'node:child_process';

// Files permitted to call the legacy location HTTP endpoint today. Phases 4-5
// remove these; until then they are the only sanctioned transport owners.
const LOCATION_FETCH_ALLOW = new Set([
  'src/hooks/useLastSpace.ts',
  'src/hooks/useUserPresence.ts',
]);

// No browser client is allowed to mutate knock_requests directly. All knock
// writes must go through the server routes. Allowlist is intentionally empty.
const KNOCK_BROWSER_MUTATION_ALLOW = new Set([]);

function grep(pattern) {
  try {
    // Plain grep over the working tree so untracked/uncommitted violations are
    // caught locally, not only tracked content (git grep misses those).
    return execSync(
      `grep -rnEI --include='*.ts' --include='*.tsx' ${JSON.stringify(pattern)} src`,
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return []; // grep exits 1 on no matches
  }
}

const violations = [];

// 1. Direct calls to the legacy location endpoint.
for (const line of grep(String.raw`['"\x60]/api/users/location`)) {
  const file = line.split(':', 1)[0];
  if (!LOCATION_FETCH_ALLOW.has(file)) {
    violations.push(`Direct /api/users/location call outside allowlist:\n    ${line}`);
  }
}

// 2. Browser-side knock_requests mutations.
for (const line of grep(String.raw`\.from\(\s*['"\x60]knock_requests['"\x60]\s*\)\s*\.(insert|update|delete|upsert)`)) {
  const file = line.split(':', 1)[0];
  if (!KNOCK_BROWSER_MUTATION_ALLOW.has(file)) {
    violations.push(`Browser knock_requests mutation (must use server route):\n    ${line}`);
  }
}

if (violations.length > 0) {
  console.error('✖ Presence movement gate failed:\n');
  for (const v of violations) console.error('  - ' + v + '\n');
  console.error(
    'These paths are under presence-safety remediation. See\n' +
      '  docs/presence-safety-remediation-handoff-2026-07-09.md\n' +
      'Route location writes through the central transition coordinator and knock\n' +
      'writes through the server routes. Do not extend the allowlist to bypass this.',
  );
  process.exit(1);
}

console.log('✓ Presence movement gate passed (no new out-of-allowlist location/knock writes).');
