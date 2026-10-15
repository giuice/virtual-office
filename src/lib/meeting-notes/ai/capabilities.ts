// src/lib/meeting-notes/ai/capabilities.ts
// Curated AI capability matrix for meeting-note processing (Phase 6 T8;
// SPEC FR-016, FR-020, FR-022, FR-024). DATA ONLY: no provider call, no SDK.
// T11's adapters consume it; the settings route validates admin choices
// against it; the model/reasoning lists (never keys) are exposed to the admin
// form through GET /api/companies/ai-settings.
//
// Sources (official documentation, read 2026-10-13):
//   Anthropic models   https://platform.claude.com/docs/en/about-claude/models/overview.md
//   Anthropic effort   https://platform.claude.com/docs/en/build-with-claude/effort.md
//   Anthropic errors   https://platform.claude.com/docs/en/api/errors.md
//   Anthropic stream   https://platform.claude.com/docs/en/build-with-claude/streaming.md
//   OpenAI models      https://developers.openai.com/api/docs/models (+ /models/<id>)
//   OpenAI reasoning   https://developers.openai.com/api/docs/guides/reasoning
//   OpenAI chat        https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create
//   OpenAI errors      https://developers.openai.com/api/docs/guides/error-codes
//   Kimi API overview  https://platform.kimi.ai/docs/api/overview.md
//   Kimi models        https://platform.kimi.ai/docs/models , https://platform.kimi.ai/docs/api/models-overview
//   Kimi chat          https://platform.kimi.ai/docs/api/chat
//   Kimi errors        https://platform.kimi.ai/docs/api/errors.md
//   GLM quick start    https://docs.z.ai/guides/overview/quick-start.md
//   GLM models         https://docs.z.ai/guides/overview/overview.md
//   GLM chat           https://docs.z.ai/api-reference/llm/chat-completion.md
//   GLM errors         https://docs.z.ai/api-reference/api-code.md
//
// Pre-processing rejections (FR-022): a dispatch is refunded only when the
// provider's INITIAL HTTP response is a non-2xx rejection with the provider's
// normal error body whose status AND documented type/code are listed below for
// that provider, in one of the SPEC's categories (authentication/permission,
// rate limit, overload, unavailable). None of the providers documents billing
// for error responses; the list holds only the documented status + type/code
// combinations of those categories. Every entry names an exact `error.type`,
// an exact `error.code`, or both; there is no wildcard. A status the
// documentation lists WITHOUT a type or code (e.g. OpenAI's 401/403 and its
// plain "Rate limit reached" 429) cannot be told apart from an unknown error
// and stays counted. Everything else stays counted too: other statuses (400,
// 402, 404, 413, 500, 504, ...), unlisted types/codes, a body that is not the
// provider's normal error envelope, errors inside an accepted (2xx/streaming)
// response (e.g. Anthropic's mid-stream `overloaded_error` event), and
// connection loss. classifyMeetingNoteAiPreProcessingRejection applies this.
import 'server-only';

import type {
  MeetingNoteAiModelOption,
  MeetingNoteAiProvider,
  MeetingNoteAiProviderOption,
} from '@/types/meeting-notes';

/** Wire protocol an adapter speaks (Kimi and GLM are OpenAI-compatible). */
export type MeetingNoteAiWireProtocol = 'anthropic-messages' | 'openai-chat-completions';

export type MeetingNoteAiRejectionCategory = 'authentication' | 'permission' | 'rate_limit' | 'overloaded' | 'unavailable';

/**
 * What the provider's error body must carry, exactly as documented:
 * `type`: `error.type` equals; `code`: `error.code` equals, whatever the type
 * (used where the documentation names only the code, e.g. OpenAI billing
 * errors whose type may vary, and GLM business codes); `type+code`: both equal.
 */
export type MeetingNoteAiRejectionMatch =
  | { by: 'type'; errorType: string }
  | { by: 'code'; errorCode: string }
  | { by: 'type+code'; errorType: string; errorCode: string };

