import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';

const COORDINATOR_PATH = 'src/lib/presence/location-transition-coordinator.ts';
const LEGACY_REPOSITORY_PATH = 'src/repositories/implementations/supabase/SupabaseUserRepository.ts';
const LEGACY_ROUTE_PATH = 'src/app/api/users/location/route.ts';
const STORAGE_KEYS_PATH = 'src/lib/presence/storage-keys.ts';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const extension = entry.name.endsWith('.tsx') ? '.tsx' : entry.name.endsWith('.ts') ? '.ts' : '';
    return SOURCE_EXTENSIONS.has(extension) ? [path] : [];
  });
}

function normalizedRelativePath(projectRoot, path) {
  return relative(projectRoot, path).split(sep).join('/');
}

function matchingLines(contents, pattern) {
  return contents.split(/\r?\n/).flatMap((line, index) =>
    pattern.test(line) ? [{ number: index + 1, text: line.trim() }] : []
  );
}

export function findPresenceMovementViolations(projectRoot = process.cwd()) {
  const violations = [];
  const sourceRoot = join(projectRoot, 'src');

  for (const path of sourceFiles(sourceRoot)) {
    const file = normalizedRelativePath(projectRoot, path);
    const contents = readFileSync(path, 'utf8');

    for (const match of matchingLines(contents, /\bBroadcastChannel\b/)) {
      violations.push(`${file}:${match.number} forbidden Presence BroadcastChannel: ${match.text}`);
    }

    if (file !== STORAGE_KEYS_PATH) {
      for (const match of matchingLines(
        contents,
        /['"`](?:lastSpaceId|vo-disconnect-timestamp|vo-first-login-done|vo-knock-cooldown-)/,
      )) {
        violations.push(`${file}:${match.number} legacy global Presence storage key: ${match.text}`);
      }
    }

    for (const match of matchingLines(contents, /['"`]\/api\/users\/location/)) {
      violations.push(`${file}:${match.number} legacy /api/users/location transport: ${match.text}`);
    }

    for (const match of matchingLines(contents, /['"`]\/api\/presence\/location/)) {
      if (file !== COORDINATOR_PATH) {
        violations.push(`${file}:${match.number} atomic location transport outside coordinator: ${match.text}`);
      }
    }

    for (const match of matchingLines(contents, /\.updateLocation\s*\(/)) {
      if (file !== LEGACY_REPOSITORY_PATH && file !== LEGACY_ROUTE_PATH) {
        violations.push(`${file}:${match.number} legacy repository placement writer: ${match.text}`);
      }
    }

    for (const match of matchingLines(contents, /\.updateCurrentSpace\s*\(/)) {
      violations.push(`${file}:${match.number} unowned direct placement writer: ${match.text}`);
    }

    const isBrowserModule = /^\s*['"]use client['"];?/m.test(contents);
    if (isBrowserModule) {
      if (/SupabaseUserRepository/.test(contents)) {
        violations.push(`${file}: browser module imports or references SupabaseUserRepository`);
      }

      for (const match of matchingLines(contents, /user-presence-channel/)) {
        violations.push(`${file}:${match.number} legacy public Presence topic: ${match.text}`);
      }

      const browserUsersMutation = /\.from\(\s*['"`]users['"`]\s*\)[\s\S]{0,400}?\.(?:insert|update|delete|upsert)\s*\(/g;
      if (browserUsersMutation.test(contents)) {
        violations.push(`${file}: browser public.users mutation`);
      }

      for (const match of matchingLines(
        contents,
        /\.from\(\s*['"`]knock_requests['"`]\s*\).*\.(?:insert|update|delete|upsert)\(/,
      )) {
        violations.push(`${file}:${match.number} browser knock_requests mutation: ${match.text}`);
      }
    }
  }

  return violations;
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMainModule) {
  const violations = findPresenceMovementViolations();

  if (violations.length > 0) {
    console.error('Presence movement gate failed:\n');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error('\nAll client location writes must use the central transition coordinator.');
    process.exit(1);
  }

  console.log('Presence movement gate passed: atomic transport and browser writer boundaries hold.');
}
