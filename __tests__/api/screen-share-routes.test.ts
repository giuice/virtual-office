import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getActiveScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/active/route';
import { POST as claimScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/claim/route';
import { POST as releaseScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/release/route';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTER_ID = '33333333-3333-4333-8333-333333333333';
const PRESENCE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SHARE_ID = '66666666-6666-4666-8666-666666666666';
const AUTH_SESSION_ID = '88888888-8888-4888-8888-888888888888';
const EXPIRES_AT = '2026-07-23T12:00:00.000Z';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

function context() {
  return { params: Promise.resolve({ spaceId: SPACE_ID }) };
}

function claimRequest(): Request {
  return new Request('http://test.local/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presenceSessionId: PRESENCE_SESSION_ID, shareId: SHARE_ID }),
  });
}

function activeRequest(): Request {
  return new Request(
    `http://test.local/active?presenceSessionId=${PRESENCE_SESSION_ID}`,
  );
}

function activeSuccess(name = 'Locked presenter') {
  return {
    ok: true,
    code: 'ACTIVE_READ',
    active: {
      spaceId: SPACE_ID,
      presenterUserId: PRESENTER_ID,
      presenterName: name,
      shareId: SHARE_ID,
      expiresAt: EXPIRES_AT,
    },
  };
}

function claimSuccess(name = 'Locked presenter') {
  return {
    ok: true,
    code: 'CLAIMED',
    shareId: SHARE_ID,
    expiresAt: EXPIRES_AT,
    presenterName: name,
  };
}

function primeAuth(companyId: string | null = COMPANY_ID): void {
  mocks.requireVerifiedPresenceAuth.mockResolvedValue({
    ok: true,
    identity: {
      appUserId: PRESENTER_ID,
      authSubject: '77777777-7777-4777-8777-777777777777',
      companyId,
      authSessionId: AUTH_SESSION_ID,
      displayName: 'Untrusted snapshot',
    },
    admin: { rpc: mocks.rpc, from: mocks.from },
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const operations = [
  {
    name: 'claim',
    invoke: () => claimScreenShare(claimRequest(), context()),
    canonical: claimSuccess(),
  },
  {
    name: 'release',
    invoke: () => releaseScreenShare(claimRequest(), context()),
    canonical: { ok: true, code: 'RELEASED', alreadyReleased: false },
  },
  {
    name: 'active',
    invoke: () => getActiveScreenShare(activeRequest(), context()),
    canonical: activeSuccess(),
  },
] as const;

describe('screen-share observed RPC HTTP boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    primeAuth();
  });

  it('uses the canonical presenter name returned by the locked claim RPC, never the identity snapshot', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: claimSuccess(' Locked presenter '), error: null });

    const response = await claimScreenShare(claimRequest(), context());

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      success: true,
      share: { presenterName: 'Locked presenter' },
    });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_screen_share_observed', {
      p_auth_subject: '77777777-7777-4777-8777-777777777777',
      p_auth_session_id: AUTH_SESSION_ID,
      p_presence_session_id: PRESENCE_SESSION_ID,
      p_space_id: SPACE_ID,
      p_share_id: SHARE_ID,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses one canonical active RPC snapshot and never queries users', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: activeSuccess(' Locked presenter '), error: null });

    const response = await getActiveScreenShare(activeRequest(), context());

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      success: true,
      active: { presenterName: 'Locked presenter' },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ['claim', () => claimScreenShare(claimRequest(), context()), { ok: true, code: 'CLAIMED', shareId: SHARE_ID, expiresAt: EXPIRES_AT }],
    ['active', () => getActiveScreenShare(activeRequest(), context()), {
      ok: true,
      code: 'ACTIVE_READ',
      active: { ...activeSuccess().active, presenterName: undefined },
    }],
  ] as const)('rejects missing presenterName from the $name RPC as compatibility failure', async (_name, invoke, data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await body(response)).toMatchObject({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
    });
  });

  it.each([
    ['claim', claimSuccess(), (value: Record<string, unknown>) => ({ ...value, presenterName: '   ' })],
    ['active', activeSuccess(), (value: Record<string, unknown>) => ({
      ...value,
      active: { ...(value.active as Record<string, unknown>), presenterName: '   ' },
    })],
  ] as const)('rejects invalid presenterName from the $name RPC as compatibility failure', async (_name, canonical, corrupt) => {
    mocks.rpc.mockResolvedValueOnce({ data: corrupt(canonical), error: null });

    const response = await (_name === 'claim'
      ? claimScreenShare(claimRequest(), context())
      : getActiveScreenShare(activeRequest(), context()));

    expect(response.status).toBe(426);
  });

  it.each([
    ['claim', () => claimScreenShare(claimRequest(), context()), { ...claimSuccess(), extra: true }],
    ['active', () => getActiveScreenShare(activeRequest(), context()), { ...activeSuccess(), extra: true }],
  ] as const)('rejects extra fields from the $name RPC as compatibility failure without retrying', async (_name, invoke, data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(operations)('retries exactly once for the strict structural result and uses the second $name outcome', async ({ invoke, canonical }) => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null })
      .mockResolvedValueOnce({ data: canonical, error: null });

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(operations)('maps a second strict structural result to 503 for $name', async ({ invoke }) => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null })
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(503);
    expect(await body(response)).toMatchObject({ success: false, code: 'SERVICE_UNAVAILABLE' });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(operations)('does not retry malformed provider payloads for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET', extra: true }, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(operations)('does not retry provider errors for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private provider failure' } });

    const response = await invoke();

    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await body(response))).not.toContain('private provider failure');
  });

  it.each(['claim', 'active'] as const)('maps profile-invalid $name results to a terminal sanitized response without raw names', async (operation) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'PRESENTER_PROFILE_INVALID' }, error: null });

    const response = await (operation === 'claim'
      ? claimScreenShare(claimRequest(), context())
      : getActiveScreenShare(activeRequest(), context()));
    const result = await body(response);

    expect(response.status).toBe(409);
    expect(result).toMatchObject({ success: false, code: 'PRESENTER_PROFILE_INVALID' });
    expect(JSON.stringify(result)).not.toContain('Untrusted snapshot');
  });

  it.each(operations)('returns static no-company identity as 403 without an RPC for $name', async ({ invoke }) => {
    primeAuth(null);

    const response = await invoke();

    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ success: false, code: 'MEMBERSHIP_SCOPE_INVALID' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(operations)('maps a post-snapshot membership/session change from locked SQL to 409 for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'SESSION_INVALID' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({ success: false, code: 'SESSION_INVALID' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