export interface MeetingNoteAiRejection {
  /** Initial HTTP status of the provider response. */
  status: number;
  match: MeetingNoteAiRejectionMatch;
  category: MeetingNoteAiRejectionCategory;
  docUrl: string;
}

function byType(
  status: number,
  errorType: string,
  category: MeetingNoteAiRejectionCategory,
  docUrl: string
): MeetingNoteAiRejection {
  return { status, match: { by: 'type', errorType }, category, docUrl };
}

function byCode(
  status: number,
  errorCode: string,
  category: MeetingNoteAiRejectionCategory,
  docUrl: string
): MeetingNoteAiRejection {
  return { status, match: { by: 'code', errorCode }, category, docUrl };
}

export interface MeetingNoteAiReasoningLevel {
  /** Stored settings value (database: ^[a-z][a-z_]{0,31}$). */
  id: string;
  label: string;
  /**
   * Exact JSON fragment merged into the request body for this level; the
   * adapter sends nothing else reasoning-related.
   */
  wire: Readonly<Record<string, unknown>>;
}

export interface MeetingNoteAiModelCapability {
  id: string;
  label: string;
  /** Tokens the model accepts as input (context window, or the documented input cap). */
  contextWindowTokens: number;
  /** Largest output budget the adapter may request. */
  maxOutputTokens: number;
  reasoningLevels: readonly MeetingNoteAiReasoningLevel[];
  defaultReasoningLevel: string;
  docUrl: string;
}

export interface MeetingNoteAiProviderCapability {
  id: MeetingNoteAiProvider;
  label: string;
  protocol: MeetingNoteAiWireProtocol;
  /** API base URL (international endpoint for Kimi and GLM). */
  baseUrl: string;
  /** Request-body field that carries the output budget. */
  outputBudgetParam: 'max_tokens' | 'max_completion_tokens';
  /** Structured output the provider documents (T11 chooses the request shape). */
  jsonOutput: 'json_schema' | 'json_object';
  models: readonly MeetingNoteAiModelCapability[];
  preProcessingRejections: readonly MeetingNoteAiRejection[];
}

// ---------------------------------------------------------------------------
// Anthropic — Messages API. Adaptive thinking is the default on these models
// (sending {type:"disabled"} or budget_tokens is a 400 on Opus 5.5), so the
// adapter omits `thinking` and sets only `output_config.effort`.
// ---------------------------------------------------------------------------

const ANTHROPIC_EFFORT_DOC = 'https://platform.claude.com/docs/en/build-with-claude/effort.md';
const ANTHROPIC_MODELS_DOC = 'https://platform.claude.com/docs/en/about-claude/models/overview.md';
const ANTHROPIC_ERRORS_DOC = 'https://platform.claude.com/docs/en/api/errors.md';

function anthropicEffort(id: 'low' | 'medium' | 'high' | 'xhigh' | 'max', label: string): MeetingNoteAiReasoningLevel {
  return { id, label, wire: { output_config: { effort: id } } };
}

const ANTHROPIC_EFFORTS: readonly MeetingNoteAiReasoningLevel[] = [
  anthropicEffort('low', 'Low'),
  anthropicEffort('medium', 'Medium'),
  anthropicEffort('high', 'High'),
  anthropicEffort('xhigh', 'Extra high'),
  anthropicEffort('max', 'Max'),
];

