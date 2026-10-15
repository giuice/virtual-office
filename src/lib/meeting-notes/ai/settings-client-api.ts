// src/lib/meeting-notes/ai/settings-client-api.ts
// Browser calls to /api/companies/ai-settings (Phase 6 T8). The key is sent
// only on save and never comes back; every response carries metadata only.
import { MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import type {
  MeetingNoteAiSettingsResponse,
  MeetingNoteAiSettingsView,
  SaveMeetingNoteAiSettingsInput,
} from '@/types/meeting-notes';

export const MEETING_NOTE_AI_SETTINGS_PATH = '/api/companies/ai-settings';

/** 409: another admin saved first; carries the settings as they are now. */
export class MeetingNoteAiSettingsConflictError extends MeetingNotesApiError {
  readonly settings: MeetingNoteAiSettingsView;

  constructor(message: string, settings: MeetingNoteAiSettingsView) {
    super(409, 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION', message);
    this.name = 'MeetingNoteAiSettingsConflictError';
    this.settings = settings;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isSettingsView(value: unknown): value is MeetingNoteAiSettingsView {
  const view = asRecord(value);
  return typeof view.configured === 'boolean' && typeof view.dailyLimit === 'number';
}

function invalidResponse(status = 200): MeetingNotesApiError {
  return new MeetingNotesApiError(status, 'INVALID_RESPONSE', 'Unexpected response from the server.');
}

async function request(init: RequestInit & { signal?: AbortSignal }): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(MEETING_NOTE_AI_SETTINGS_PATH, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new MeetingNotesApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }
  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await response.json());
  } catch {
    if (response.ok) throw invalidResponse(response.status);
  }
  if (!response.ok) {
    const code = typeof body.code === 'string' ? body.code : `HTTP_${response.status}`;
    const message = typeof body.error === 'string' ? body.error : `Request failed (${response.status})`;
    if (response.status === 409 && code === 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION' && isSettingsView(body.settings)) {
      throw new MeetingNoteAiSettingsConflictError(message, body.settings);
    }
    throw new MeetingNotesApiError(response.status, code, message);
  }
  return body;
}

/** GET — settings metadata, provider options, and whether the caller may save. */
export async function fetchMeetingNoteAiSettings(signal?: AbortSignal): Promise<MeetingNoteAiSettingsResponse> {
  const body = await request({ method: 'GET', signal });
  if (!isSettingsView(body.settings) || !Array.isArray(body.providers) || typeof body.canManage !== 'boolean') {
    throw invalidResponse();
  }
  return body as unknown as MeetingNoteAiSettingsResponse;
}

/** PUT — saves; resolves with the masked settings (409 → MeetingNoteAiSettingsConflictError). */
export async function saveMeetingNoteAiSettings(
  input: SaveMeetingNoteAiSettingsInput,
  signal?: AbortSignal
): Promise<MeetingNoteAiSettingsView> {
  const body = await request({ method: 'PUT', body: JSON.stringify(input), signal });
  if (!isSettingsView(body.settings)) throw invalidResponse();
  return body.settings;
}
