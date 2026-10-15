// src/repositories/interfaces/IMeetingNoteAiSettingsRepository.ts
// Company AI settings (Phase 6 T8). Metadata reads run under the caller's RLS
// (company members); the save and key-read RPCs are service_role only and are
// called by server code AFTER the route authorized the application user.
import type { MeetingNoteAiProvider, MeetingNoteAiSettingsView } from '@/types/meeting-notes';

export interface SaveMeetingNoteAiSettingsParams {
  /** Server-derived application users.id of the authorized admin. */
  actorUserId: string;
  companyId: string;
  expectedRevision: number | null;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  dailyLimit: number;
  /** Write-only; null keeps the stored key. */
  apiKey: string | null;
}

/** The settings snapshot with the decrypted key (server code only, never returned to a client). */
export interface MeetingNoteAiKeySnapshot {
  revision: number;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  dailyLimit: number;
  apiKey: string;
}

export interface IMeetingNoteAiSettingsRepository {
  /** The company's settings visible to the client's session; a missing row reads as not configured. */
  findByCompany(companyId: string): Promise<MeetingNoteAiSettingsView>;
  /** Saves settings and (optionally) the key atomically; returns masked metadata. Service-role client only. */
  save(params: SaveMeetingNoteAiSettingsParams): Promise<MeetingNoteAiSettingsView>;
  /** The settings snapshot with the decrypted key, or null when not configured. Service-role client only. */
  readKey(companyId: string): Promise<MeetingNoteAiKeySnapshot | null>;
}