const ANTHROPIC: MeetingNoteAiProviderCapability = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  protocol: 'anthropic-messages',
  baseUrl: 'https://api.anthropic.com',
  outputBudgetParam: 'max_tokens',
  jsonOutput: 'json_schema', // output_config.format — https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md
  models: [
    // 1M context, 128K output, effort low..max, default medium (models overview; effort page).
    {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      reasoningLevels: ANTHROPIC_EFFORTS,
      defaultReasoningLevel: 'medium',
      docUrl: ANTHROPIC_MODELS_DOC,
    },
    // 1M context, 128K output, effort low..max, default high.
    {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      reasoningLevels: ANTHROPIC_EFFORTS,
      defaultReasoningLevel: 'high',
      docUrl: ANTHROPIC_MODELS_DOC,
    },
    // 1M context, 128K output, effort low..max, default medium.
    {
      id: 'claude-haiku-5-5',
      label: 'Claude Haiku 5.5',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      reasoningLevels: ANTHROPIC_EFFORTS,
      defaultReasoningLevel: 'medium',
      docUrl: ANTHROPIC_EFFORT_DOC,
    },
  ],
  // Body: {"type":"error","error":{"type":"...","message":"..."}} (errors page).
  preProcessingRejections: [
    byType(401, 'authentication_error', 'authentication', ANTHROPIC_ERRORS_DOC),
    byType(403, 'permission_error', 'permission', ANTHROPIC_ERRORS_DOC),
    byType(429, 'rate_limit_error', 'rate_limit', ANTHROPIC_ERRORS_DOC),
    // Initial 529 only; the same error as an SSE `error` event after a 200 is
    // inside an accepted response and stays counted (streaming page).
    byType(529, 'overloaded_error', 'overloaded', ANTHROPIC_ERRORS_DOC),
  ],
};

// ---------------------------------------------------------------------------
// OpenAI — Chat Completions (`reasoning_effort`; Responses equivalent
// `reasoning.effort`). `max_completion_tokens` (includes reasoning tokens);
// `max_tokens` is deprecated and incompatible with reasoning models. Do not
// send `temperature` (support differs on reasoning models).
// ---------------------------------------------------------------------------

const OPENAI_ERRORS_DOC = 'https://developers.openai.com/api/docs/guides/error-codes';

function openAiEffort(
  id: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  label: string
): MeetingNoteAiReasoningLevel {
  return { id, label, wire: { reasoning_effort: id } };
}

const OPENAI_EFFORTS_LOW_TO_MAX: readonly MeetingNoteAiReasoningLevel[] = [
  openAiEffort('low', 'Low'),
  openAiEffort('medium', 'Medium'),
  openAiEffort('high', 'High'),
  openAiEffort('xhigh', 'Extra high'),
  openAiEffort('max', 'Max'),
];

const OPENAI: MeetingNoteAiProviderCapability = {
  id: 'openai',
  label: 'OpenAI',
  protocol: 'openai-chat-completions',
  baseUrl: 'https://api.openai.com/v1',
  outputBudgetParam: 'max_completion_tokens',
  jsonOutput: 'json_schema',
  models: [
    // Context 1,050,000 with max input 922,000 (budget uses the input cap); output 128,000.
    // Efforts low..max; `none` returns HTTP 400 on Astra (reasoning guide). Default not stated.
    {
      id: 'gpt-6-astra',
      label: 'GPT-6 Astra',
      contextWindowTokens: 922_000,
      maxOutputTokens: 128_000,
      reasoningLevels: OPENAI_EFFORTS_LOW_TO_MAX,
      defaultReasoningLevel: 'medium',
      docUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    },
    // Efforts low..max (no none/minimal), default medium.
    {
      id: 'gpt-6.1-sol',
      label: 'GPT-6.1 Sol',
      contextWindowTokens: 922_000,
      maxOutputTokens: 128_000,
      reasoningLevels: OPENAI_EFFORTS_LOW_TO_MAX,
      defaultReasoningLevel: 'medium',
      docUrl: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
    },
    // Efforts none, low..max, default medium.
    {
      id: 'gpt-6-luna',
      label: 'GPT-6 Luna',
      contextWindowTokens: 922_000,
      maxOutputTokens: 128_000,
      reasoningLevels: [openAiEffort('none', 'None'), ...OPENAI_EFFORTS_LOW_TO_MAX],
      defaultReasoningLevel: 'medium',
      docUrl: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
    },
  ],
  // Only the combinations the error-codes guide (read 2026-10-13) names with a
  // type and/or code. Documented WITHOUT a type or code, so they stay counted:
  // 401 (invalid authentication, incorrect API key, not in an organization,
  // IP not authorized), 403 (country, region, or territory not supported),
  // and 429 "Rate limit reached for requests". Billing 429s match on
  // `error.code` only: the guide says to check the code because `error.type`
  // may still be `insufficient_quota`.
  preProcessingRejections: [
    {
      status: 429,
      match: { by: 'type+code', errorType: 'rate_limit_error', errorCode: 'slow_down' },
      category: 'rate_limit',
      docUrl: OPENAI_ERRORS_DOC,
    },
    byCode(429, 'credit_balance_exhausted', 'rate_limit', OPENAI_ERRORS_DOC),
    byCode(429, 'organization_spend_limit_exceeded', 'rate_limit', OPENAI_ERRORS_DOC),
    byCode(429, 'project_spend_limit_exceeded', 'rate_limit', OPENAI_ERRORS_DOC),
    byCode(429, 'organization_usage_limit_exceeded', 'rate_limit', OPENAI_ERRORS_DOC),
    // 503 model temporarily overloaded.
    {
      status: 503,
      match: { by: 'type+code', errorType: 'service_unavailable_error', errorCode: 'server_is_overloaded' },
      category: 'overloaded',
      docUrl: OPENAI_ERRORS_DOC,
    },
  ],
};

