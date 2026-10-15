import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import {
  aiSection,
  configureFakeOpenAi,
  fakeAi,
  openAiNotice,
  processThroughApi,
  readAiUsage,
  readStoredTranscript,
  setAiDailyLimit,
  successOutcome,
} from '../helpers/meeting-notes-ai-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-016, UI part (FR-021, FR-022, FR-023, BR-008): in the note view,
 *   * the provider failing AFTER processing → the note and transcript are
 *     unchanged, an error with "Try again" appears, and usage grows by one;
 *   * "Try again" is a new operation (new notice); a listed pre-processing
 *     rejection (OpenAI 503 service_unavailable_error/server_is_overloaded)
 *     → error with "Try again" and usage unchanged;
 *   * the company reaching its daily limit between the notice and "Process"
 *     → processing is refused with the limit and the reset time in the
 *     viewer's local time, and the provider receives nothing.
 * Counting rules per outcome, timeouts, malformed output, and the midnight
 * reset are covered by the DB integration suite (meeting-note-ai-processing,
 * meeting-note-ai-usage). Usage is read through the real ticket route.
 */
test.describe('meeting notes — AI processing errors and the daily limit (AC-016 UI)', () => {
  test('errors offer "Try again" with the right counting; the limit is shown with its local reset time', async ({
    primaryPage,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    try {
      const tag = notesWorld.runTag;
      const page = primaryPage;
      const space = await notesWorld.createSpace('AI errors room');
      const noteId = await notesWorld.createNote(page, {
        spaceId: space.id,
        title: `${MEETING_NOTES_E2E_PREFIX} AI errors ${tag}`,
        meetingDate: new Date(),
        content: '<p>Manual notes</p>',
      });
      const transcript = `Ana: The release moves to Monday ${tag}.`;
      await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript });
      const before = await notesWorld.readNote(page, noteId);
      const usage0 = await readAiUsage(page, noteId);

      const expectNoteUnchanged = async () => {
        const now = await notesWorld.readNote(page, noteId);
        expect(now.note?.summary).toBeNull();
        expect(now.note?.actionItems).toEqual([]);
        expect(now.note?.revision).toBe(before.note?.revision);
        expect(await readStoredTranscript(page, noteId)).toBe(transcript);
      };

      // 1. The provider fails after processing: error + "Try again", counted.
      await fakeAi.script('openai', { kind: 'error_after_processing', status: 500 });
      await openNote(page, noteId);
      await openAiNotice(page);
      await page.getByTestId('meeting-note-ai-process').click();
      const firstError = aiSection(page).getByTestId('meeting-note-ai-error');
      await expect(firstError).toBeVisible({ timeout: 60_000 });
      await expect(firstError.getByTestId('meeting-note-ai-try-again')).toBeVisible();
      await expect(page.getByTestId('meeting-note-ai-review')).toHaveCount(0);
      await expectNoteUnchanged();
      expect((await readAiUsage(page, noteId)).used).toBe(usage0.used + 1);

      // 2. "Try again" = a new notice and operation; a listed pre-processing rejection is not counted.
      await fakeAi.script('openai', {
        kind: 'rejection',
        status: 503,
        errorType: 'service_unavailable_error',
        errorCode: 'server_is_overloaded',
      });
      await openAiNotice(page, firstError.getByTestId('meeting-note-ai-try-again'));
      await page.getByTestId('meeting-note-ai-process').click();
      const secondError = aiSection(page).getByTestId('meeting-note-ai-error');
      await expect(secondError).toBeVisible({ timeout: 60_000 });
      await expect(secondError.getByTestId('meeting-note-ai-try-again')).toBeVisible();
      await expectNoteUnchanged();
      expect((await readAiUsage(page, noteId)).used).toBe(usage0.used + 1);
      expect(await fakeAi.received('openai')).toBe(2);

      // 3. The limit is reached after the notice was shown: refused with the limit and local reset time.
      const limit = usage0.used + 2;
      expect(limit, 'the day already used almost the whole maximum limit').toBeLessThanOrEqual(200);
      await setAiDailyLimit(page, limit);
      const notice = await openAiNotice(page, secondError.getByTestId('meeting-note-ai-try-again'));
      await expect(notice.getByTestId('meeting-note-ai-notice-usage')).toContainText(`${usage0.used + 1} of ${limit}`);
      await expect(page.getByTestId('meeting-note-ai-process')).toBeEnabled();
      // Another processing of the company uses the last unit meanwhile.
      await fakeAi.script(
        'openai',
        successOutcome({
          summary: { keyPoints: [`Elsewhere ${tag}`], decisions: [], nextSteps: [] },
          actionItems: [],
        }),
      );
      expect(await processThroughApi(page, noteId)).toBe(200);
      const full = await readAiUsage(page, noteId);
      expect(full.used).toBe(limit);
      expect(await fakeAi.received('openai')).toBe(3);

      await page.getByTestId('meeting-note-ai-process').click();
      const limitError = aiSection(page).getByTestId('meeting-note-ai-error');
      await expect(limitError).toBeVisible({ timeout: 30_000 });
      const localReset = await page.evaluate(
        (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
        full.resetAt,
      );
      await expect(limitError).toContainText(`limit of ${limit} AI processings`);
      await expect(limitError).toContainText(`It resets at ${localReset}.`);
      await expect(limitError.getByTestId('meeting-note-ai-try-again')).toHaveCount(0);
      expect(await fakeAi.received('openai'), 'a refused start never reaches the provider').toBe(3);
      await expectNoteUnchanged();

      // A new notice says the same and does not offer "Process".
      await limitError.getByTestId('meeting-note-ai-error-close').click();
      const limitedNotice = await openAiNotice(page);
      await expect(limitedNotice.getByTestId('meeting-note-ai-limit')).toContainText(`It resets at ${localReset}.`);
      await expect(page.getByTestId('meeting-note-ai-process')).toBeDisabled();
    } finally {
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
