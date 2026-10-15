// Vitest globalSetup of the meeting-notes DB suite (T16): starts the fake AI
// server once per run on its fixed loopback port, runs the self-check (fails
// the run loudly on any mismatch), and stops it at the end. Test workers reach
// it over HTTP; MEETING_NOTES_AI_BASE_URL_OVERRIDE is set for them in
// vitest.meeting-notes-db.config.mts (test.env).
import { runMeetingNotesFakeAiSelfCheck } from './self-check';
import { startMeetingNotesFakeAiServer } from './server';

export default async function setup(): Promise<() => Promise<void>> {
  const server = await startMeetingNotesFakeAiServer();
  try {
    const lines = await runMeetingNotesFakeAiSelfCheck(server.baseUrl);
    console.log(`[meeting-notes fake AI] listening on ${server.baseUrl}; self-check passed:\n  ${lines.join('\n  ')}`);
  } catch (err) {
    await server.close();
    throw err;
  }
  return async () => {
    await server.close();
    console.log('[meeting-notes fake AI] stopped');
  };
}
