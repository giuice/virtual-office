import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const readProjectFile = (filePath: string): string =>
  readFileSync(path.join(projectRoot, filePath), 'utf8');

const collectTestFiles = (directory: string): string[] =>
  readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectTestFiles(relativePath);
      }

      return /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [relativePath] : [];
    },
  );

describe('Vitest test classification', () => {
  it('excludes browser, local-database, and remote-database suites from the local config', () => {
    const config = readProjectFile('vitest.config.mts');

    expect(config).toContain("'**/__tests__/api/playwright/**'");
    expect(config).toContain("'**/__tests__/presence-db/**'");
    expect(config).toContain("'**/__tests__/messaging/pin_star_integration.test.ts'");
  });

  it('provides a dedicated remote command and exact remote include', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const remoteConfig = readProjectFile('vitest.remote-messaging.config.mts');

    expect(packageJson.scripts.test).toBe('vitest run');
    expect(packageJson.scripts['test:messaging-remote']).toBe(
      'vitest run --config vitest.remote-messaging.config.mts',
    );
    expect(remoteConfig).toContain(
      "include: ['__tests__/messaging/pin_star_integration.test.ts']",
    );
  });

  it('requires explicit remote-only credentials instead of loading .env.local', () => {
    const remoteTest = readProjectFile(
      '__tests__/messaging/pin_star_integration.test.ts',
    );

    expect(remoteTest).toContain('RUN_REMOTE_MESSAGING_INTEGRATION');
    expect(remoteTest).toContain('REMOTE_MESSAGING_SUPABASE_URL');
    expect(remoteTest).toContain('REMOTE_MESSAGING_SUPABASE_SERVICE_ROLE_KEY');
    expect(remoteTest).not.toContain('.env.local');
  });

  it('forbids skipped or placeholder tests in critical presence suites', () => {
    const criticalPresenceTests = collectTestFiles('__tests__').filter((filePath) => {
      const normalizedPath = filePath.replaceAll('\\', '/');

      return (
        normalizedPath.includes('/presence-db/') ||
        /presence|space-capacity|exit-gate|atomic-transition|session-leases/.test(
          normalizedPath,
        )
      );
    });
    const forbiddenPattern = /\b(?:it|test|describe)\.(?:skip|todo)\s*\(/;
    const violations = criticalPresenceTests.filter((filePath) =>
      forbiddenPattern.test(readProjectFile(filePath)),
    );

    expect(violations).toEqual([]);
  });
});
