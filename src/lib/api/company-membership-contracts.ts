import { z } from 'zod';

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const invitationTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

export const companyMembershipRoleSchema = z.enum(['admin', 'member']);

export const companySettingsSchema = z
  .object({
    allowGuestAccess: z.boolean().optional(),
    maxRooms: nonnegativeIntegerSchema.optional(),
    theme: z.string().max(64).optional(),
    defaultSpaceId: uuidSchema.optional(),
    homeSpaces: z.record(z.string(), uuidSchema).optional(),
  })
  .strict();

export const companyCreationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    settings: companySettingsSchema.optional(),
  })
  .strict();

export const platformCompanyCreationRequestSchema = z
  .object({
    companyName: z.string().trim().min(1).max(160),
    adminEmail: emailSchema,
    planType: z
      .string()
      .trim()
      .max(64)
      .transform((value) => value || undefined)
      .optional(),
  })
  .strict();

export const invitationCreationRequestSchema = z
  .object({
    email: emailSchema,
    role: companyMembershipRoleSchema,
    companyId: uuidSchema,
  })
  .strict();

export const invitationAcceptanceRequestSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    displayName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const companyMemberRoleUpdateRequestSchema = z
  .object({ role: companyMembershipRoleSchema })
  .strict();

export const companyMemberRemovalRequestSchema = z
  .object({ userId: uuidSchema })
  .strict();

export type CompanyCreationRequest = z.infer<typeof companyCreationRequestSchema>;
export type PlatformCompanyCreationRequest = z.infer<
  typeof platformCompanyCreationRequestSchema
>;
export type InvitationCreationRequest = z.infer<typeof invitationCreationRequestSchema>;
export type InvitationAcceptanceRequest = z.infer<
  typeof invitationAcceptanceRequestSchema
>;
export type CompanyMemberRoleUpdateRequest = z.infer<
  typeof companyMemberRoleUpdateRequestSchema
>;
export type CompanyMemberRemovalRequest = z.infer<
  typeof companyMemberRemovalRequestSchema
>;

const membershipResetResultFields = {
  previousSpaceId: uuidSchema.nullable(),
  locationVersion: nonnegativeIntegerSchema,
  presenceAccessRevision: positiveIntegerSchema,
  retiredSessionCount: nonnegativeIntegerSchema,
  closedLogCount: nonnegativeIntegerSchema,
  operationTime: timestampSchema,
} as const;

export const companyCreationRpcResultSchema = z
  .object({
    ok: z.literal(true),
    code: z.literal('COMPANY_CREATED'),
    userId: uuidSchema,
    companyId: uuidSchema,
    name: z.string().min(1).max(160),
    adminIds: z.array(uuidSchema),
    settings: companySettingsSchema,
    createdAt: timestampSchema,
    ...membershipResetResultFields,
  })
  .strict();

const platformCompanySettingsSchema = z
  .object({
    theme: z.literal('neon'),
    planType: z.string().min(1).max(64).optional(),
  })
  .strict();

export const platformCompanyCreationRpcResultSchema = z
  .object({
    ok: z.literal(true),
    code: z.literal('PLATFORM_COMPANY_AND_INVITATION_CREATED'),
    platformAdminId: uuidSchema,
    companyId: uuidSchema,
    companyName: z.string().min(1).max(160),
    companySettings: platformCompanySettingsSchema,
    companyCreatedAt: timestampSchema,
    invitationId: uuidSchema,
    email: emailSchema,
    role: z.literal('admin'),
    token: invitationTokenSchema,
    expiresAt: timestampSchema,
    invitationCreatedAt: timestampSchema,
  })
  .strict();

const invitationCreationRpcResultFields = {
  ok: z.literal(true),
  invitationId: uuidSchema,
  companyId: uuidSchema,
  email: emailSchema,
  role: companyMembershipRoleSchema,
  token: invitationTokenSchema,
  expiresAt: timestampSchema,
  createdAt: timestampSchema,
  memberCount: nonnegativeIntegerSchema,
  pendingCount: nonnegativeIntegerSchema,
} as const;

export const invitationCreationRpcResultSchema = z.discriminatedUnion('created', [
  z
    .object({
      ...invitationCreationRpcResultFields,
      code: z.literal('COMPANY_INVITATION_CREATED'),
      created: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...invitationCreationRpcResultFields,
      code: z.literal('COMPANY_INVITATION_REUSED'),
      created: z.literal(false),
    })
    .strict(),
]);

