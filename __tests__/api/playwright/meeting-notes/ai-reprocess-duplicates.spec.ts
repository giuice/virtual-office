import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import {
  configureFakeOpenAi,
  fakeAi,
  openAiNotice,
  processToReview,
  successOutcome,
  suggestions,
} from '../helpers/meeting-notes-ai-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-027 (FR-018, FR-019), UI part: an editor reprocesses the stored
 * transcript of a note that already has a summary and three action items (one
 * completed). The draft repeats one existing item (different case and
 * spacing) and proposes two new ones: the repeat arrives unchecked and marked
 * "Already exists", Apply appends only the two accepted new items, and the
 * three existing items — including the completion — are unchanged. The
 * 100-item refusal of Apply is covered by the DB integration suite.
 */
test.describe('meeting notes — reprocess with existing items (AC-027)', () => {
  test('a repeated item arrives unchecked as "Already exists"; Apply appends only the accepted new items', async ({
    primaryPage,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    try {
      const tag = notesWorld.runTag;
      const page = primaryPage;
      const space = await notesWorld.createSpace('Reprocess room');
      const noteId = await notesWorld.createNote(page, {
        spaceId: space.id,
        title: `${MEETING_NOTES_E2E_PREFIX} Reprocess ${tag}`,
        meetingDate: new Date(),
        content: '<p>Weekly sync</p>',
      });
      await notesWorld.addActionItem(page, noteId, `Send the agenda ${tag}`);
      const budget = await notesWorld.addActionItem(page, noteId, `Review the budget ${tag}`);
      await notesWorld.addActionItem(page, noteId, `Call the vendor ${tag}`);
      const completion = await page.request.put(`/api/meeting-notes/${noteId}/items/${budget.id}/completion`, {
        data: { expectedRevision: budget.revision, completed: true },
      });
      expect(completion.status(), await completion.text()).toBe(200);
      await notesWorld.setSummaryAndTranscriptUnsafe(noteId, {
        summary: `Key points\n- Earlier summary ${tag}`,
        transcript: `Ana: Review the budget. Bruno: draft the press release and update the roadmap ${tag}.`,
      });
      const before = await notesWorld.readNote(page, noteId);
      expect(before.note?.actionItems).toHaveLength(3);
      const existing = (before.note?.actionItems ?? []).map((item) => ({
        id: item.id,
        description: item.description,
        completed: item.completed,
        revision: item.revision,
        assigneeId: item.assigneeId,
        dueDate: item.dueDate,
      }));
      expect(existing.find((item) => item.id === budget.id)?.completed).toBe(true);
      const versionsBefore = (await notesWorld.readVersions(page, noteId)).length;

      await fakeAi.script(
        'openai',
        successOutcome({
          summary: {
            keyPoints: [`The budget is on track ${tag}`],
            decisions: [],
            nextSteps: [`Publish the press release ${tag}`],
          },
          actionItems: [
            { description: `  REVIEW   THE BUDGET ${tag.toUpperCase()} `, assigneeName: null },
            { description: `Draft the press release ${tag}`, assigneeName: null },
            { description: `Update the roadmap ${tag}`, assigneeName: null },
          ],
        }),
      );

      // Reprocess (the note already has a summary).
      await openNote(page, noteId);
      const start = page.getByTestId('meeting-note-ai-start');
      await expect(start).toHaveText(/Reprocess transcript/);
      await openAiNotice(page);
      const review = await processToReview(page);

      const rows = suggestions(page);
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toHaveAttribute('data-duplicate', 'true');
      await expect(rows.nth(0).getByTestId('meeting-note-ai-suggestion-duplicate')).toHaveText('Already exists');
      await expect(rows.nth(0).getByTestId('meeting-note-ai-suggestion-accept')).not.toBeChecked();
      await expect(rows.nth(0)).toHaveAttribute('data-state', 'unchecked');
      for (const index of [1, 2]) {
        await expect(rows.nth(index)).toHaveAttribute('data-duplicate', 'false');
        await expect(rows.nth(index).getByTestId('meeting-note-ai-suggestion-accept')).toBeChecked();
      }

      await review.getByTestId('meeting-note-ai-apply').click();
      await expect(page.getByTestId('meeting-note-ai-review')).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByTestId('meeting-note-item')).toHaveCount(5, { timeout: 15_000 });

      const after = await notesWorld.readNote(page, noteId);
      const items = after.note?.actionItems ?? [];
      expect(items).toHaveLength(5);
      // The existing items, completion included, are untouched.
      for (const item of existing) {
        const now = items.find((candidate) => candidate.id === item.id);
        expect(now, `existing item ${item.description}`).toBeDefined();
        expect({
          id: now?.id,
          description: now?.description,
          completed: now?.completed,
          revision: now?.revision,
          assigneeId: now?.assigneeId,
          dueDate: now?.dueDate,
        }).toEqual(item);
      }
      // Only the two accepted new items were appended; the repeat was not.
      const added = items.filter((item) => !existing.some((old) => old.id === item.id)).map((item) => item.description).sort();
      expect(added).toEqual([`Draft the press release ${tag}`, `Update the roadmap ${tag}`]);
      expect(items.filter((item) => item.description.toLowerCase().includes('review the budget'))).toHaveLength(1);
      expect(after.note?.summary).toBe(
        ['Key points', `- The budget is on track ${tag}`, '', 'Next steps', `- Publish the press release ${tag}`].join('\n'),
      );
      expect((await notesWorld.readVersions(page, noteId)).length).toBe(versionsBefore + 1);
    } finally {
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
