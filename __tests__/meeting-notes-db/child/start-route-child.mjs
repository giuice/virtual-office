// Child process that runs the REAL start route (POST
// /api/meeting-notes/[id]/ai/process) in-process, for the T12 tests that need
// a separate server process: a crash after dispatch (killed by the parent), a
// restart with the same ticket secret, NODE_ENV=production, and a lost RPC
// reply. The route's TypeScript graph is loaded with jiti (the same `@/` and
// `server-only` aliases as the Vitest config); `next/headers` is the cookie
// shim next to this file. Every value it needs (local Supabase URL/keys,
// ticket secret, fake AI override, NODE_ENV) comes from the environment the
// parent passes.
//
// IPC protocol (child_process.fork):
//   child → parent { type: 'ready' } once the route module is loaded;
//   parent → child { type: 'start', id, noteId, ticket, cookies };
//   child → parent { type: 'result', id, status, body }.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const jiti = createJiti(import.meta.url, {
  alias: {
    '@/': `${path.join(root, 'src')}/`,
    'server-only': path.join(root, 'node_modules/next/dist/compiled/server-only/empty.js'),
    'next/headers': path.join(here, 'next-headers-shim.mjs'),
  },
  moduleCache: true,
});

// Network fault: when MEETING_NOTES_CHILD_DROP_RPC_REPLY names an RPC, its
// request reaches the local database and commits, then the reply is lost
// (the caller sees a fetch failure). Installed before the route loads.
const dropReplyOf = process.env.MEETING_NOTES_CHILD_DROP_RPC_REPLY;
if (dropReplyOf) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const response = await realFetch(input, init);
    if (url.includes(`/rest/v1/rpc/${dropReplyOf}`)) {
      await response.arrayBuffer();
      throw new TypeError('fetch failed');
    }
    return response;
  };
}

const route = await jiti.import(path.join(root, 'src/app/api/meeting-notes/[id]/ai/process/route.ts'));
const { NextRequest } = await jiti.import('next/server');

process.on('message', async (message) => {
  if (!message || message.type !== 'start') return;
  globalThis.__meetingNotesChildCookies = message.cookies;
  try {
    const request = new NextRequest(`http://localhost/api/meeting-notes/${message.noteId}/ai/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: message.ticket }),
    });
    const response = await route.POST(request, { params: Promise.resolve({ id: message.noteId }) });
    const body = await response.json();
    process.send?.({ type: 'result', id: message.id, status: response.status, body });
  } catch (error) {
    process.send?.({ type: 'result', id: message.id, status: -1, body: { error: error instanceof Error ? error.name : 'unknown' } });
  }
});

process.send?.({ type: 'ready' });
