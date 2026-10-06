import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as readAttachmentRoute } from '@/app/api/messages/attachment/[id]/route';
import { POST as createRoute } from '@/app/api/messages/create/route';
import { GET as getMessagesRoute } from '@/app/api/messages/get/route';
import { POST as uploadRoute } from '@/app/api/messages/upload/route';
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_BUCKET_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_VOICE_NOTE_DURATION_SECONDS,
  VOICE_NOTE_WAVEFORM_MAX_SAMPLES,
  maxVoiceNoteSizeBytes,
} from '@/lib/messaging/attachment-policy';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface UploadedAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  duration?: number;
  waveformData?: number[];
}

interface RouteBody {
  attachment?: UploadedAttachment;
  message?: { id: string; content: string; type: string; attachments?: UploadedAttachment[] };
  messages?: { id: string; attachments?: UploadedAttachment[] }[];
  code?: string;
}

interface FileSpec {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

const MIGRATION_FILE = path.resolve(__dirname, '../../supabase/migrations/20261005141134_voice_note_attachments.sql');

// Container headers the server sniffs: a WebM EBML header (doc type "webm")
// and an MP4 `ftyp` box, followed by filler standing in for audio frames.
const WEBM_HEADER = [
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
  0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02,
];
const MP4_HEADER = [
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x00, 0x00, 0x4d, 0x34, 0x41,
  0x20, 0x6d, 0x70, 0x34, 0x32,
];

function container(header: readonly number[], totalSize = 4096): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(totalSize);
  bytes.set(header);
  for (let index = header.length; index < totalSize; index += 1) bytes[index] = index % 251;
  return bytes;
}

function webm(name = 'voice-note.webm', type = 'audio/webm;codecs=opus', totalSize?: number): FileSpec {
  return { name, type, bytes: container(WEBM_HEADER, totalSize) };
}

function mp4(name = 'voice-note.m4a', type = 'audio/mp4'): FileSpec {
  return { name, type, bytes: container(MP4_HEADER) };
}

function waveform(samples = 64): number[] {
  return Array.from({ length: samples }, (_, index) => ((index * 37) % 100) / 100);
}

function voiceFields(duration: string, wave: unknown = waveform()): Record<string, string> {
  return { kind: 'voice', duration, waveform: typeof wave === 'string' ? wave : JSON.stringify(wave) };
}

