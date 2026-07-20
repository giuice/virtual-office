import { describe, expect, it } from 'vitest';
import {
  companyCreationRequestSchema,
  companyCreationRpcErrorMap,
  companyMemberRemovalRequestSchema,
  companyMemberRoleUpdateRequestSchema,
  invitationAcceptanceRequestSchema,
  invitationCreationRequestSchema,
  invitationCreationRpcErrorMap,
  parseCompanyCreationRpcErrorCode,
  parseCompanyCreationRpcResult,
  parseCompanyMemberRemovalRpcResult,
  parseCompanyMemberRoleUpdateRpcResult,
  parseInvitationAcceptanceRpcErrorCode,
  parseInvitationAcceptanceRpcResult,
  parseInvitationCreationRpcErrorCode,
  parseInvitationCreationRpcResult,
  parsePlatformCompanyCreationRpcResult,
  platformCompanyCreationRequestSchema,
} from '@/lib/api/company-membership-contracts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const PLATFORM_ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'a'.repeat(64);
const NOW = '2026-07-18T21:00:00.000Z';

const membershipResetResult = {
  previousSpaceId: null,
  locationVersion: 0,
  presenceAccessRevision: 2,
  retiredSessionCount: 0,
  closedLogCount: 0,
  operationTime: NOW,
};

describe('company membership request contracts', () => {
  it('normalizes the existing wire fields and rejects unknown authority fields', () => {
    expect(
      companyCreationRequestSchema.parse({ name: '  Acme  ', settings: {} }),
    ).toEqual({ name: 'Acme', settings: {} });
    expect(
      platformCompanyCreationRequestSchema.parse({
        companyName: '  Tenant  ',
        adminEmail: ' Admin@Example.COM ',
        planType: ' free ',
      }),
    ).toEqual({
      companyName: 'Tenant',
      adminEmail: 'admin@example.com',
      planType: 'free',
    });
    expect(
      platformCompanyCreationRequestSchema.safeParse({
        companyName: 'Tenant',
        adminEmail: 'admin@example.com',
        planType: 'x'.repeat(65),
      }).success,
    ).toBe(false);
    expect(
      invitationCreationRequestSchema.safeParse({
        email: 'new@example.com',
        role: 'member',
        companyId: COMPANY_ID,
        actorUserId: ACTOR_ID,
      }).success,
    ).toBe(false);
    expect(
      invitationAcceptanceRequestSchema.safeParse({ token: TOKEN, companyId: COMPANY_ID })
        .success,
    ).toBe(false);
    expect(
      companyMemberRoleUpdateRequestSchema.safeParse({
        role: 'admin',
        adminIds: [TARGET_ID],
      }).success,
    ).toBe(false);
    expect(
      companyMemberRemovalRequestSchema.safeParse({
        userId: TARGET_ID,
        companyId: COMPANY_ID,
      }).success,
    ).toBe(false);
  });
});