export const invitationAcceptanceRpcResultSchema = z
  .object({
    ok: z.literal(true),
    code: z.literal('COMPANY_INVITATION_ACCEPTED'),
    userId: uuidSchema,
    invitationId: uuidSchema,
    companyId: uuidSchema,
    role: companyMembershipRoleSchema,
    ...membershipResetResultFields,
  })
  .strict();

export const companyMemberRoleUpdateRpcResultSchema = z
  .object({
    ok: z.literal(true),
    code: z.literal('COMPANY_MEMBER_ROLE_UPDATED'),
    actorUserId: uuidSchema,
    targetUserId: uuidSchema,
    companyId: uuidSchema,
    role: companyMembershipRoleSchema,
    previousSpaceId: uuidSchema.nullable(),
    locationVersion: nonnegativeIntegerSchema,
    presenceAccessRevision: positiveIntegerSchema,
    retiredSessionCount: nonnegativeIntegerSchema,
    closedLogCount: nonnegativeIntegerSchema,
    invalidatedInvitationCount: nonnegativeIntegerSchema,
    operationTime: timestampSchema,
  })
  .strict();

export const companyMemberRemovalRpcResultSchema = z
  .object({
    ok: z.literal(true),
    code: z.literal('COMPANY_MEMBER_REMOVED'),
    actorUserId: uuidSchema,
    targetUserId: uuidSchema,
    companyId: uuidSchema,
    previousSpaceId: uuidSchema.nullable(),
    locationVersion: nonnegativeIntegerSchema,
    presenceAccessRevision: positiveIntegerSchema,
    retiredSessionCount: nonnegativeIntegerSchema,
    closedLogCount: nonnegativeIntegerSchema,
    invalidatedInvitationCount: nonnegativeIntegerSchema,
    removedAdminReference: z.boolean(),
    operationTime: timestampSchema,
  })
  .strict();

export const invitationMembershipLookupSchema = z
  .object({
    id: uuidSchema,
    company_id: uuidSchema,
  })
  .strict();

export const invitationAuthorizationCompanySchema = z
  .object({
    id: uuidSchema,
    admin_ids: z.array(uuidSchema).nullable(),
  })
  .strict();

export const invitationAuthorizationActorSchema = z
  .object({
    id: uuidSchema,
    role: companyMembershipRoleSchema,
    company_id: uuidSchema.nullable(),
  })
  .strict();

export type CompanyCreationRpcResult = z.infer<typeof companyCreationRpcResultSchema>;
export type PlatformCompanyCreationRpcResult = z.infer<
  typeof platformCompanyCreationRpcResultSchema
>;
export type InvitationCreationRpcResult = z.infer<
  typeof invitationCreationRpcResultSchema
>;
export type InvitationAcceptanceRpcResult = z.infer<
  typeof invitationAcceptanceRpcResultSchema
>;
export type CompanyMemberRoleUpdateRpcResult = z.infer<
  typeof companyMemberRoleUpdateRpcResultSchema
>;
export type CompanyMemberRemovalRpcResult = z.infer<
  typeof companyMemberRemovalRpcResultSchema
>;

function equalStringRecords(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  if (!left || !right) return left === right;
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function equalCompanySettings(
  left: CompanyCreationRpcResult['settings'],
  right: CompanyCreationRpcResult['settings'],
): boolean {
  return (
    left.allowGuestAccess === right.allowGuestAccess &&
    left.maxRooms === right.maxRooms &&
    left.theme === right.theme &&
    left.defaultSpaceId === right.defaultSpaceId &&
    equalStringRecords(left.homeSpaces, right.homeSpaces)
  );
}

function parseExpectedResult<T>(
  schema: z.ZodType<T>,
  value: unknown,
  matchesExpectation: (result: T) => boolean,
): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success && matchesExpectation(parsed.data) ? parsed.data : null;
}

export function parseCompanyCreationRpcResult(
  value: unknown,
  expected: {
    userId: string;
    name: string;
    settings: CompanyCreationRpcResult['settings'];
  },
): CompanyCreationRpcResult | null {
  return parseExpectedResult(companyCreationRpcResultSchema, value, (result) =>
    result.userId === expected.userId &&
    result.name === expected.name &&
    equalCompanySettings(result.settings, expected.settings) &&
    result.adminIds.length === 1 &&
    result.adminIds[0] === expected.userId);
}