// Phase 4 T15 (FR-018, BR-006, BR-008, BR-011, AC-021): real upload, create,
// feed and read route handlers with local sessions, the local private
// attachments bucket, and the migrated local database.
describe('voice notes (local Supabase + Storage)', () => {
  let world: MessagingDbWorld;
  let admin: SupabaseClient;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 0 });
    admin = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const user of [world.primary, world.secondary, world.outsider]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  beforeEach(async () => {
    // Uploads are rate limited per user; each test starts a fresh window.
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [
      [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId],
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      const conversations = [world.directConversationId, world.groupConversationId, world.roomConversationId];
      const objects = await world.query<{ name: string }>(
        `select name from storage.objects
         where bucket_id = $1 and split_part(name, '/', 2) = any($2::text[])`,
        [ATTACHMENTS_BUCKET, conversations],
      );
      if (objects.length > 0) {
        await admin.storage.from(ATTACHMENTS_BUCKET).remove(objects.map((object) => object.name));
      }
      await world.cleanup();
    }
  });

  function cookiesOf(user: MessagingDbUser): SessionCookie[] {
    return sessions.get(user.appUserId) ?? [];
  }

  async function readJson(response: Response) {
    return { status: response.status, body: (await response.json()) as RouteBody };
  }

  async function upload(user: MessagingDbUser, conversationId: string, file: FileSpec, extra: Record<string, string> = {}) {
    const form = new FormData();
    form.append('file', new File([file.bytes], file.name, { type: file.type }));
    form.append('conversationId', conversationId);
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    const request = new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: form });
    return asSession(cookiesOf(user), async () => readJson(await uploadRoute(request)));
  }

  async function uploadOk(
    user: MessagingDbUser,
    conversationId: string,
    file: FileSpec,
    extra: Record<string, string> = {},
  ): Promise<UploadedAttachment> {
    const result = await upload(user, conversationId, file, extra);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.attachment as UploadedAttachment;
  }

  async function create(user: MessagingDbUser, body: Record<string, unknown>) {
    const request = new NextRequest('http://localhost/api/messages/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return asSession(cookiesOf(user), async () => readJson(await createRoute(request)));
  }

  async function readAttachment(user: MessagingDbUser, attachmentId: string): Promise<Response> {
    const request = new NextRequest(`http://localhost/api/messages/attachment/${attachmentId}`);
    return asSession(cookiesOf(user), () => readAttachmentRoute(request, { params: Promise.resolve({ id: attachmentId }) }));
  }

  async function pendingRow(uploadId: string) {
    const rows = await world.query<{ storage_path: string; type: string; size: number; duration: number | null; waveform_data: unknown }>(
      `select storage_path, type, size, duration, waveform_data from public.message_attachment_uploads where id = $1`,
      [uploadId],
    );
    return rows[0] ?? null;
  }

  async function requirePending(uploadId: string) {
    const row = await pendingRow(uploadId);
    if (!row) throw new Error(`pending upload ${uploadId} not found`);
    return row;
  }

  /** Pending uploads and stored objects of the primary user (refusals must add neither). */
  async function storedFootprint(conversationId: string) {
    const [uploads] = await world.query<{ count: string }>(
      `select count(*)::text as count from public.message_attachment_uploads where uploader_id = $1`,
      [world.primary.appUserId],
    );
    const [objects] = await world.query<{ count: string }>(
      `select count(*)::text as count from storage.objects where bucket_id = $1 and split_part(name, '/', 2) = $2`,
      [ATTACHMENTS_BUCKET, conversationId],
    );
    return { uploads: Number(uploads.count), objects: Number(objects.count) };
  }

  async function messageCount(conversationId: string): Promise<number> {
    const rows = await world.query<{ count: string }>(
      `select count(*)::text as count from public.messages where conversation_id = $1`,
      [conversationId],
    );
    return Number(rows[0].count);
  }

  it('stores a voice note with duration and waveform in the private bucket and links it to a message', async () => {
    const { primary, secondary, outsider, directConversationId: conversationId } = world;
    const wave = [...waveform(63), 0.12345];
    const voice = await uploadOk(primary, conversationId, webm(), voiceFields('42.3', wave));
    // Codec parameters are dropped; duration is stored in whole seconds (rounded up).
    expect(voice).toMatchObject({ type: 'audio/webm', duration: 43, url: `/api/messages/attachment/${voice.id}` });
    expect(voice.waveformData).toHaveLength(64);
    expect(voice.waveformData?.[63]).toBe(0.123);

    const pending = await requirePending(voice.id);
    expect(pending).toMatchObject({ type: 'audio/webm', duration: 43 });
    expect(pending.waveform_data).toEqual(voice.waveformData);
    const [object] = await world.query<{ mimetype: string; public: boolean }>(
      `select o.metadata->>'mimetype' as mimetype, b.public
       from storage.objects o join storage.buckets b on b.id = o.bucket_id
       where o.bucket_id = $1 and o.name = $2`,
      [ATTACHMENTS_BUCKET, pending.storage_path],
    );
    expect(object).toEqual({ mimetype: 'audio/webm', public: false });

    const created = await create(primary, { conversationId, content: '', attachmentIds: [voice.id] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.message).toMatchObject({ content: '', type: 'file' });
    expect(created.body.message?.attachments).toHaveLength(1);
    expect(created.body.message?.attachments?.[0]).toMatchObject({
      id: voice.id,
      type: 'audio/webm',
      duration: 43,
      waveformData: voice.waveformData,
    });
    expect(await pendingRow(voice.id)).toBeNull();
    const [linked] = await world.query<{ url: string; duration: number; waveform_data: unknown }>(
      `select url, duration, waveform_data from public.message_attachments where id = $1`,
      [voice.id],
    );
    expect(linked).toMatchObject({ url: pending.storage_path, duration: 43, waveform_data: voice.waveformData });

    // The other member gets it in the feed (user client under RLS) and can play the bytes.
    const feed = await asSession(cookiesOf(secondary), async () =>
      readJson(await getMessagesRoute(new NextRequest(`http://localhost/api/messages/get?conversationId=${conversationId}`))),
    );
    expect(feed.status).toBe(200);
    const inFeed = feed.body.messages?.find((message) => message.id === created.body.message?.id);
    expect(inFeed?.attachments?.[0]).toMatchObject({ id: voice.id, duration: 43, waveformData: voice.waveformData });
    const read = await readAttachment(secondary, voice.id);
    expect(read.status).toBe(307);
    const content = await fetch(read.headers.get('location') ?? '');
    expect(content.status).toBe(200);
    expect(content.headers.get('content-type')).toBe('audio/webm');
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(webm().bytes);

    // A non-member gets nothing: API, RLS, and the private bucket.
    expect((await readAttachment(outsider, voice.id)).status).toBe(403);
    const { data: outsiderRows } = await outsider.client.from('message_attachments').select('id').eq('id', voice.id);
    expect(outsiderRows ?? []).toHaveLength(0);
    const outsiderDownload = await outsider.client.storage.from(ATTACHMENTS_BUCKET).download(pending.storage_path);
    expect(outsiderDownload.data).toBeNull();
    const publicRead = await fetch(`${MESSAGING_API_URL}/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${pending.storage_path}`);
    expect(publicRead.ok).toBe(false);

    // MP4 (Safari's recording format) at exactly two minutes, with text and a retry key.
    const clientMessageId = randomUUID();
    const atLimit = await uploadOk(primary, conversationId, mp4(), voiceFields(String(MAX_VOICE_NOTE_DURATION_SECONDS)));
    expect(atLimit).toMatchObject({ type: 'audio/mp4', duration: 120 });
    const withText = await create(primary, { conversationId, content: 'ouça', clientMessageId, attachmentIds: [atLimit.id] });
    expect(withText.status).toBe(201);
    expect(withText.body.message?.attachments?.[0]).toMatchObject({ type: 'audio/mp4', duration: 120 });
    const replay = await create(primary, { conversationId, content: 'ouça', clientMessageId, attachmentIds: [atLimit.id] });
    expect(replay.status).toBe(200);
    expect(replay.body.message?.id).toBe(withText.body.message?.id);
  });

  it('refuses voice notes longer than two minutes or without valid metadata, storing nothing', async () => {
    const { primary, directConversationId: conversationId } = world;
    const before = await storedFootprint(conversationId);

    for (const duration of ['120.001', '121', '600']) {
      const result = await upload(primary, conversationId, webm(), voiceFields(duration));
      expect(result.status, duration).toBe(400);
      expect(result.body.code, duration).toBe('VOICE_NOTE_TOO_LONG');
    }
    for (const duration of ['0', '-1', 'abc', '', '1e2', 'NaN']) {
      const result = await upload(primary, conversationId, webm(), voiceFields(duration));
      expect(result.status, duration).toBe(400);
      expect(result.body.code, duration).toBe('INVALID_VOICE_NOTE_DURATION');
    }
    const noDuration = await upload(primary, conversationId, webm(), { kind: 'voice', waveform: JSON.stringify(waveform()) });
    expect(noDuration.body.code).toBe('INVALID_VOICE_NOTE_DURATION');

    const badWaveforms: unknown[] = [
      'not json',
      {},
      [],
      waveform(VOICE_NOTE_WAVEFORM_MAX_SAMPLES + 1),
      [0.5, 1.5],
      [-0.1],
      ['0.5'],
      [[0.1]],
      [null],
    ];
    for (const wave of badWaveforms) {
      const result = await upload(primary, conversationId, webm(), voiceFields('10', wave));
      expect(result.status, JSON.stringify(wave)).toBe(400);
      expect(result.body.code, JSON.stringify(wave)).toBe('INVALID_VOICE_NOTE_WAVEFORM');
    }
    const noWaveform = await upload(primary, conversationId, webm(), { kind: 'voice', duration: '10' });
    expect(noWaveform.body.code).toBe('INVALID_VOICE_NOTE_WAVEFORM');

    expect(await storedFootprint(conversationId)).toEqual(before);

    // The largest waveform is accepted.
    const longest = await uploadOk(primary, conversationId, webm(), voiceFields('10', waveform(VOICE_NOTE_WAVEFORM_MAX_SAMPLES)));
    expect(longest.waveformData).toHaveLength(VOICE_NOTE_WAVEFORM_MAX_SAMPLES);
  });

  it('refuses audio as a regular attachment and voice notes whose file does not fit', async () => {
    const { primary, outsider, directConversationId: conversationId } = world;
    const before = await storedFootprint(conversationId);

    // Audio without kind=voice is a regular attachment: refused.
    for (const file of [webm(), webm('a.webm', 'audio/webm'), mp4(), { ...mp4('a.mp3'), type: 'audio/mpeg' }, { ...webm('a.ogg'), type: 'audio/ogg' }]) {
      const result = await upload(primary, conversationId, file);
      expect(result.status, file.type).toBe(415);
      expect(result.body.code, file.type).toBe('UNSUPPORTED_FILE_TYPE');
    }
    // Duration and waveform alone do not make a voice note.
    const unmarked = await upload(primary, conversationId, webm(), { duration: '10', waveform: JSON.stringify(waveform()) });
    expect(unmarked.status).toBe(415);

    // A voice note must be WebM or MP4 audio whose bytes match the type.
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    for (const file of [
      { name: 'x.png', type: 'image/png', bytes: png },
      { ...webm('x.mp3'), type: 'audio/mpeg' },
      { ...webm('x.ogg'), type: 'audio/ogg' },
      { name: 'x.webm', type: 'audio/webm', bytes: new TextEncoder().encode('<html>not audio</html>') },
      { ...webm('x.m4a'), type: 'audio/mp4' },
    ]) {
      const result = await upload(primary, conversationId, file, voiceFields('10'));
      expect(result.status, file.name).toBe(415);
      expect(result.body.code, file.name).toBe('UNSUPPORTED_FILE_TYPE');
    }

    // Larger than ten seconds of audio can be at the bitrate bound.
    const tooLarge = await upload(primary, conversationId, webm('big.webm', 'audio/webm', maxVoiceNoteSizeBytes(10) + 1), voiceFields('10'));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe('VOICE_NOTE_TOO_LARGE');
    expect(maxVoiceNoteSizeBytes(MAX_VOICE_NOTE_DURATION_SECONDS)).toBeLessThan(MAX_ATTACHMENT_SIZE_BYTES);

    expect((await upload(primary, conversationId, webm(), { ...voiceFields('10'), kind: 'audio' })).body.code).toBe('INVALID_UPLOAD_KIND');
    expect((await upload(outsider, conversationId, webm(), voiceFields('10'))).status).toBe(403);

    expect(await storedFootprint(conversationId)).toEqual(before);

    // Exactly at the bound is accepted.
    const atBound = await uploadOk(primary, conversationId, webm('bound.webm', 'audio/webm', maxVoiceNoteSizeBytes(10)), voiceFields('9.2'));
    expect(atBound).toMatchObject({ duration: 10, size: maxVoiceNoteSizeBytes(10) });

    // The stored object's extension follows the container, not the client's name.
    const renamed = await uploadOk(primary, conversationId, webm('payload.html'), voiceFields('3'));
    expect(renamed.name).toBe('payload.html');
    expect((await requirePending(renamed.id)).storage_path).toBe(`message-attachments/${conversationId}/${renamed.id}.webm`);
    const safari = await uploadOk(primary, conversationId, mp4('gravação'), voiceFields('3'));
    expect((await requirePending(safari.id)).storage_path).toBe(`message-attachments/${conversationId}/${safari.id}.m4a`);
  });

  it('sends a voice note alone and re-checks the stored voice object when sending', async () => {
    const { primary, directConversationId: conversationId, groupConversationId } = world;
    const voice = await uploadOk(primary, conversationId, webm(), voiceFields('5'));
    const text = await uploadOk(primary, conversationId, {
      name: 'notes.txt',
      type: 'text/plain',
      bytes: new TextEncoder().encode('notes'),
    });
    const before = await messageCount(conversationId);

    const together = await create(primary, { conversationId, content: '', attachmentIds: [voice.id, text.id] });
    expect(together.status).toBe(400);
    expect(together.body.code).toBe('VOICE_NOTE_NOT_ALONE');

    // The database refuses the same, and a voice message not typed file.
    const base = { p_conversation_id: conversationId, p_sender_id: primary.appUserId, p_content: '', p_reply_to_id: null, p_client_message_id: null };
    const rpcTogether = await admin.rpc('create_message_with_attachments', { ...base, p_type: 'file', p_upload_ids: [voice.id, text.id] });
    expect(rpcTogether.error?.message).toBe('VOICE_NOTE_NOT_ALONE');
    const rpcImage = await admin.rpc('create_message_with_attachments', { ...base, p_type: 'image', p_upload_ids: [voice.id] });
    expect(rpcImage.error?.code).toBe('22023');

    expect(await messageCount(conversationId)).toBe(before);
    expect(await pendingRow(voice.id)).not.toBeNull();
    expect(await pendingRow(text.id)).not.toBeNull();

    // Link time trusts the stored object: an object retyped to a non-voice
    // audio type, or grown beyond the duration's bound, is refused.
    const retyped = await uploadOk(primary, conversationId, webm(), voiceFields('5'));
    const retypedPath = (await requirePending(retyped.id)).storage_path;
    await world.query(
      `update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '"audio/mpeg"') where bucket_id = $1 and name = $2`,
      [ATTACHMENTS_BUCKET, retypedPath],
    );
    await world.query(`update public.message_attachment_uploads set type = 'audio/mpeg' where id = $1`, [retyped.id]);
    const retypedSend = await create(primary, { conversationId, content: '', attachmentIds: [retyped.id] });
    expect(retypedSend.status).toBe(415);
    expect(retypedSend.body.code).toBe('UNSUPPORTED_FILE_TYPE');

    const grown = await uploadOk(primary, conversationId, webm(), voiceFields('5'));
    const grownPath = (await requirePending(grown.id)).storage_path;
    const grownSize = maxVoiceNoteSizeBytes(5) + 1;
    await world.query(
      `update storage.objects set metadata = jsonb_set(metadata, '{size}', to_jsonb($3::bigint)) where bucket_id = $1 and name = $2`,
      [ATTACHMENTS_BUCKET, grownPath, grownSize],
    );
    await world.query(`update public.message_attachment_uploads set size = $2 where id = $1`, [grown.id, grownSize]);
    const grownSend = await create(primary, { conversationId, content: '', attachmentIds: [grown.id] });
    expect(grownSend.status).toBe(413);
    expect(grownSend.body.code).toBe('VOICE_NOTE_TOO_LARGE');
    expect(await messageCount(conversationId)).toBe(before);

    // A voice note of another conversation cannot be sent here.
    const elsewhere = await uploadOk(primary, groupConversationId, webm(), voiceFields('5'));
    const misplaced = await create(primary, { conversationId, content: '', attachmentIds: [elsewhere.id] });
    expect(misplaced.body.code).toBe('ATTACHMENT_NOT_FOUND');

    // Alone it is sent.
    const alone = await create(primary, { conversationId, content: '', attachmentIds: [voice.id] });
    expect(alone.status).toBe(201);
    expect(alone.body.message?.attachments?.map((attachment) => attachment.id)).toEqual([voice.id]);
  });

  it('the database refuses audio rows without valid voice metadata, whoever writes them', async () => {
    const { primary, directConversationId: conversationId } = world;
    const message = await create(primary, { conversationId, content: 'T15 host message' });
    expect(message.status).toBe(201);
    const messageId = message.body.message?.id ?? '';
    const insertAttachment = (type: string, duration: number | null, wave: string | null) =>
      world.query(
        `insert into public.message_attachments (message_id, name, type, size, url, duration, waveform_data)
         values ($1, 'probe', $2, 1, 'message-attachments/probe/probe.webm', $3, $4::jsonb)`,
        [messageId, type, duration, wave],
      );
    const insertPending = (type: string, duration: number | null, wave: string | null) =>
      world.query(
        `insert into public.message_attachment_uploads (conversation_id, uploader_id, storage_path, name, type, size, duration, waveform_data)
         values ($1, $2, $3, 'probe', $4, 1, $5, $6::jsonb)`,
        [conversationId, primary.appUserId, `message-attachments/${conversationId}/${randomUUID()}.webm`, type, duration, wave],
      );
    const valid = JSON.stringify(waveform(8));

    for (const insert of [insertAttachment, insertPending]) {
      for (const [type, duration, wave] of [
        ['audio/webm', null, null],
        ['audio/webm', 121, valid],
        ['AUDIO/MP4', 0, valid],
        ['audio/webm', 10, null],
        ['audio/webm', 10, '[]'],
        ['audio/webm', 10, '[1.01]'],
        ['audio/webm', 10, '{"a": 1}'],
        ['audio/webm', 10, '0.5'],
        ['audio/webm', 10, '["0.5"]'],
        ['audio/webm', 10, '[null]'],
        ['audio/webm', 10, '[[0.1]]'],
        ['audio/webm', 10, '[-0.1]'],
        ['audio/webm', 10, JSON.stringify(waveform(257))],
      ] as const) {
        await expect(insert(type, duration, wave), `${type} ${duration} ${wave}`).rejects.toMatchObject({ code: '23514' });
      }
    }
    // Pending non-audio uploads carry no voice metadata.
    await expect(insertPending('text/plain', 10, valid)).rejects.toMatchObject({ code: '23514' });
    // Locally the check was validated (no legacy audio rows).
    const [constraint] = await world.query<{ convalidated: boolean }>(
      `select convalidated from pg_constraint where conname = 'message_attachments_voice_note_check'`,
    );
    expect(constraint.convalidated).toBe(true);
    // Valid voice rows and ordinary attachments are accepted.
    await insertAttachment('audio/webm', 120, valid);
    await insertAttachment('text/plain', null, null);
    await insertPending('audio/mp4', 1, valid);
    await world.query(`delete from public.message_attachment_uploads where uploader_id = $1 and name = 'probe'`, [primary.appUserId]);
  });

  it('the local bucket allowlist matches the policy and the migration', async () => {
    const [bucket] = await world.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = $1`,
      [ATTACHMENTS_BUCKET],
    );
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(MAX_ATTACHMENT_SIZE_BYTES);
    expect([...bucket.allowed_mime_types].sort()).toEqual([...ATTACHMENT_BUCKET_MIME_TYPES].sort());
    expect(bucket.allowed_mime_types).toEqual(expect.arrayContaining(['audio/webm', 'audio/mp4']));

    const sql = readFileSync(MIGRATION_FILE, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const list = /allowed_mime_types\s*=\s*array\[([^\]]+)\]/.exec(sql)?.[1] ?? '';
    const migrationTypes = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect([...migrationTypes].sort()).toEqual([...bucket.allowed_mime_types].sort());

    // The bucket itself refuses other audio, even for the service role.
    const mp3Path = `message-attachments/${world.directConversationId}/${randomUUID()}.mp3`;
    const refused = await admin.storage.from(ATTACHMENTS_BUCKET).upload(mp3Path, webm().bytes, { contentType: 'audio/mpeg' });
    expect(refused.error).not.toBeNull();
    expect(await world.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [ATTACHMENTS_BUCKET, mp3Path])).toHaveLength(0);
  });
});
