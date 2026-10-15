// Playwright globalSetup of the meeting-notes E2E runner (T16): starts the fake
// AI server in the runner process on its fixed loopback port, runs the
// self-check, and returns the teardown that stops it. The Next dev server gets
// MEETING_NOTES_AI_BASE_URL_OVERRIDE from playwright.meeting-notes.config.ts
// (its URL is fixed, so the server can start before this setup runs).
import { runMeetingNotesFakeAiSelfCheck } from './self-check';
import { startMeetingNotesFakeAiServer } from './server';

export default async function meetingNotesFakeAiGlobalSetup(): Promise<() => Promise<void>> {
  const server = await startMeetingNotesFakeAiServer();
  try {
    const lines = await runMeetingNotesFakeAiSelfCheck(server.baseUrl);
    console.log(`[meeting-notes fake AI] listening on ${server.baseUrl}; self-check passed (${lines.length} protocols)`);
  } catch (err) {
    await server.close();
    throw err;
  }
  return async () => {
    await server.close();
  };
}