describe('company membership RPC result contracts', () => {
  it('accepts the complete company creation shape and verifies creator/admin identity', () => {
    const result = {
      ok: true,
      code: 'COMPANY_CREATED',
      userId: ACTOR_ID,
      companyId: COMPANY_ID,
      name: 'Acme',
      adminIds: [ACTOR_ID],
      settings: {},
      createdAt: NOW,
      ...membershipResetResult,
    };

    expect(
      parseCompanyCreationRpcResult(result, {
        userId: ACTOR_ID,
        name: 'Acme',
        settings: {},
      }),
    ).toEqual(result);
    expect(
      parseCompanyCreationRpcResult(
        { ...result, adminIds: [TARGET_ID] },
        { userId: ACTOR_ID, name: 'Acme', settings: {} },
      ),
    ).toBeNull();
    const partial: Record<string, unknown> = { ...result };
    delete partial.operationTime;
    expect(
      parseCompanyCreationRpcResult(partial, {
        userId: ACTOR_ID,
        name: 'Acme',
        settings: {},
      }),
    ).toBeNull();
  });

  it('validates the platform company and invitation payload without partial results', () => {
    const result = {
      ok: true,
      code: 'PLATFORM_COMPANY_AND_INVITATION_CREATED',
      platformAdminId: PLATFORM_ADMIN_ID,
      companyId: COMPANY_ID,
      companyName: 'Tenant',
      companySettings: { planType: 'free', theme: 'neon' },
      companyCreatedAt: NOW,
      invitationId: INVITATION_ID,
      email: 'admin@example.com',
      role: 'admin',
      token: TOKEN,
      expiresAt: NOW,
      invitationCreatedAt: NOW,
    };

    expect(
      parsePlatformCompanyCreationRpcResult(result, {
        companyName: 'Tenant',
        email: 'admin@example.com',
        token: TOKEN,
        settings: { theme: 'neon', planType: 'free' },
      }),
    ).toEqual(result);
    expect(
      parsePlatformCompanyCreationRpcResult(
        { ...result, invitationId: undefined },
        {
          companyName: 'Tenant',
          email: 'admin@example.com',
          token: TOKEN,
          settings: { theme: 'neon', planType: 'free' },
        },
      ),
    ).toBeNull();
  });

  it('binds invitation create and accept results to expected identifiers', () => {
    const created = {
      ok: true,
      code: 'COMPANY_INVITATION_CREATED',
      created: true,
      invitationId: INVITATION_ID,
      companyId: COMPANY_ID,
      email: 'new@example.com',
      role: 'member',
      token: TOKEN,
      expiresAt: NOW,
      createdAt: NOW,
      memberCount: 4,
      pendingCount: 2,
    };
    expect(
      parseInvitationCreationRpcResult(created, {
        companyId: COMPANY_ID,
        email: 'new@example.com',
        createdRole: 'member',
        createdToken: TOKEN,
      }),
    ).toEqual(created);
    expect(
      parseInvitationCreationRpcResult(
        { ...created, code: 'COMPANY_INVITATION_REUSED' },
        {
          companyId: COMPANY_ID,
          email: 'new@example.com',
          createdRole: 'member',
          createdToken: TOKEN,
        },
      ),
    ).toBeNull();

    const accepted = {
      ok: true,
      code: 'COMPANY_INVITATION_ACCEPTED',
      userId: TARGET_ID,
      invitationId: INVITATION_ID,
      companyId: COMPANY_ID,
      role: 'member',
      ...membershipResetResult,
    };
    expect(
      parseInvitationAcceptanceRpcResult(accepted, {
        userId: TARGET_ID,
        invitationId: INVITATION_ID,
        companyId: COMPANY_ID,
      }),
    ).toEqual(accepted);
    expect(
      parseInvitationAcceptanceRpcResult(accepted, {
        userId: TARGET_ID,
        invitationId: INVITATION_ID,
        companyId: ACTOR_ID,
      }),
    ).toBeNull();
  });

  it('binds role/adminIds maintenance and removal to actor, target, and company', () => {
    const roleUpdate = {
      ok: true,
      code: 'COMPANY_MEMBER_ROLE_UPDATED',
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      role: 'admin',
      ...membershipResetResult,
      invalidatedInvitationCount: 1,
    };
    expect(
      parseCompanyMemberRoleUpdateRpcResult(roleUpdate, {
        actorUserId: ACTOR_ID,
        targetUserId: TARGET_ID,
        companyId: COMPANY_ID,
        role: 'admin',
      }),
    ).toEqual(roleUpdate);
    expect(
      parseCompanyMemberRoleUpdateRpcResult(
        { ...roleUpdate, targetUserId: ACTOR_ID },
        {
          actorUserId: ACTOR_ID,
          targetUserId: TARGET_ID,
          companyId: COMPANY_ID,
          role: 'admin',
        },
      ),
    ).toBeNull();

    const removal = {
      ok: true,
      code: 'COMPANY_MEMBER_REMOVED',
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      ...membershipResetResult,
      invalidatedInvitationCount: 1,
      removedAdminReference: true,
    };
    expect(
      parseCompanyMemberRemovalRpcResult(removal, {
        actorUserId: ACTOR_ID,
        targetUserId: TARGET_ID,
        companyId: COMPANY_ID,
      }),
    ).toEqual(removal);
    expect(
      parseCompanyMemberRemovalRpcResult(
        { ...removal, companyId: INVITATION_ID },
        {
          actorUserId: ACTOR_ID,
          targetUserId: TARGET_ID,
          companyId: COMPANY_ID,
        },
      ),
    ).toBeNull();
  });
});

describe('operation-specific RPC errors', () => {
  it('does not accept an error code from another membership operation', () => {
    expect(parseCompanyCreationRpcErrorCode('COMPANY_CREATE_ALREADY_HAS_COMPANY')).toBe(
      'COMPANY_CREATE_ALREADY_HAS_COMPANY',
    );
    expect(parseCompanyCreationRpcErrorCode('INVITATION_CREATE_LIMIT_REACHED')).toBeNull();
    expect(parseInvitationAcceptanceRpcErrorCode('INVITATION_CREATE_LIMIT_REACHED')).toBeNull();
  });

  it('keeps capacity and public error mappings internal and canonical', () => {
    const code = parseInvitationCreationRpcErrorCode('INVITATION_CREATE_LIMIT_REACHED');
    expect(code).toBe('INVITATION_CREATE_LIMIT_REACHED');
    expect(code && invitationCreationRpcErrorMap[code]).toEqual({
      status: 403,
      body: {
        error: 'USER_LIMIT_REACHED',
        message: 'Limite atingido (10 usuários). O plano gratuito permite até 10 usuários.',
        limit: 10,
        remaining: 0,
      },
    });
    expect(companyCreationRpcErrorMap.COMPANY_CREATE_INVALID_ARGUMENT).toBeNull();
  });
});
