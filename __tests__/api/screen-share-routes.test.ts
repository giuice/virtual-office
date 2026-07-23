import { describe, expect, it } from 'vitest';
import {
  screenShareClaimRequestSchema,
  screenSharePublicShareSchema,
  screenShareSignalingPayloadSchema,
} from '@/lib/webrtc/screen-share-contract';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTER_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_ID = '44444444-4444-4444-8444-444444444444';
const PRESENCE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SHARE_ID = '66666666-6666-4666-8666-666666666666';
const EXPIRES_AT = '2026-07-23T12:00:00.000Z';

describe('screen-share contract boundaries', () => {
  it('accepts only client-fence IDs for claims', () => {
    expect(screenShareClaimRequestSchema.safeParse({
      presenceSessionId: PRESENCE_SESSION_ID,
      shareId: SHARE_ID,
    }).success).toBe(true);

    expect(screenShareClaimRequestSchema.safeParse({
      presenceSessionId: PRESENCE_SESSION_ID,
      shareId: SHARE_ID,
      companyId: COMPANY_ID,
    }).success).toBe(false);
    expect(screenShareClaimRequestSchema.safeParse({ shareId: SHARE_ID }).success).toBe(false);
  });

  it('keeps canonical public presentation data limited to safe fields', () => {
    const publicShare = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: PRESENTER_ID,
      presenterName: 'Presenter',
      shareId: SHARE_ID,
      expiresAt: EXPIRES_AT,
    };

    expect(screenSharePublicShareSchema.safeParse(publicShare).success).toBe(true);
    expect(screenSharePublicShareSchema.safeParse({
      ...publicShare,
      authSessionId: PRESENCE_SESSION_ID,
    }).success).toBe(false);
  });

  it.each([
    {
      type: 'handshake',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    },
    {
      type: 'description',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      description: { type: 'offer', sdp: 'v=0' },
    },
    {
      type: 'ice',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
    },
    {
      type: 'presenter-hint',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      presenterUserId: PRESENTER_ID,
      presenterName: 'Presenter',
      expiresAt: EXPIRES_AT,
    },
  ])('parses scoped $type signaling payloads', (payload) => {
    expect(screenShareSignalingPayloadSchema.safeParse(payload).success).toBe(true);
    expect(screenShareSignalingPayloadSchema.safeParse({ ...payload, revision: 7 }).success).toBe(false);
  });
});