export function parsePlatformCompanyCreationRpcResult(
  value: unknown,
  expected: {
    companyName: string;
    email: string;
    token: string;
    settings: z.infer<typeof platformCompanySettingsSchema>;
  },
): PlatformCompanyCreationRpcResult | null {
  return parseExpectedResult(platformCompanyCreationRpcResultSchema, value, (result) =>
    result.companyName === expected.companyName &&
    result.email === expected.email &&
    result.token === expected.token &&
    result.companySettings.theme === expected.settings.theme &&
    result.companySettings.planType === expected.settings.planType);
}

export function parseInvitationCreationRpcResult(
  value: unknown,
  expected: {
    companyId: string;
    email: string;
    createdRole: z.infer<typeof companyMembershipRoleSchema>;
    createdToken: string;
  },
): InvitationCreationRpcResult | null {
  return parseExpectedResult(invitationCreationRpcResultSchema, value, (result) =>
    result.companyId === expected.companyId &&
    result.email === expected.email &&
    (!result.created ||
      (result.role === expected.createdRole && result.token === expected.createdToken)));
}

export function parseInvitationAcceptanceRpcResult(
  value: unknown,
  expected: { userId: string; invitationId: string; companyId: string },
): InvitationAcceptanceRpcResult | null {
  return parseExpectedResult(invitationAcceptanceRpcResultSchema, value, (result) =>
    result.userId === expected.userId &&
    result.invitationId === expected.invitationId &&
    result.companyId === expected.companyId);
}

export function parseCompanyMemberRoleUpdateRpcResult(
  value: unknown,
  expected: {
    actorUserId: string;
    targetUserId: string;
    companyId: string;
    role: z.infer<typeof companyMembershipRoleSchema>;
  },
): CompanyMemberRoleUpdateRpcResult | null {
  return parseExpectedResult(companyMemberRoleUpdateRpcResultSchema, value, (result) =>
    result.actorUserId === expected.actorUserId &&
    result.targetUserId === expected.targetUserId &&
    result.companyId === expected.companyId &&
    result.role === expected.role);
}

export function parseCompanyMemberRemovalRpcResult(
  value: unknown,
  expected: { actorUserId: string; targetUserId: string; companyId: string },
): CompanyMemberRemovalRpcResult | null {
  return parseExpectedResult(companyMemberRemovalRpcResultSchema, value, (result) =>
    result.actorUserId === expected.actorUserId &&
    result.targetUserId === expected.targetUserId &&
    result.companyId === expected.companyId);
}

const companyCreationRpcErrorCodes = [
  'COMPANY_CREATE_INVALID_ARGUMENT',
  'COMPANY_CREATE_USER_NOT_FOUND',
  'COMPANY_CREATE_ALREADY_HAS_COMPANY',
] as const;

const platformCompanyCreationRpcErrorCodes = [
  'PLATFORM_COMPANY_CREATE_INVALID_ARGUMENT',
  'PLATFORM_COMPANY_CREATE_FORBIDDEN',
] as const;

const invitationCreationRpcErrorCodes = [
  'INVITATION_CREATE_INVALID_ARGUMENT',
  'INVITATION_CREATE_ACTOR_NOT_FOUND',
  'INVITATION_CREATE_COMPANY_NOT_FOUND',
  'INVITATION_CREATE_FORBIDDEN',
  'INVITATION_CREATE_EXISTING_MEMBER',
  'INVITATION_CREATE_LIMIT_REACHED',
] as const;

const invitationAcceptanceRpcErrorCodes = [
  'INVITATION_ACCEPT_INVALID_ARGUMENT',
  'INVITATION_ACCEPT_INVALID_DISPLAY_NAME',
  'INVITATION_ACCEPT_USER_NOT_FOUND',
  'INVITATION_ACCEPT_COMPANY_NOT_FOUND',
  'INVITATION_ACCEPT_NOT_FOUND',
  'INVITATION_ACCEPT_FORBIDDEN',
  'INVITATION_ACCEPT_ALREADY_HAS_COMPANY',
  'INVITATION_ACCEPT_LIMIT_REACHED',
] as const;

const companyMemberRoleUpdateRpcErrorCodes = [
  'COMPANY_ROLE_UPDATE_INVALID_ARGUMENT',
  'COMPANY_ROLE_UPDATE_ACTOR_NOT_FOUND',
  'COMPANY_ROLE_UPDATE_TARGET_NOT_FOUND',
  'COMPANY_ROLE_UPDATE_COMPANY_NOT_FOUND',
  'COMPANY_ROLE_UPDATE_FORBIDDEN',
  'COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN',
] as const;

