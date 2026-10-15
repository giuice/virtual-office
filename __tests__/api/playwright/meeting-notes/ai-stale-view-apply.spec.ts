import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import {
  configureFakeOpenAi,
  fakeAi,
  openAiNotice,
  processToReview,
  successOutcome,
} from '../helpers/meeting-notes-ai-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-010 (FR-018), stale view (final review F-2): the note view is open at
 * revision N while the note is edited elsewhere (here another tab of the same
 * editor, through the real route). The draft generated afterwards is bound to
 * revision N + 1; the review must compare it with the note's current
 * revision, not the view's cached N, so Apply is offered and succeeds.
 */
test.describe('meeting notes — AI draft after an edit made elsewhere (AC-010)', () => {
  test('the review takes the note revision read by the access check; Apply succeeds', async ({
    primaryPage,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    try {
      const tag = notesWorld.runTag;
      const page = primaryPage;
      const space = await notesWorld.createSpace('Stale view room');
      const noteId = await notesWorld.createNote(page, {
        spaceId: space.id,
        title: `${MEETING_NOTES_E2E_PREFIX} Stale view ${tag}`,
        meetingDate: new Date(),
        content: '<p>Planning</p>',
      });
      await notesWorld.setSummaryAndTranscriptUnsafe(noteId, {
        summary: null,
        transcript: `Ana: Carla will book the venue ${tag}.`,
      });

      // The view caches the current revision.
      const view = await openNote(page, noteId);
      const before = (await notesWorld.readNote(page, noteId)).note;
      if (!before) throw new Error('note not readable');

      // Edited elsewhere: the open view does not know about the new revision.
      const editedTitle = `${MEETING_NOTES_E2E_PREFIX} Stale view edited ${tag}`;
      const revision = await notesWorld.updateNote(page, noteId, {
        expectedRevision: before.revision,
        title: editedTitle,
        meetingDate: new Date(before.meetingDate),
        content: before.content,
        participantIds: before.participants.map((participant) => participant.userId),
      });
      expect(revision).toBe(before.revision + 1);
      await expect(view.getByText(editedTitle)).toHaveCount(0);

      await fakeAi.script(
        'openai',
        successOutcome({
          summary: { keyPoints: [`The venue is pending ${tag}`], decisions: [], nextSteps: [] },
          actionItems: [{ description: `Book the venue ${tag}`, assigneeName: null }],
        }),
      );
      await openAiNotice(page);
      const review = await processToReview(page);
      await expect(review).toHaveAttribute('data-source-revision', String(revision));
      await expect(page.getByTestId('meeting-note-ai-conflict')).toHaveCount(0);
      // The view now shows the note it confirmed (the edit made elsewhere).
      await expect(view.getByText(editedTitle).first()).toBeVisible({ timeout: 15_000 });

      const apply = review.getByTestId('meeting-note-ai-apply');
      await expect(apply).toBeEnabled();
      await apply.click();
      await expect(page.getByTestId('meeting-note-ai-review')).toHaveCount(0, { timeout: 30_000 });

      const after = (await notesWorld.readNote(page, noteId)).note;
      expect(after?.revision).toBe(revision + 1);
      expect(after?.title).toBe(editedTitle);
      expect(after?.actionItems.map((item) => item.description)).toEqual([`Book the venue ${tag}`]);
      expect(after?.summary).toBe(['Key points', `- The venue is pending ${tag}`].join('\n'));
    } finally {
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
