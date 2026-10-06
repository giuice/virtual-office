import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as removeAttachmentRoute, GET as readAttachmentRoute } from '@/app/api/messages/attachment/[id]/route';
import { POST as createRoute } from '@/app/api/messages/create/route';
import { DELETE as cancelUploadRoute } from '@/app/api/messages/upload/[uploadId]/route';
import { POST as uploadRoute } from '@/app/api/messages/upload/route';
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@/lib/messaging/attachment-policy';
import { signAttachmentUrl } from '@/lib/messaging/attachment-storage';

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
}

interface RouteBody {
  success?: boolean;
  attachment?: UploadedAttachment;
  message?: {
    id: string;
    content: string;
    type: string;
    senderId: string;
    attachments?: UploadedAttachment[];
  };
  code?: string;
  error?: string;
}

interface FileSpec {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function textFile(name: string, text = `content of ${name}`): FileSpec {
  return { name, type: 'text/plain', bytes: new TextEncoder().encode(text) };
}

function decodeJwtPayload(token: string): { iat: number; exp: number } {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iat: number; exp: number };
}

// Phase 4 T12 (FR-008, FR-010, FR-011, BR-007, BR-011): real upload, create,
// cancel and read route handlers with real local sessions, the local private
// attachments bucket, and create_message_with_attachments on the local DB.
describe('message attachments (local Supabase + Storage)', () => {
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
    // Uploads are limited to 10/min per user; each test starts a fresh window.
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

  async function uploadOk(user: MessagingDbUser, conversationId: string, file: FileSpec): Promise<UploadedAttachment> {
    const result = await upload(user, conversationId, file);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.attachment).toBeDefined();
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

  async function cancel(user: MessagingDbUser, uploadId: string) {
    const request = new NextRequest(`http://localhost/api/messages/upload/${uploadId}`, { method: 'DELETE' });
    return asSession(cookiesOf(user), async () =>
      readJson(await cancelUploadRoute(request, { params: Promise.resolve({ uploadId }) })),
    );
  }

  async function readAttachment(user: MessagingDbUser, attachmentId: string, query = ''): Promise<Response> {
    const request = new NextRequest(`http://localhost/api/messages/attachment/${attachmentId}${query}`);
    return asSession(cookiesOf(user), () =>
      readAttachmentRoute(request, { params: Promise.resolve({ id: attachmentId }) }),
    );
  }

  async function removeAttachment(user: MessagingDbUser, attachmentId: string) {
    const request = new NextRequest(`http://localhost/api/messages/attachment/${attachmentId}`, { method: 'DELETE' });
    return asSession(cookiesOf(user), async () =>
      readJson(await removeAttachmentRoute(request, { params: Promise.resolve({ id: attachmentId }) })),
    );
  }

  async function pendingRow(uploadId: string) {
    const rows = await world.query<{ storage_path: string; uploader_id: string; conversation_id: string; size: number; type: string }>(
      `select storage_path, uploader_id, conversation_id, size, type
       from public.message_attachment_uploads where id = $1`,
      [uploadId],
    );
    return rows[0] ?? null;
  }

  async function objectExists(storagePath: string): Promise<boolean> {
    const rows = await world.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [
      ATTACHMENTS_BUCKET,
      storagePath,
    ]);
    return rows.length === 1;
  }

  async function messageCount(conversationId: string): Promise<number> {
    const rows = await world.query<{ count: string }>(
      `select count(*)::text as count from public.messages where conversation_id = $1`,
      [conversationId],
    );
    return Number(rows[0].count);
  }

  /** Every way a user could try to read an object of the private bucket directly. */
  async function expectStorageDenied(user: MessagingDbUser, storagePath: string) {
    const download = await user.client.storage.from(ATTACHMENTS_BUCKET).download(storagePath);
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();

    const signed = await user.client.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 60);
    expect(signed.data).toBeNull();

    const publicRead = await fetch(`${MESSAGING_API_URL}/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${storagePath}`);
    expect(publicRead.ok).toBe(false);

    const { data: session } = await user.client.auth.getSession();
    const authenticatedRead = await fetch(
      `${MESSAGING_API_URL}/storage/v1/object/authenticated/${ATTACHMENTS_BUCKET}/${storagePath}`,
      { headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}` } },
    );
    expect(authenticatedRead.ok).toBe(false);
  }

  it('creates an attachment-only message that the other member receives with every file', async () => {
    const { primary, secondary, directConversationId: conversationId } = world;
    const png = await uploadOk(primary, conversationId, { name: 'photo.png', type: 'image/png', bytes: PNG_BYTES });
    const txt = await uploadOk(primary, conversationId, textFile('notes.txt', 'T12 attachment-only body'));
    expect(png).toMatchObject({ name: 'photo.png', type: 'image/png', size: PNG_BYTES.byteLength });
    expect(await pendingRow(png.id)).toMatchObject({ uploader_id: primary.appUserId, conversation_id: conversationId });

    const activityBefore = (
      await world.query<{ last_activity: Date | null }>(`select last_activity from public.conversations where id = $1`, [conversationId])
    )[0].last_activity;
    const created = await create(primary, { conversationId, content: '', attachmentIds: [png.id, txt.id] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    // The conversation activity moves (it drives the recipients' unread badge refresh).
    const activityAfter = (
      await world.query<{ last_activity: Date | null }>(`select last_activity from public.conversations where id = $1`, [conversationId])
    )[0].last_activity;
    expect(activityAfter).not.toBeNull();
    expect(activityAfter!.getTime()).toBeGreaterThan(activityBefore?.getTime() ?? 0);
    const message = created.body.message!;
    expect(message).toMatchObject({ content: '', type: 'file', senderId: primary.appUserId });
    expect(message.attachments?.map((attachment) => attachment.id).sort()).toEqual([png.id, txt.id].sort());
    expect(message.attachments?.find((attachment) => attachment.id === png.id)).toMatchObject({
      name: 'photo.png',
      type: 'image/png',
      size: PNG_BYTES.byteLength,
      url: `/api/messages/attachment/${png.id}`,
    });

    // Moved, not copied: no pending row remains and the rows point at the objects.
    expect(await pendingRow(png.id)).toBeNull();
    expect(await pendingRow(txt.id)).toBeNull();
    const linked = await world.query<{ id: string; url: string }>(
      `select id, url from public.message_attachments where message_id = $1 order by name`,
      [message.id],
    );
    expect(linked).toHaveLength(2);
    for (const row of linked) {
      expect(row.url).toMatch(new RegExp(`^message-attachments/${conversationId}/${row.id}\\.(png|txt)$`));
      expect(await objectExists(row.url)).toBe(true);
    }

    // B sees the message with both attachments under RLS and can open the file.
    const { data: visible, error } = await secondary.client
      .from('message_attachments')
      .select('id')
      .eq('message_id', message.id);
    expect(error).toBeNull();
    expect((visible ?? []).map((row) => row.id).sort()).toEqual([png.id, txt.id].sort());
    const read = await readAttachment(secondary, txt.id);
    expect(read.status).toBe(307);
    const content = await fetch(read.headers.get('location') ?? '');
    expect(content.status).toBe(200);
    expect(await content.text()).toBe('T12 attachment-only body');

    // Content may also be omitted; only-image messages are typed image.
    const second = await uploadOk(primary, conversationId, { name: 'b.png', type: 'image/png', bytes: PNG_BYTES });
    const imageOnly = await create(primary, { conversationId, attachmentIds: [second.id] });
    expect(imageOnly.status).toBe(201);
    expect(imageOnly.body.message).toMatchObject({ content: '', type: 'image' });

    // Without attachments empty content is still rejected.
    expect((await create(primary, { conversationId, content: '  ' })).status).toBe(400);
  });

  it('rejects a sixth attachment and repeated upload ids without consuming the uploads', async () => {
    const { primary, groupConversationId: conversationId } = world;
    const uploads: UploadedAttachment[] = [];
    for (let index = 0; index < 6; index += 1) {
      uploads.push(await uploadOk(primary, conversationId, textFile(`file-${index}.txt`)));
    }
    const before = await messageCount(conversationId);

    const six = await create(primary, { conversationId, content: 'six files', attachmentIds: uploads.map((u) => u.id) });
    expect(six.status).toBe(400);
    expect(six.body.code).toBe('TOO_MANY_ATTACHMENTS');

    const repeated = await create(primary, {
      conversationId,
      content: 'repeated',
      attachmentIds: [uploads[0].id, uploads[0].id],
    });
    expect(repeated.status).toBe(400);
    expect(repeated.body.code).toBe('DUPLICATE_ATTACHMENT');

    // The database enforces the same bound behind the route.
    const { error: rpcError } = await admin.rpc('create_message_with_attachments', {
      p_conversation_id: conversationId,
      p_sender_id: primary.appUserId,
      p_content: 'rpc six',
      p_type: 'file',
      p_reply_to_id: null,
      p_client_message_id: null,
      p_upload_ids: uploads.map((u) => u.id),
    });
    expect(rpcError?.message).toBe('ATTACHMENT_COUNT_INVALID');

    expect(await messageCount(conversationId)).toBe(before);
    for (const u of uploads) expect(await pendingRow(u.id)).not.toBeNull();

    // Five is allowed.
    const five = await create(primary, { conversationId, content: 'five files', attachmentIds: uploads.slice(0, 5).map((u) => u.id) });
    expect(five.status).toBe(201);
    expect(five.body.message?.attachments).toHaveLength(5);
    expect(await pendingRow(uploads[5].id)).not.toBeNull();
  });

  it('rejects oversize and disallowed files at upload and re-checks the stored object when sending', async () => {
    const { primary, directConversationId: conversationId } = world;
    const countUploads = async () =>
      Number(
        (
          await world.query<{ count: string }>(
            `select count(*)::text as count from public.message_attachment_uploads where uploader_id = $1`,
            [primary.appUserId],
          )
        )[0].count,
      );
    const pendingBefore = await countUploads();

    const oversize = await upload(primary, conversationId, {
      name: 'big.pdf',
      type: 'application/pdf',
      bytes: new Uint8Array(MAX_ATTACHMENT_SIZE_BYTES + 1),
    });
    expect(oversize.status).toBe(413);
    expect(oversize.body.code).toBe('FILE_TOO_LARGE');

    for (const type of ['application/zip', 'text/html', 'application/octet-stream']) {
      const disallowed = await upload(primary, conversationId, { name: 'x.bin', type, bytes: Uint8Array.from([1, 2, 3]) });
      expect(disallowed.status).toBe(415);
      expect(disallowed.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(await countUploads()).toBe(pendingBefore);

    // Exactly 10 MB is accepted.
    const atLimit = await uploadOk(primary, conversationId, {
      name: 'limit.pdf',
      type: 'application/pdf',
      bytes: new Uint8Array(MAX_ATTACHMENT_SIZE_BYTES),
    });
    expect(atLimit.size).toBe(MAX_ATTACHMENT_SIZE_BYTES);

    // Link time trusts the stored object, not the pending record: an object
    // whose stored size exceeds the limit, or whose type is not allowed, is
    // refused (e.g. a bucket whose limits drifted from the policy).
    const before = await messageCount(conversationId);
    const grown = await uploadOk(primary, conversationId, textFile('grown.txt'));
    const grownRow = await pendingRow(grown.id);
    await world.query(
      `update storage.objects set metadata = jsonb_set(metadata, '{size}', to_jsonb($3::bigint))
       where bucket_id = $1 and name = $2`,
      [ATTACHMENTS_BUCKET, grownRow!.storage_path, MAX_ATTACHMENT_SIZE_BYTES + 1],
    );
    await world.query(`update public.message_attachment_uploads set size = $2 where id = $1`, [
      grown.id,
      MAX_ATTACHMENT_SIZE_BYTES + 1,
    ]);
    const grownSend = await create(primary, { conversationId, content: 'grown', attachmentIds: [grown.id] });
    expect(grownSend.status).toBe(413);
    expect(grownSend.body.code).toBe('FILE_TOO_LARGE');

    const retyped = await uploadOk(primary, conversationId, textFile('retyped.txt'));
    const retypedRow = await pendingRow(retyped.id);
    await world.query(
      `update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '"application/zip"')
       where bucket_id = $1 and name = $2`,
      [ATTACHMENTS_BUCKET, retypedRow!.storage_path],
    );
    await world.query(`update public.message_attachment_uploads set type = 'application/zip' where id = $1`, [retyped.id]);
    const retypedSend = await create(primary, { conversationId, content: 'retyped', attachmentIds: [retyped.id] });
    expect(retypedSend.status).toBe(415);
    expect(retypedSend.body.code).toBe('UNSUPPORTED_FILE_TYPE');

    // A pending record that no longer matches its object is refused too.
    const mismatched = await uploadOk(primary, conversationId, textFile('mismatch.txt'));
    await world.query(`update public.message_attachment_uploads set size = size + 1 where id = $1`, [mismatched.id]);
    const mismatchSend = await create(primary, { conversationId, content: 'mismatch', attachmentIds: [mismatched.id] });
    expect(mismatchSend.status).toBe(400);
    expect(mismatchSend.body.code).toBe('INVALID_ATTACHMENT');

    expect(await messageCount(conversationId)).toBe(before);
  });

  it("rejects another user's upload, an upload of another conversation, and non-member uploads", async () => {
    const { primary, secondary, outsider, directConversationId, groupConversationId } = world;
    const secondaryUpload = await uploadOk(secondary, directConversationId, textFile('theirs.txt'));
    const groupUpload = await uploadOk(primary, groupConversationId, textFile('group.txt'));
    const before = await messageCount(directConversationId);

    const foreign = await create(primary, {
      conversationId: directConversationId,
      content: 'foreign',
      attachmentIds: [secondaryUpload.id],
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('ATTACHMENT_NOT_FOUND');

    const otherConversation = await create(primary, {
      conversationId: directConversationId,
      content: 'other conversation',
      attachmentIds: [groupUpload.id],
    });
    expect(otherConversation.status).toBe(400);
    expect(otherConversation.body.code).toBe('ATTACHMENT_NOT_FOUND');

    // With a key the database makes the same decision.
    const keyed = await create(primary, {
      conversationId: directConversationId,
      content: 'foreign keyed',
      clientMessageId: randomUUID(),
      attachmentIds: [secondaryUpload.id],
    });
    expect(keyed.status).toBe(400);
    expect(keyed.body.code).toBe('ATTACHMENT_NOT_FOUND');

    const unknown = await create(primary, {
      conversationId: directConversationId,
      content: 'unknown',
      attachmentIds: [randomUUID()],
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('ATTACHMENT_NOT_FOUND');

    expect((await create(primary, { conversationId: directConversationId, content: 'bad', attachmentIds: ['nope'] })).status).toBe(400);

    expect(await messageCount(directConversationId)).toBe(before);
    expect(await pendingRow(secondaryUpload.id)).not.toBeNull();
    expect(await pendingRow(groupUpload.id)).not.toBeNull();

    // A non-member cannot upload into the conversation or send with uploads there.
    const outsiderUpload = await upload(outsider, directConversationId, textFile('outsider.txt'));
    expect(outsiderUpload.status).toBe(403);
    const outsiderSend = await create(outsider, {
      conversationId: directConversationId,
      content: '',
      attachmentIds: [secondaryUpload.id],
    });
    expect(outsiderSend.status).toBe(403);

    // No session: neither uploading nor cancelling is possible.
    const anonymousForm = new FormData();
    anonymousForm.append('file', new File(['x'], 'anon.txt', { type: 'text/plain' }));
    anonymousForm.append('conversationId', directConversationId);
    const anonymousUpload = await asSession([], () =>
      uploadRoute(new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: anonymousForm })),
    );
    expect(anonymousUpload.status).toBe(401);
    const anonymousCancel = await asSession([], () =>
      cancelUploadRoute(new NextRequest(`http://localhost/api/messages/upload/${secondaryUpload.id}`, { method: 'DELETE' }), {
        params: Promise.resolve({ uploadId: secondaryUpload.id }),
      }),
    );
    expect(anonymousCancel.status).toBe(401);
    expect(await pendingRow(secondaryUpload.id)).not.toBeNull();

    // Attaching to an existing message is no longer possible (bypassed limits).
    const legacy = await upload(primary, directConversationId, textFile('legacy.txt'), { messageId: randomUUID() });
    expect(legacy.status).toBe(400);
    expect(legacy.body.code).toBe('MESSAGE_ID_NOT_SUPPORTED');
  });

  it('cancelling an upload deletes its record and storage object; only the uploader can cancel', async () => {
    const { primary, secondary, directConversationId: conversationId } = world;
    const file = await uploadOk(primary, conversationId, textFile('cancel-me.txt'));
    const row = await pendingRow(file.id);
    expect(row).not.toBeNull();
    expect(await objectExists(row!.storage_path)).toBe(true);

    const byOther = await cancel(secondary, file.id);
    expect(byOther.status).toBe(404);
    expect(await pendingRow(file.id)).not.toBeNull();

    const cancelled = await cancel(primary, file.id);
    expect(cancelled.status).toBe(200);
    expect(await pendingRow(file.id)).toBeNull();
    expect(await objectExists(row!.storage_path)).toBe(false);
    const { data: info } = await admin.storage.from(ATTACHMENTS_BUCKET).info(row!.storage_path);
    expect(info).toBeNull();

    expect((await cancel(primary, file.id)).status).toBe(404);
    const sendCancelled = await create(primary, { conversationId, content: 'x', attachmentIds: [file.id] });
    expect(sendCancelled.status).toBe(400);
    expect(sendCancelled.body.code).toBe('ATTACHMENT_NOT_FOUND');

    // A sent attachment is not a pending upload: cancelling it changes nothing.
    const sentFile = await uploadOk(primary, conversationId, textFile('sent.txt'));
    expect((await create(primary, { conversationId, content: 'sent', attachmentIds: [sentFile.id] })).status).toBe(201);
    expect((await cancel(primary, sentFile.id)).status).toBe(404);
    expect(await world.query(`select 1 from public.message_attachments where id = $1`, [sentFile.id])).toHaveLength(1);

    expect((await cancel(primary, 'not-a-uuid')).status).toBe(400);
  });

  it('an upload not linked to a sent message is readable by no one, the uploader included', async () => {
    const { primary, secondary, outsider, directConversationId: conversationId } = world;
    const file = await uploadOk(primary, conversationId, textFile('unsent.txt'));
    const row = await pendingRow(file.id);

    for (const user of [primary, secondary, outsider]) {
      const response = await readAttachment(user, file.id);
      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
      await expectStorageDenied(user, row!.storage_path);

      // Pending uploads are not reachable through the Data API.
      const { data, error } = await user.client.from('message_attachment_uploads').select('id').eq('id', file.id);
      expect(data ?? []).toHaveLength(0);
      expect(error?.code).toBe('42501');

      // Nor can a signed-in user link uploads directly.
      const { error: rpcError } = await user.client.rpc('create_message_with_attachments', {
        p_conversation_id: conversationId,
        p_sender_id: primary.appUserId,
        p_content: 'direct',
        p_type: 'file',
        p_reply_to_id: null,
        p_client_message_id: null,
        p_upload_ids: [file.id],
      });
      expect(rpcError?.code).toBe('42501');
    }
    expect(await pendingRow(file.id)).not.toBeNull();
  });

  it('denies non-members and serves members a signed URL that expires', async () => {
    const { primary, secondary, outsider, directConversationId: conversationId } = world;
    const file = await uploadOk(primary, conversationId, textFile('members-only.txt', 'members only'));
    const created = await create(primary, { conversationId, content: 'for members', attachmentIds: [file.id] });
    expect(created.status).toBe(201);
    const storagePath = (await world.query<{ url: string }>(`select url from public.message_attachments where id = $1`, [file.id]))[0].url;

    // Non-member: application API, RLS, and a guessed storage path all deny.
    const outsiderRead = await readAttachment(outsider, file.id);
    expect(outsiderRead.status).toBe(403);
    expect(outsiderRead.headers.get('location')).toBeNull();
    const { data: outsiderRows } = await outsider.client.from('message_attachments').select('id').eq('id', file.id);
    expect(outsiderRows ?? []).toHaveLength(0);
    await expectStorageDenied(outsider, storagePath);

    // Members (sender and recipient) get a short-lived signed URL.
    for (const member of [primary, secondary]) {
      const response = await readAttachment(member, file.id);
      expect(response.status).toBe(307);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname).toBe(`/storage/v1/object/sign/${ATTACHMENTS_BUCKET}/${storagePath}`);
      const claims = decodeJwtPayload(location.searchParams.get('token') ?? '');
      expect(claims.exp - claims.iat).toBe(ATTACHMENT_SIGNED_URL_TTL_SECONDS);
      expect(ATTACHMENT_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
      const content = await fetch(location);
      expect(content.status).toBe(200);
      expect(await content.text()).toBe('members only');
    }

    // The same signing path stops serving the object once the URL expires.
    const shortLived = await signAttachmentUrl(admin, storagePath, 1);
    expect(shortLived).not.toBeNull();
    expect((await fetch(shortLived!)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const expired = await fetch(shortLived!);
    expect(expired.ok).toBe(false);
    expect(await expired.text()).toMatch(/exp/i);
  });

  // Phase 4 T14 (FR-011): feed file cards download through the same authorized
  // path; the signed URL then makes Storage answer as an attachment named like
  // the file, also for non-ASCII names.
  it('serves members a download under the attachment name and denies non-members', async () => {
    const { primary, secondary, outsider, directConversationId: conversationId } = world;
    const name = 'relatório de ação 2026.txt';
    const file = await uploadOk(primary, conversationId, textFile(name, 'conteúdo para baixar'));
    const created = await create(primary, { conversationId, content: '', attachmentIds: [file.id] });
    expect(created.status).toBe(201);
    const storagePath = (await world.query<{ url: string }>(`select url from public.message_attachments where id = $1`, [file.id]))[0].url;

    const outsiderDownload = await readAttachment(outsider, file.id, '?download=1');
    expect(outsiderDownload.status).toBe(403);
    expect(outsiderDownload.headers.get('location')).toBeNull();

    for (const member of [primary, secondary]) {
      const response = await readAttachment(member, file.id, '?download=1');
      expect(response.status).toBe(307);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname).toBe(`/storage/v1/object/sign/${ATTACHMENTS_BUCKET}/${storagePath}`);
      expect(location.searchParams.get('download')).toBe(name);
      const claims = decodeJwtPayload(location.searchParams.get('token') ?? '');
      expect(claims.exp - claims.iat).toBe(ATTACHMENT_SIGNED_URL_TTL_SECONDS);
      const content = await fetch(location);
      expect(content.status).toBe(200);
      const disposition = content.headers.get('content-disposition') ?? '';
      expect(disposition).toMatch(/^attachment;/);
      expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
      expect(await content.text()).toBe('conteúdo para baixar');
    }

    // Without the flag the object is still served inline (thumbnails, lightbox).
    const inline = await fetch(new URL((await readAttachment(secondary, file.id)).headers.get('location') ?? ''));
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-disposition') ?? '').not.toMatch(/^attachment/);
  });

  it('a retried send links its attachments once; a reused key with other files is rejected', async () => {
    const { primary, directConversationId: conversationId } = world;
    const clientMessageId = randomUUID();
    const first = await uploadOk(primary, conversationId, textFile('retry.txt'));

    const sent = await create(primary, { conversationId, content: 'retry', clientMessageId, attachmentIds: [first.id] });
    expect(sent.status).toBe(201);
    const replay = await create(primary, { conversationId, content: 'retry', clientMessageId, attachmentIds: [first.id] });
    expect(replay.status).toBe(200);
    expect(replay.body.message?.id).toBe(sent.body.message?.id);
    expect(replay.body.message?.attachments?.map((a) => a.id)).toEqual([first.id]);

    const other = await uploadOk(primary, conversationId, textFile('other.txt'));
    const otherFiles = await create(primary, { conversationId, content: 'retry', clientMessageId, attachmentIds: [other.id] });
    expect(otherFiles.status).toBe(409);
    expect(otherFiles.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
    expect(await pendingRow(other.id)).not.toBeNull();

    const noFiles = await create(primary, { conversationId, content: 'retry', clientMessageId });
    expect(noFiles.status).toBe(409);

    const rows = await world.query<{ id: string }>(
      `select a.id from public.message_attachments a join public.messages m on m.id = a.message_id
       where m.client_message_id = $1`,
      [clientMessageId],
    );
    expect(rows).toEqual([{ id: first.id }]);

    // Concurrent retries of one composition: one message, attachments linked once.
    const raceKey = randomUUID();
    const raceFile = await uploadOk(primary, conversationId, textFile('race.txt'));
    const body = { conversationId, content: 'race', clientMessageId: raceKey, attachmentIds: [raceFile.id] };
    const request = () =>
      new NextRequest('http://localhost/api/messages/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const results = await asSession(cookiesOf(primary), () =>
      Promise.all(Array.from({ length: 4 }, async () => readJson(await createRoute(request())))),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(results.map((result) => result.body.message?.id)).size).toBe(1);
    const raceRows = await world.query<{ message_id: string }>(
      `select message_id from public.message_attachments where id = $1`,
      [raceFile.id],
    );
    expect(raceRows).toHaveLength(1);
    expect(raceRows[0].message_id).toBe(results[0].body.message?.id);
  });

  it('signed-in users cannot write attachment rows or empty messages through the Data API', async () => {
    const { primary, directConversationId, groupConversationId } = world;
    const textMessage = await create(primary, { conversationId: directConversationId, content: 'T12 own text' });
    expect(textMessage.status).toBe(201);
    const messageId = textMessage.body.message!.id;
    const pending = await uploadOk(primary, directConversationId, textFile('pending-own.txt'));
    const pendingPath = (await pendingRow(pending.id))!.storage_path;

    // Pointing an own message at the own pending upload (or anything else).
    for (const url of [pendingPath, `message-attachments/${groupConversationId}/x.txt`, 'https://example.invalid/x.png']) {
      const { error } = await primary.client
        .from('message_attachments')
        .insert({ message_id: messageId, name: 'forged.txt', type: 'text/plain', size: 1, url });
      expect(error?.code).toBe('42501');
    }
    expect(await world.query(`select 1 from public.message_attachments where message_id = $1`, [messageId])).toHaveLength(0);

    // Empty content stays server-only (it requires attachments).
    const { error: emptyInsert } = await primary.client.from('messages').insert({
      conversation_id: directConversationId,
      sender_id: primary.appUserId,
      content: '',
      type: 'file',
      status: 'sent',
    });
    expect(emptyInsert?.code).toBe('42501');
    const { error: emptyUpdate } = await primary.client
      .from('messages')
      .update({ content: '', type: 'file' })
      .eq('id', messageId);
    expect(emptyUpdate?.code).toBe('42501');
    const stillText = await world.query<{ content: string }>(`select content from public.messages where id = $1`, [messageId]);
    expect(stillText[0].content).toBe('T12 own text');

    // Ordinary client writes the published policies allowed still work.
    const { error: textInsert } = await primary.client.from('messages').insert({
      conversation_id: directConversationId,
      sender_id: primary.appUserId,
      content: 'T12 direct text insert',
      type: 'text',
      status: 'sent',
    });
    expect(textInsert).toBeNull();
    const { error: textUpdate } = await primary.client
      .from('messages')
      .update({ content: 'T12 own text edited' })
      .eq('id', messageId);
    expect(textUpdate).toBeNull();

    // The read route signs only objects of the message's own conversation,
    // even if a row pointing elsewhere existed (trusted SQL simulates one).
    const groupPending = await uploadOk(primary, groupConversationId, textFile('elsewhere.txt'));
    const groupPath = (await pendingRow(groupPending.id))!.storage_path;
    const strayId = randomUUID();
    await world.query(
      `insert into public.message_attachments (id, message_id, name, type, size, url)
       values ($1, $2, 'stray.txt', 'text/plain', 1, $3)`,
      [strayId, messageId, groupPath],
    );
    const strayRead = await readAttachment(primary, strayId);
    expect(strayRead.status).toBe(404);
    expect(strayRead.headers.get('location')).toBeNull();
  });

  it('keeps the last attachment of an attachment-only message; the database refuses invalid links', async () => {
    const { primary, secondary, directConversationId: conversationId, groupConversationId } = world;
    const only = await uploadOk(primary, conversationId, textFile('only.txt'));
    const onlyMessage = await create(primary, { conversationId, content: '', attachmentIds: [only.id] });
    expect(onlyMessage.status).toBe(201);
    const blocked = await removeAttachment(primary, only.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('LAST_ATTACHMENT_OF_EMPTY_MESSAGE');
    expect(await world.query(`select 1 from public.message_attachments where id = $1`, [only.id])).toHaveLength(1);

    const withText = await uploadOk(primary, conversationId, textFile('with-text.txt'));
    expect((await create(primary, { conversationId, content: 'has text', attachmentIds: [withText.id] })).status).toBe(201);
    const withTextRows = await world.query<{ url: string }>(`select url from public.message_attachments where id = $1`, [withText.id]);
    expect((await removeAttachment(secondary, withText.id)).status).toBe(403);
    expect((await removeAttachment(primary, withText.id)).status).toBe(200);
    expect(await objectExists(withTextRows[0].url)).toBe(false);

    // Defense in depth in the service-only function.
    const spare = await uploadOk(primary, conversationId, textFile('spare.txt'));
    const groupMessage = await create(primary, { conversationId: groupConversationId, content: 'other conversation' });
    const base = {
      p_conversation_id: conversationId,
      p_sender_id: primary.appUserId,
      p_content: '',
      p_client_message_id: null,
      p_upload_ids: [spare.id],
    };
    const textTyped = await admin.rpc('create_message_with_attachments', { ...base, p_type: 'text', p_reply_to_id: null });
    expect(textTyped.error?.code).toBe('22023');
    const foreignReply = await admin.rpc('create_message_with_attachments', {
      ...base,
      p_type: 'file',
      p_reply_to_id: groupMessage.body.message?.id,
    });
    expect(foreignReply.error?.code).toBe('22023');
    expect(foreignReply.error?.message).toBe('INVALID_REPLY_TARGET');
    expect(await pendingRow(spare.id)).not.toBeNull();
  });

  it("removes the uploader's pending uploads abandoned for more than a day on their next upload", async () => {
    const { primary, secondary, directConversationId: conversationId } = world;
    const abandoned = await uploadOk(primary, conversationId, textFile('abandoned.txt'));
    const recent = await uploadOk(primary, conversationId, textFile('recent.txt'));
    const othersAbandoned = await uploadOk(secondary, conversationId, textFile('others.txt'));
    const abandonedPath = (await pendingRow(abandoned.id))!.storage_path;
    await world.query(
      `update public.message_attachment_uploads set created_at = now() - interval '25 hours' where id = any($1::uuid[])`,
      [[abandoned.id, othersAbandoned.id]],
    );

    await uploadOk(primary, conversationId, textFile('trigger.txt'));

    expect(await pendingRow(abandoned.id)).toBeNull();
    expect(await objectExists(abandonedPath)).toBe(false);
    expect(await pendingRow(recent.id)).not.toBeNull();
    // Another user's stale upload is theirs to sweep.
    expect(await pendingRow(othersAbandoned.id)).not.toBeNull();
  });
});