// ---------------------------------------------------------------------------
// Kimi (Moonshot AI) — OpenAI-compatible Chat Completions. International
// endpoint; a key works only on the platform that issued it (China:
// https://api.moonshot.cn/v1). kimi-k3: always thinks; top-level
// `reasoning_effort` low/high/max (default max); temperature must be 1.0
// (omit it); `max_completion_tokens` default 131,072.
// kimi-k2.6 / k2.7-code are not listed: their output budgets are not documented.
// ---------------------------------------------------------------------------

const KIMI_ERRORS_DOC = 'https://platform.kimi.ai/docs/api/errors.md';

function kimiEffort(id: 'low' | 'high' | 'max', label: string): MeetingNoteAiReasoningLevel {
  return { id, label, wire: { reasoning_effort: id } };
}

const KIMI: MeetingNoteAiProviderCapability = {
  id: 'kimi',
  label: 'Kimi (Moonshot AI)',
  protocol: 'openai-chat-completions',
  baseUrl: 'https://api.moonshot.ai/v1',
  outputBudgetParam: 'max_completion_tokens',
  jsonOutput: 'json_schema',
  models: [
    {
      id: 'kimi-k3',
      label: 'Kimi K3',
      contextWindowTokens: 1_000_000,
      // Documented default for max_completion_tokens; input + output must fit the context.
      maxOutputTokens: 131_072,
      reasoningLevels: [kimiEffort('low', 'Low'), kimiEffort('high', 'High'), kimiEffort('max', 'Max')],
      defaultReasoningLevel: 'max',
      docUrl: 'https://platform.kimi.ai/docs/api/models-overview',
    },
  ],
  // Kimi documents each error by `error.type` (errors page).
  preProcessingRejections: [
    byType(401, 'invalid_authentication_error', 'authentication', KIMI_ERRORS_DOC),
    byType(401, 'incorrect_api_key_error', 'authentication', KIMI_ERRORS_DOC),
    byType(403, 'permission_denied_error', 'permission', KIMI_ERRORS_DOC),
    byType(429, 'rate_limit_reached_error', 'rate_limit', KIMI_ERRORS_DOC),
    // Balance/quota exhausted (429).
    byType(429, 'exceeded_current_quota_error', 'rate_limit', KIMI_ERRORS_DOC),
    byType(429, 'engine_overloaded_error', 'overloaded', KIMI_ERRORS_DOC),
    byType(503, 'server_unavailable', 'unavailable', KIMI_ERRORS_DOC),
  ],
};