const companyMemberRemovalRpcErrorCodes = [
  'COMPANY_REMOVAL_INVALID_ARGUMENT',
  'COMPANY_REMOVAL_ACTOR_NOT_FOUND',
  'COMPANY_REMOVAL_TARGET_NOT_FOUND',
  'COMPANY_REMOVAL_COMPANY_NOT_FOUND',
  'COMPANY_REMOVAL_SPACE_NOT_FOUND',
  'COMPANY_REMOVAL_FORBIDDEN',
  'COMPANY_REMOVAL_SELF_FORBIDDEN',
  'COMPANY_REMOVAL_TARGET_OUTSIDE_COMPANY',
] as const;

export type CompanyCreationRpcErrorCode = typeof companyCreationRpcErrorCodes[number];
export type PlatformCompanyCreationRpcErrorCode = typeof platformCompanyCreationRpcErrorCodes[number];
export type InvitationCreationRpcErrorCode = typeof invitationCreationRpcErrorCodes[number];
export type InvitationAcceptanceRpcErrorCode = typeof invitationAcceptanceRpcErrorCodes[number];
export type CompanyMemberRoleUpdateRpcErrorCode = typeof companyMemberRoleUpdateRpcErrorCodes[number];
export type CompanyMemberRemovalRpcErrorCode = typeof companyMemberRemovalRpcErrorCodes[number];

type PublicErrorContract = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export const companyCreationRpcErrorMap = {
  COMPANY_CREATE_INVALID_ARGUMENT: null,
  COMPANY_CREATE_USER_NOT_FOUND: null,
  COMPANY_CREATE_ALREADY_HAS_COMPANY: {
    status: 409,
    body: {
      success: false,
      code: 'ALREADY_HAS_COMPANY',
      error:
        'You already belong to a company. Leave your current company before creating a new one.',
    },
  },
} as const satisfies Record<CompanyCreationRpcErrorCode, PublicErrorContract | null>;

export const platformCompanyCreationRpcErrorMap = {
  PLATFORM_COMPANY_CREATE_INVALID_ARGUMENT: {
    status: 400,
    body: { error: 'Dados da empresa inválidos' },
  },
  PLATFORM_COMPANY_CREATE_FORBIDDEN: {
    status: 403,
    body: { error: 'Acesso negado. Apenas Platform Admins podem criar empresas.' },
  },
} as const satisfies Record<PlatformCompanyCreationRpcErrorCode, PublicErrorContract | null>;

export const invitationCreationRpcErrorMap = {
  INVITATION_CREATE_INVALID_ARGUMENT: {
    status: 400,
    body: { error: 'Dados do convite inválidos' },
  },
  INVITATION_CREATE_ACTOR_NOT_FOUND: {
    status: 401,
    body: { error: 'Usuário não autenticado' },
  },
  INVITATION_CREATE_COMPANY_NOT_FOUND: {
    status: 404,
    body: { error: 'Empresa não encontrada' },
  },
  INVITATION_CREATE_FORBIDDEN: {
    status: 403,
    body: { error: 'Apenas administradores podem enviar convites' },
  },
  INVITATION_CREATE_EXISTING_MEMBER: {
    status: 409,
    body: {
      error: 'ALREADY_COMPANY_MEMBER',
      message: 'Este usuário já pertence à empresa.',
    },
  },
  INVITATION_CREATE_LIMIT_REACHED: {
    status: 403,
    body: {
      error: 'USER_LIMIT_REACHED',
      message: 'Limite atingido (10 usuários). O plano gratuito permite até 10 usuários.',
      limit: 10,
      remaining: 0,
    },
  },
} as const satisfies Record<InvitationCreationRpcErrorCode, PublicErrorContract | null>;

