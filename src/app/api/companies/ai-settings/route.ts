// src/app/api/companies/ai-settings/route.ts
// Company AI settings for meeting notes (Phase 6 T8; FR-024, BR-009).
//
// GET: any member of a company reads its settings METADATA (provider, model,
// reasoning level, daily limit, last four key characters, who/when) through
// their own session under RLS, plus the curated provider/model/reasoning
// options (non-secret capability-matrix data).
// PUT: an admin of the caller's company saves settings. The route authorizes
// the session user (auth.getUser → users.supabase_uid → role 'admin' with a
// company) BEFORE using the service-role client to call the service_role-only
// save RPC, which re-verifies the actor on its locked users row. The key is
// write-only: never echoed, never logged, and no request body or provider
// text is ever written to a log line or an error response.
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { jsonError } from '@/lib/api/server-error';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { readBoundedBody } from '@/lib/messaging/metrics-log';
import { meetingNoteAiProviderOptions, checkMeetingNoteAiSelection } from '@/lib/meeting-notes/ai/capabilities';
import { MeetingNoteAiSettingsDbError } from '@/lib/meeting-notes/ai/settings-errors';
import {
  isPlausibleAiApiKey,
  MEETING_NOTE_AI_MAX_DAILY_LIMIT,
  MEETING_NOTE_AI_MIN_DAILY_LIMIT,
} from '@/lib/meeting-notes/ai/settings-limits';
import { beginMeetingNoteMutation, beginMeetingNoteRequest, ok } from '@/lib/meeting-notes/route-support';
import { SupabaseMeetingNoteAiSettingsRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteAiSettingsRepository';
import type { MeetingNoteAiSettingsResponse, MeetingNoteAiSettingsView } from '@/types/meeting-notes';

export const dynamic = 'force-dynamic';

const PATH = '/api/companies/ai-settings';
/** A settings body is a few hundred bytes; 8 KB leaves room for the longest key. */
const MAX_BODY_BYTES = 8_192;

const MESSAGES: Record<string, string> = {
  BAD_REQUEST: 'The request is invalid.',
  UNSUPPORTED_MEDIA_TYPE: 'The request body must be application/json.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  COMPANY_REQUIRED: 'You need to belong to a company to manage AI settings.',
  MEETING_NOTE_AI_SETTINGS_FORBIDDEN: 'Only company admins can change AI settings.',
  MEETING_NOTE_AI_SETTINGS_STALE_REVISION:
    'Another admin changed the AI settings. Review the current settings and save again.',
  MEETING_NOTE_AI_SETTINGS_INVALID_ARGUMENT: 'The request is invalid.',
  MEETING_NOTE_AI_PROVIDER_INVALID: 'Choose a supported AI provider.',
  MEETING_NOTE_AI_MODEL_INVALID: 'Choose a model offered for this provider.',
  MEETING_NOTE_AI_REASONING_INVALID: 'Choose a reasoning level offered for this model.',
  MEETING_NOTE_AI_DAILY_LIMIT_INVALID: `The daily limit must be a whole number from ${MEETING_NOTE_AI_MIN_DAILY_LIMIT} to ${MEETING_NOTE_AI_MAX_DAILY_LIMIT}.`,
  MEETING_NOTE_AI_KEY_REQUIRED: 'Enter the API key for the first save.',
  MEETING_NOTE_AI_KEY_INVALID: 'The API key format is invalid.',
  MEETING_NOTE_AI_REVISION_INVALID: 'The settings revision is invalid.',
};

function error(status: number, code: string, correlationId: string, context?: string): NextResponse {
  return jsonError(status, code, MESSAGES[code] ?? MESSAGES.BAD_REQUEST, { correlationId, context });
}

/** 500 that records only the SQLSTATE (never database text, which could echo parameters). */
function internalError(cause: unknown, correlationId: string, context: string): NextResponse {
  const code = cause instanceof MeetingNoteAiSettingsDbError ? cause.sqlstate : undefined;
  return jsonError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', {
    correlationId,
    cause: { code: code ?? (cause instanceof Error ? cause.name : 'unknown') },
    context,
  });
}