// ---------------------------------------------------------------------------
// GLM (Z.ai / Zhipu) — OpenAI-compatible Chat Completions. International
// endpoint (China: https://open.bigmodel.cn/api/paas/v4/). `max_tokens` hard
// maximum 131,072; output 128K. JSON: `response_format` json_object only.
// glm-5.3: thinking always on, `reasoning_effort` low/high/max (default max).
// glm-5.2: `reasoning_effort` none..max (none/minimal skip thinking).
// glm-5.1: no reasoning_effort; `thinking: {type: enabled|disabled}`.
// ---------------------------------------------------------------------------

const GLM_ERRORS_DOC = 'https://docs.z.ai/api-reference/api-code.md';
const GLM_CHAT_DOC = 'https://docs.z.ai/api-reference/llm/chat-completion.md';

function glmEffort(id: string, label: string): MeetingNoteAiReasoningLevel {
  return { id, label, wire: { reasoning_effort: id } };
}

/** GLM documents business codes (`error.code`, as text) per HTTP status (api-code page). */
function glmCode(status: number, code: string, category: MeetingNoteAiRejectionCategory): MeetingNoteAiRejection {
  return byCode(status, code, category, GLM_ERRORS_DOC);
}

const GLM: MeetingNoteAiProviderCapability = {
  id: 'glm',
  label: 'GLM (Z.ai)',
  protocol: 'openai-chat-completions',
  baseUrl: 'https://api.z.ai/api/paas/v4',
  outputBudgetParam: 'max_tokens',
  jsonOutput: 'json_object',
  models: [
    {
      id: 'glm-5.3',
      label: 'GLM-5.3',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      reasoningLevels: [glmEffort('low', 'Low'), glmEffort('high', 'High'), glmEffort('max', 'Max')],
      defaultReasoningLevel: 'max',
      docUrl: GLM_CHAT_DOC,
    },
    {
      id: 'glm-5.2',
      label: 'GLM-5.2',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      reasoningLevels: [
        glmEffort('none', 'None'),
        glmEffort('minimal', 'Minimal'),
        glmEffort('low', 'Low'),
        glmEffort('medium', 'Medium'),
        glmEffort('high', 'High'),
        glmEffort('xhigh', 'Extra high'),
        glmEffort('max', 'Max'),
      ],
      defaultReasoningLevel: 'max',
      docUrl: GLM_CHAT_DOC,
    },
    {
      id: 'glm-5.1',
      label: 'GLM-5.1',
      contextWindowTokens: 200_000,
      maxOutputTokens: 128_000,
      reasoningLevels: [
        { id: 'none', label: 'Thinking off', wire: { thinking: { type: 'disabled' } } },
        { id: 'on', label: 'Thinking on', wire: { thinking: { type: 'enabled' } } },
      ],
      defaultReasoningLevel: 'on',
      docUrl: GLM_CHAT_DOC,
    },
  ],
  preProcessingRejections: [
    glmCode(401, '1000', 'authentication'), // authentication failed
    glmCode(401, '1001', 'authentication'), // authentication header missing
    glmCode(401, '1003', 'authentication'), // token expired
    glmCode(401, '1005', 'authentication'), // two-factor authentication required
    glmCode(403, '1220', 'permission'), // no permission for the API
    glmCode(429, '1113', 'rate_limit'), // insufficient balance
    glmCode(429, '1302', 'rate_limit'), // rate limit
    glmCode(429, '1305', 'overloaded'), // overloaded, try again later
    glmCode(429, '1308', 'rate_limit'), // usage limit (with reset time)
    glmCode(429, '1309', 'rate_limit'), // plan/quota limit
    glmCode(429, '1310', 'rate_limit'), // usage limit (with reset time)
    glmCode(429, '1311', 'rate_limit'), // plan/quota limit
    ...['1313', '1314', '1315', '1316', '1317', '1318', '1319', '1320', '1321'].map((code) =>
      glmCode(429, code, 'rate_limit') // plan/quota limits
    ),
  ],
};