export const invitationAcceptanceRpcErrorMap = {
  INVITATION_ACCEPT_INVALID_ARGUMENT: null,
  INVITATION_ACCEPT_INVALID_DISPLAY_NAME: null,
  INVITATION_ACCEPT_USER_NOT_FOUND: null,
  INVITATION_ACCEPT_COMPANY_NOT_FOUND: null,
  INVITATION_ACCEPT_NOT_FOUND: {
    status: 404,
    body: {
      success: false,
      code: 'INVITATION_NOT_FOUND',
      error: 'Convite não encontrado ou inválido',
    },
  },
  INVITATION_ACCEPT_FORBIDDEN: {
    status: 403,
    body: {
      success: false,
      code: 'INVITATION_FORBIDDEN',
      error: 'Este convite não pode ser aceito por esta conta',
    },
  },
  INVITATION_ACCEPT_ALREADY_HAS_COMPANY: {
    status: 409,
    body: {
      success: false,
      code: 'ALREADY_HAS_COMPANY',
      error: 'Você já pertence a outra empresa',
    },
  },
  INVITATION_ACCEPT_LIMIT_REACHED: {
    status: 403,
    body: {
      success: false,
      code: 'USER_LIMIT_REACHED',
      error: 'Limite atingido (10 usuários)',
    },
  },
} as const satisfies Record<InvitationAcceptanceRpcErrorCode, PublicErrorContract | null>;

export const companyMemberRoleUpdateRpcErrorMap = {
  COMPANY_ROLE_UPDATE_INVALID_ARGUMENT: null,
  COMPANY_ROLE_UPDATE_ACTOR_NOT_FOUND: null,
  COMPANY_ROLE_UPDATE_TARGET_NOT_FOUND: null,
  COMPANY_ROLE_UPDATE_COMPANY_NOT_FOUND: null,
  COMPANY_ROLE_UPDATE_FORBIDDEN: {
    status: 403,
    body: {
      success: false,
      code: 'COMPANY_ROLE_UPDATE_FORBIDDEN',
      error: 'Role update is not allowed',
    },
  },
  COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN: {
    status: 403,
    body: {
      success: false,
      code: 'COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN',
      error: 'Role update is not allowed',
    },
  },
} as const satisfies Record<CompanyMemberRoleUpdateRpcErrorCode, PublicErrorContract | null>;

export const companyMemberRemovalRpcErrorMap = {
  COMPANY_REMOVAL_INVALID_ARGUMENT: null,
  COMPANY_REMOVAL_ACTOR_NOT_FOUND: null,
  COMPANY_REMOVAL_TARGET_NOT_FOUND: {
    status: 403,
    body: {
      message: 'Member removal is not allowed',
      code: 'COMPANY_REMOVAL_FORBIDDEN',
    },
  },
  COMPANY_REMOVAL_COMPANY_NOT_FOUND: {
    status: 404,
    body: { message: 'Company not found', code: 'COMPANY_REMOVAL_COMPANY_NOT_FOUND' },
  },
  COMPANY_REMOVAL_SPACE_NOT_FOUND: null,
  COMPANY_REMOVAL_FORBIDDEN: {
    status: 403,
    body: {
      message: 'Only an admin of this company can remove members',
      code: 'COMPANY_REMOVAL_FORBIDDEN',
    },
  },
  COMPANY_REMOVAL_SELF_FORBIDDEN: {
    status: 403,
    body: {
      message: 'You cannot remove yourself from the company',
      code: 'COMPANY_REMOVAL_SELF_FORBIDDEN',
    },
  },
  COMPANY_REMOVAL_TARGET_OUTSIDE_COMPANY: {
    status: 403,
    body: {
      message: 'Member removal is not allowed',
      code: 'COMPANY_REMOVAL_FORBIDDEN',
    },
  },
} as const satisfies Record<CompanyMemberRemovalRpcErrorCode, PublicErrorContract | null>;

function parseErrorCode<T extends string>(codes: readonly T[], value: unknown): T | null {
  return typeof value === 'string' ? (codes.find((code) => code === value) ?? null) : null;
}

export const parseCompanyCreationRpcErrorCode = (value: unknown) =>
  parseErrorCode(companyCreationRpcErrorCodes, value);
export const parsePlatformCompanyCreationRpcErrorCode = (value: unknown) =>
  parseErrorCode(platformCompanyCreationRpcErrorCodes, value);
export const parseInvitationCreationRpcErrorCode = (value: unknown) =>
  parseErrorCode(invitationCreationRpcErrorCodes, value);
export const parseInvitationAcceptanceRpcErrorCode = (value: unknown) =>
  parseErrorCode(invitationAcceptanceRpcErrorCodes, value);
export const parseCompanyMemberRoleUpdateRpcErrorCode = (value: unknown) =>
  parseErrorCode(companyMemberRoleUpdateRpcErrorCodes, value);
export const parseCompanyMemberRemovalRpcErrorCode = (value: unknown) =>
  parseErrorCode(companyMemberRemovalRpcErrorCodes, value);
