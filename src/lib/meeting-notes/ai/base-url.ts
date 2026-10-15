// src/lib/meeting-notes/ai/base-url.ts
// Provider base URL for the meeting-note adapters (Phase 6 T11). The real URL
// comes from the capability matrix. A server-only environment variable,
// MEETING_NOTES_AI_BASE_URL_OVERRIDE, points every provider at the local fake
// AI server in tests (T16):
//   `${override}/${provider}${new URL(capability.baseUrl).pathname}`
// It is read from the server's environment only — no request input can set
// it — and it is IGNORED when NODE_ENV is "production", with one refusal line
// logged per resolution (the variable's value is never logged). An override
// that is not a plain http(s) origin/path fails closed instead of falling back
// to the real provider.
import 'server-only';

import type { MeetingNoteAiProvider } from '@/types/meeting-notes';

import { MEETING_NOTE_AI_CAPABILITIES } from './capabilities';

export const MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV = 'MEETING_NOTES_AI_BASE_URL_OVERRIDE';

export type MeetingNoteAiBaseUrlResolution =
  | { ok: true; baseUrl: string; overridden: boolean }
  | { ok: false; code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveMeetingNoteAiBaseUrl(provider: MeetingNoteAiProvider): MeetingNoteAiBaseUrlResolution {
  const realBaseUrl = withoutTrailingSlash(MEETING_NOTE_AI_CAPABILITIES[provider].baseUrl);
  const override = process.env[MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV]?.trim();
  if (!override) return { ok: true, baseUrl: realBaseUrl, overridden: false };

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[meeting-notes ai] ${MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV} is set but refused in production; using the provider's real API URL.`
    );
    return { ok: true, baseUrl: realBaseUrl, overridden: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    return { ok: false, code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return { ok: false, code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };
  }
  const realPath = withoutTrailingSlash(new URL(realBaseUrl).pathname);
  return {
    ok: true,
    baseUrl: `${withoutTrailingSlash(parsed.origin + parsed.pathname)}/${provider}${realPath}`,
    overridden: true,
  };
}