export const MEETING_NOTE_AI_CAPABILITIES: Readonly<Record<MeetingNoteAiProvider, MeetingNoteAiProviderCapability>> = {
  anthropic: ANTHROPIC,
  openai: OPENAI,
  kimi: KIMI,
  glm: GLM,
};

/** Provider order shown to admins. */
const PROVIDER_ORDER: readonly MeetingNoteAiProvider[] = ['anthropic', 'openai', 'kimi', 'glm'];

export function findMeetingNoteAiModel(
  provider: MeetingNoteAiProvider,
  modelId: string
): MeetingNoteAiModelCapability | null {
  return MEETING_NOTE_AI_CAPABILITIES[provider].models.find((model) => model.id === modelId) ?? null;
}

/** Whether an admin's provider/model/reasoning choice is in the matrix. */
export function checkMeetingNoteAiSelection(
  provider: MeetingNoteAiProvider,
  modelId: string,
  reasoningLevel: string
): 'ok' | 'MEETING_NOTE_AI_MODEL_INVALID' | 'MEETING_NOTE_AI_REASONING_INVALID' {
  const model = findMeetingNoteAiModel(provider, modelId);
  if (!model) return 'MEETING_NOTE_AI_MODEL_INVALID';
  return model.reasoningLevels.some((level) => level.id === reasoningLevel) ? 'ok' : 'MEETING_NOTE_AI_REASONING_INVALID';
}

/** The non-secret part of the matrix the admin form needs (no wire data, URLs, or rejections). */
export function meetingNoteAiProviderOptions(): MeetingNoteAiProviderOption[] {
  return PROVIDER_ORDER.map((id) => {
    const provider = MEETING_NOTE_AI_CAPABILITIES[id];
    return {
      id,
      label: provider.label,
      models: provider.models.map(
        (model): MeetingNoteAiModelOption => ({
          id: model.id,
          label: model.label,
          reasoningLevels: model.reasoningLevels.map(({ id: levelId, label }) => ({ id: levelId, label })),
          defaultReasoningLevel: model.defaultReasoningLevel,
          contextWindowTokens: model.contextWindowTokens,
          maxOutputTokens: model.maxOutputTokens,
        })
      ),
    };
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The `error` object of a provider's NORMAL error body, or null for any other
 * body. Anthropic: {"type":"error","error":{"type","message"}}; the
 * OpenAI-compatible providers (OpenAI, Kimi, GLM): {"error":{"message",
 * "type"?, "code"?}}.
 */
function normalErrorObject(protocol: MeetingNoteAiWireProtocol, body: unknown): Record<string, unknown> | null {
  const root = asObject(body);
  const error = asObject(root?.error);
  if (!root || !error || typeof error.message !== 'string') return null;
  if (protocol === 'anthropic-messages' && (root.type !== 'error' || typeof error.type !== 'string')) return null;
  return error;
}

function matchesRejection(match: MeetingNoteAiRejectionMatch, error: Record<string, unknown>): boolean {
  // GLM documents its business codes as text; a numeric code compares as text.
  const code = typeof error.code === 'number' ? String(error.code) : error.code;
  switch (match.by) {
    case 'type':
      return error.type === match.errorType;
    case 'code':
      return code === match.errorCode;
    case 'type+code':
      return error.type === match.errorType && code === match.errorCode;
  }
}

/**
 * FR-022: the refund category of a provider's INITIAL non-2xx response, or
 * null when the dispatch stays counted. Only the provider's normal error body
 * whose status and documented type/code are listed for it qualifies.
 */
export function classifyMeetingNoteAiPreProcessingRejection(
  provider: MeetingNoteAiProvider,
  status: number,
  body: unknown
): MeetingNoteAiRejectionCategory | null {
  if (status >= 200 && status < 300) return null;
  const capability = MEETING_NOTE_AI_CAPABILITIES[provider];
  const error = normalErrorObject(capability.protocol, body);
  if (!error) return null;
  const rejection = capability.preProcessingRejections.find(
    (entry) => entry.status === status && matchesRejection(entry.match, error)
  );
  return rejection?.category ?? null;
}
