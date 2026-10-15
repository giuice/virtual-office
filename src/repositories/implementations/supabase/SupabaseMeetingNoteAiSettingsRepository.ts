// src/repositories/implementations/supabase/SupabaseMeetingNoteAiSettingsRepository.ts
// Company AI settings (Phase 6 T8; migration 20261013142351). Construct with
// the user's server client for metadata reads (RLS: company members) and with
// the service-role client for save/readKey (service_role-only RPCs), and only
// after the route has authorized the application user. Server-only: readKey
// returns a decrypted API key. Deliberately not re-exported from the
// implementations index, which client code may import.
import 'server-only';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { MeetingNoteAiSettingsDbError } from '@/lib/meeting-notes/ai/settings-errors';
import { MEETING_NOTE_AI_DEFAULT_DAILY_LIMIT } from '@/lib/meeting-notes/ai/settings-limits';
import type {
  IMeetingNoteAiSettingsRepository,
  MeetingNoteAiKeySnapshot,
  SaveMeetingNoteAiSettingsParams,
} from '@/repositories/interfaces/IMeetingNoteAiSettingsRepository';
import type { MeetingNoteAiProvider, MeetingNoteAiSettingsView } from '@/types/meeting-notes';

const PROVIDERS: ReadonlySet<string> = new Set<MeetingNoteAiProvider>(['anthropic', 'openai', 'kimi', 'glm']);

/** Every column of the table is metadata; listed explicitly so a future column is never read by accident. */
const METADATA_COLUMNS =
  'company_id, provider, model, reasoning_level, daily_limit, revision, key_last_four, updated_by_user_id, updated_by_name, updated_at';

interface SettingsRow {
  provider: string;
  model: string;
  reasoning_level: string;
  daily_limit: number;
  revision: number | string;
  key_last_four: string;
  updated_by_user_id: string | null;
  updated_by_name: string;
  updated_at: string;
}

export const NOT_CONFIGURED_AI_SETTINGS: MeetingNoteAiSettingsView = Object.freeze({
  configured: false,
  provider: null,
  model: null,
  reasoningLevel: null,
  dailyLimit: MEETING_NOTE_AI_DEFAULT_DAILY_LIMIT,
  revision: null,
  keyLastFour: null,
  updatedBy: null,
  updatedAt: null,
}) as MeetingNoteAiSettingsView;

function toDbError(error: PostgrestError): MeetingNoteAiSettingsDbError {
  return new MeetingNoteAiSettingsDbError(error.code, error.message, error.details);
}

function invalidShape(what: string): MeetingNoteAiSettingsDbError {
  return new MeetingNoteAiSettingsDbError(undefined, undefined, `${what} returned an unexpected shape`);
}

function isProvider(value: unknown): value is MeetingNoteAiProvider {
  return typeof value === 'string' && PROVIDERS.has(value);
}

function toRevision(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function toView(row: SettingsRow, what: string): MeetingNoteAiSettingsView {
  const revision = toRevision(row.revision);
  if (!isProvider(row.provider) || revision === null) throw invalidShape(what);
  return {
    configured: true,
    provider: row.provider,
    model: row.model,
    reasoningLevel: row.reasoning_level,
    dailyLimit: row.daily_limit,
    revision,
    keyLastFour: row.key_last_four,
    updatedBy: { userId: row.updated_by_user_id, name: row.updated_by_name },
    updatedAt: row.updated_at,
  };
}

export class SupabaseMeetingNoteAiSettingsRepository implements IMeetingNoteAiSettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByCompany(companyId: string): Promise<MeetingNoteAiSettingsView> {
    const { data, error } = await this.supabase
      .from('meeting_note_ai_settings')
      .select(METADATA_COLUMNS)
      .eq('company_id', companyId)
      .maybeSingle<SettingsRow>();
    if (error) throw toDbError(error);
    return data ? toView(data, 'meeting_note_ai_settings') : NOT_CONFIGURED_AI_SETTINGS;
  }

  async save(params: SaveMeetingNoteAiSettingsParams): Promise<MeetingNoteAiSettingsView> {
    const { data, error } = await this.supabase.rpc('save_meeting_note_ai_settings', {
      p_actor_user_id: params.actorUserId,
      p_company_id: params.companyId,
      p_expected_revision: params.expectedRevision,
      p_provider: params.provider,
      p_model: params.model,
      p_reasoning_level: params.reasoningLevel,
      p_daily_limit: params.dailyLimit,
      p_api_key: params.apiKey,
    });
    if (error) throw toDbError(error);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidShape('save_meeting_note_ai_settings');
    return toView(data as SettingsRow, 'save_meeting_note_ai_settings');
  }

  async readKey(companyId: string): Promise<MeetingNoteAiKeySnapshot | null> {
    const { data, error } = await this.supabase.rpc('read_meeting_note_ai_key', { p_company_id: companyId });
    if (error) throw toDbError(error);
    if (data === null) return null;
    if (typeof data !== 'object' || Array.isArray(data)) throw invalidShape('read_meeting_note_ai_key');
    const row = data as Record<string, unknown>;
    const revision = toRevision(row.revision);
    if (
      revision === null ||
      !isProvider(row.provider) ||
      typeof row.model !== 'string' ||
      typeof row.reasoning_level !== 'string' ||
      typeof row.daily_limit !== 'number' ||
      typeof row.api_key !== 'string'
    ) {
      throw invalidShape('read_meeting_note_ai_key');
    }
    return {
      revision,
      provider: row.provider,
      model: row.model,
      reasoningLevel: row.reasoning_level,
      dailyLimit: row.daily_limit,
      apiKey: row.api_key,
    };
  }
}
