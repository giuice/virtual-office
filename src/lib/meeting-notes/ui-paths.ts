// src/lib/meeting-notes/ui-paths.ts
// App URLs of the meeting-notes screens (Phase 6). The note view and the
// create form are built in T6; every link to them goes through here.

/** The Meetings page: every note of the company, with search and filters. */
export const MEETINGS_PATH = '/meetings';

/** A note's view. */
export function meetingNotePath(noteId: string): string {
  return `${MEETINGS_PATH}/${encodeURIComponent(noteId)}`;
}

/** The create form, preset to a space. */
export function newMeetingNotePath(spaceId: string): string {
  return `${MEETINGS_PATH}/new?${new URLSearchParams({ spaceId }).toString()}`;
}

/** DOM id of the admin "AI" section on the company page. */
export const AI_SETTINGS_SECTION_ID = 'ai-settings';

/** The company page's admin settings tab, scrolled to the AI section (FR-025 admin link). */
export const AI_SETTINGS_PATH = `/company?tab=settings#${AI_SETTINGS_SECTION_ID}`;
