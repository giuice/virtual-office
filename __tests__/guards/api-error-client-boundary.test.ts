import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT_SAFE_ERROR_MODULES = [
  'src/lib/api/error-contract.ts',
  'src/lib/api/client-error.ts',
];

describe('client-safe API error modules', () => {
  it.each(CLIENT_SAFE_ERROR_MODULES)('%s does not import next/server', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');

    expect(source).not.toMatch(/(?:import|require\s*\()[^\n]*['"]next\/server['"]/);
  });
});
