import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findPresenceMovementViolations } from '../../scripts/presence-movement-gate.mjs';

const temporaryProjects = [];

function createProject(files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'presence-movement-gate-'));
  temporaryProjects.push(projectRoot);

  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = join(projectRoot, relativePath);
    mkdirSync(join(targetPath, '..'), { recursive: true });
    writeFileSync(targetPath, contents, 'utf8');
  }

  return projectRoot;
}

afterEach(() => {
  for (const projectRoot of temporaryProjects.splice(0)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('presence movement source boundary', () => {
  it('accepts the owned atomic transport and scoped storage module', () => {
    const projectRoot = createProject({
      'src/lib/presence/location-transition-coordinator.ts':
        "export const endpoint = '/api/presence/location';",
      'src/lib/presence/storage-keys.ts':
        "export const legacyKey = 'lastSpaceId';",
    });

    expect(findPresenceMovementViolations(projectRoot)).toEqual([]);
  });

  it('rejects direct location transports and browser Knock writes', () => {
    const projectRoot = createProject({
      'src/components/UnsafePresenceClient.tsx': `
        'use client';
        fetch('/api/users/location');
        fetch('/api/presence/location');
        supabase.from('knock_requests').insert({ requester_id: 'forged' });
      `,
    });

    expect(findPresenceMovementViolations(projectRoot)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('legacy /api/users/location transport'),
        expect.stringContaining('atomic location transport outside coordinator'),
        expect.stringContaining('browser knock_requests mutation'),
      ]),
    );
  });

  it('rejects browser users writes, global keys, and unowned repository movement', () => {
    const projectRoot = createProject({
      'src/hooks/useUnsafePresence.ts': `
        'use client';
        const key = 'vo-disconnect-timestamp';
        supabase.from('users').update({ current_space_id: null });
        repository.updateLocation('user', null);
      `,
    });

    expect(findPresenceMovementViolations(projectRoot)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('legacy global Presence storage key'),
        expect.stringContaining('browser public.users mutation'),
        expect.stringContaining('legacy repository placement writer'),
      ]),
    );
  });
});