const saveBodySchema = z
  .object({
    expectedRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable()
      .refine((value) => value !== undefined, 'MEETING_NOTE_AI_REVISION_INVALID'),
    provider: z.enum(['anthropic', 'openai', 'kimi', 'glm'], { message: 'MEETING_NOTE_AI_PROVIDER_INVALID' }),
    model: z.string({ message: 'MEETING_NOTE_AI_MODEL_INVALID' }).min(1, 'MEETING_NOTE_AI_MODEL_INVALID').max(100, 'MEETING_NOTE_AI_MODEL_INVALID'),
    reasoningLevel: z
      .string({ message: 'MEETING_NOTE_AI_REASONING_INVALID' })
      .min(1, 'MEETING_NOTE_AI_REASONING_INVALID')
      .max(32, 'MEETING_NOTE_AI_REASONING_INVALID'),
    dailyLimit: z
      .number({ message: 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID' })
      .int('MEETING_NOTE_AI_DAILY_LIMIT_INVALID')
      .min(MEETING_NOTE_AI_MIN_DAILY_LIMIT, 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID')
      .max(MEETING_NOTE_AI_MAX_DAILY_LIMIT, 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID'),
    // Write-only. null/absent keeps the stored key. Never trimmed or echoed.
    apiKey: z
      .string({ message: 'MEETING_NOTE_AI_KEY_INVALID' })
      .refine(isPlausibleAiApiKey, 'MEETING_NOTE_AI_KEY_INVALID')
      .nullable()
      .optional(),
  })
  .strict();

/** The first issue's stable code; a revision issue is reported as such, the rest as BAD_REQUEST. */
function validationCode(issues: readonly z.core.$ZodIssue[]): string {
  const issue = issues[0];
  if (!issue) return 'BAD_REQUEST';
  if (/^[A-Z_]+$/.test(issue.message) && issue.message in MESSAGES) return issue.message;
  if (issue.path[0] === 'expectedRevision') return 'MEETING_NOTE_AI_REVISION_INVALID';
  return 'BAD_REQUEST';
}

/**
 * GET /api/companies/ai-settings → MeetingNoteAiSettingsResponse.
 * Metadata only; a company that never saved settings reads as not configured
 * with the default daily limit.
 */
export async function GET(): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest(PATH);
  if (!begun.ok) return begun.response;
  const ctx = begun.value;
  const companyId = ctx.dbUser.companyId;
  if (!companyId) return error(403, 'COMPANY_REQUIRED', ctx.correlationId);

  try {
    const settings = await new SupabaseMeetingNoteAiSettingsRepository(ctx.supabase).findByCompany(companyId);
    const body: MeetingNoteAiSettingsResponse = {
      settings,
      providers: meetingNoteAiProviderOptions(),
      canManage: ctx.dbUser.role === 'admin',
    };
    return ok(body, ctx);
  } catch (cause) {
    return internalError(cause, ctx.correlationId, 'aiSettings.read');
  }
}

/**
 * PUT /api/companies/ai-settings — admins of the caller's company only.
 * Body: { expectedRevision: number|null, provider, model, reasoningLevel,
 * dailyLimit: 1..200, apiKey?: string|null }. 200 { settings } (masked);
 * 409 { code, currentRevision, settings } when another save landed first.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:ai-settings');
  if (!begun.ok) {
    await request.body?.cancel().catch(() => undefined);
    return begun.response;
  }
  const ctx = begun.value;
  const companyId = ctx.dbUser.companyId;
  if (!companyId || ctx.dbUser.role !== 'admin') {
    await request.body?.cancel().catch(() => undefined);
    return error(403, 'MEETING_NOTE_AI_SETTINGS_FORBIDDEN', ctx.correlationId, 'aiSettings.save.authorize');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    await request.body?.cancel().catch(() => undefined);
    return error(415, 'UNSUPPORTED_MEDIA_TYPE', ctx.correlationId);
  }
  const raw = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!raw.ok) {
    return raw.reason === 'too_large'
      ? error(413, 'PAYLOAD_TOO_LARGE', ctx.correlationId)
      : error(400, 'BAD_REQUEST', ctx.correlationId);
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes));
  } catch {
    return error(400, 'BAD_REQUEST', ctx.correlationId);
  }
  const parsed = saveBodySchema.safeParse(json);
  if (!parsed.success) return error(400, validationCode(parsed.error.issues), ctx.correlationId);
  const body = parsed.data;

  const selection = checkMeetingNoteAiSelection(body.provider, body.model, body.reasoningLevel);
  if (selection !== 'ok') return error(400, selection, ctx.correlationId);

  let service;
  try {
    service = await createSupabaseServerClient('service_role');
  } catch (cause) {
    return internalError(cause, ctx.correlationId, 'aiSettings.save.client');
  }

  try {
    const settings = await new SupabaseMeetingNoteAiSettingsRepository(service).save({
      actorUserId: ctx.dbUser.id,
      companyId,
      expectedRevision: body.expectedRevision,
      provider: body.provider,
      model: body.model,
      reasoningLevel: body.reasoningLevel,
      dailyLimit: body.dailyLimit,
      apiKey: body.apiKey ?? null,
    });
    return ok({ settings }, ctx);
  } catch (cause) {
    if (!(cause instanceof MeetingNoteAiSettingsDbError) || cause.token === null) {
      return internalError(cause, ctx.correlationId, 'aiSettings.save');
    }
    if (cause.token === 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION') {
      return staleConflict(ctx.supabase, companyId, ctx.correlationId);
    }
    if (cause.sqlstate === '42501') {
      return error(403, cause.token, ctx.correlationId, 'aiSettings.save');
    }
    return error(400, cause.token, ctx.correlationId, 'aiSettings.save');
  }
}

/** 409 with the settings as the caller's session now reads them. */
async function staleConflict(
  supabase: SupabaseClient,
  companyId: string,
  correlationId: string
): Promise<NextResponse> {
  let settings: MeetingNoteAiSettingsView;
  try {
    settings = await new SupabaseMeetingNoteAiSettingsRepository(supabase).findByCompany(companyId);
  } catch (cause) {
    return internalError(cause, correlationId, 'aiSettings.save.loadCurrent');
  }
  const code = 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION';
  return NextResponse.json(
    { error: MESSAGES[code], code, currentRevision: settings.revision, correlationId, settings },
    { status: 409, headers: { 'x-correlation-id': correlationId } }
  );
}
