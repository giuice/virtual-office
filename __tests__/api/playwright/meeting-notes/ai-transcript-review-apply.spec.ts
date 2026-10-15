import { expect, test } from '../fixtures/meeting-notes';
import { localDay, MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import {
  chooseTranscriptFile,
  configureFakeOpenAi,
  E2E_AI_MODEL_LABEL,
  E2E_AI_PROVIDER_LABEL,
  fakeAi,
  openAiNotice,
  processToReview,
  readStoredTranscript,
  successOutcome,
  suggestions,
  transcriptFile,
} from '../helpers/meeting-notes-ai-e2e';

/**
 * AC-010 (FR-012, FR-015, FR-016, FR-018, BR-006, BR-010), the J5 journey in
 * the real UI: a member chooses "New note from transcript" in a space's Notes
 * tab → the note exists at once (title = file name, today's date, the
 * transcript stored) → the notice names the provider and model → "Process"
 * returns a draft that changes nothing → the member edits the summary,
 * reassigns one suggestion, rejects one, accepts another → Apply stores
 * exactly the edited summary and the two accepted items in one new version →
 * attaching a new transcript replaces it immediately and keeps the summary.
 * Only the external provider is replaced (fake AI server, OpenAI protocol).
 */
test.describe('meeting notes — transcript to applied AI draft (AC-010)', () => {
  test('upload, notice, process, review, and Apply store exactly the reviewed draft; a new transcript keeps the summary', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    try {
      const tag = notesWorld.runTag;
      const space = await notesWorld.createSpace('Transcript room');
      const primaryName = await notesWorld.displayNameOf(messagingData.primary.userId);
      const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
      const page = secondaryPage;

      // "New note from transcript" in the space's Notes tab.
      const fileBase = `${MEETING_NOTES_E2E_PREFIX} Planning sync ${tag}`;
      const transcript = [
        `${primaryName}: I will update the changelog before Friday.`,
        'Zephyrine: Someone has to book the demo room.',
        `${secondaryName}: Launch stays on Friday.`,
      ].join('\n');
      await page.goto('/floor-plan');
      const card = page.getByTestId(`space-${space.id}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await card.click();
      const panel = page.getByRole('region', { name: `Details for ${space.name}` });
      await expect(panel).toBeVisible();
      await panel.getByRole('tab', { name: 'Notes' }).click();
      await chooseTranscriptFile(
        page,
        panel.getByRole('button', { name: `New note from transcript in ${space.name}` }),
        transcriptFile(`${fileBase}.txt`, transcript),
      );

      // The note exists immediately and its view opens.
      await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      const noteId = new URL(page.url()).pathname.split('/').pop() ?? '';
      const view = page.getByTestId('meeting-note-view');
      await expect(view).toHaveAttribute('data-note-id', noteId, { timeout: 30_000 });
      await expect(page.getByTestId('meeting-note-title')).toHaveText(fileBase);
      const created = await notesWorld.readNote(page, noteId);
      expect(created.status).toBe(200);
      expect(created.note?.title).toBe(fileBase);
      expect(localDay(new Date(created.note?.meetingDate ?? ''))).toBe(localDay(new Date()));
      expect(created.note?.summary).toBeNull();
      expect(created.note?.actionItems).toEqual([]);
      expect(await readStoredTranscript(page, noteId)).toBe(transcript);
      const versionsBefore = (await notesWorld.readVersions(page, noteId)).length;

      // The notice names the provider (and model) before anything is sent.
      await fakeAi.script(
        'openai',
        successOutcome({
          summary: {
            keyPoints: [`Launch stays on Friday ${tag}`],
            decisions: [`Ship the beta ${tag}`],
            nextSteps: [`Prepare the release notes ${tag}`],
          },
          actionItems: [
            { description: `Update the changelog ${tag}`, assigneeName: primaryName },
            { description: `Book the demo room ${tag}`, assigneeName: 'Zephyrine' },
            { description: `Order pizza ${tag}`, assigneeName: null },
          ],
        }),
      );
      const notice = await openAiNotice(page);
      await expect(notice.getByTestId('meeting-note-ai-notice-provider')).toContainText(E2E_AI_PROVIDER_LABEL);
      await expect(notice.getByTestId('meeting-note-ai-notice-provider')).toContainText(E2E_AI_MODEL_LABEL);
      expect(await fakeAi.received('openai'), 'nothing is sent before "Process"').toBe(0);

      const review = await processToReview(page);
      expect(await fakeAi.received('openai')).toBe(1);

      // The draft changed nothing yet (BR-006).
      const pending = await notesWorld.readNote(page, noteId);
      expect(pending.note?.summary).toBeNull();
      expect(pending.note?.actionItems).toEqual([]);
      expect(pending.note?.revision).toBe(created.note?.revision);

      // Edit the summary.
      const firstKeyPoint = review.getByRole('textbox', { name: 'Key points 1' });
      await expect(firstKeyPoint).toHaveValue(`Launch stays on Friday ${tag}`);
      await firstKeyPoint.fill(`Launch moves to Monday ${tag}`);

      const rows = suggestions(page);
      await expect(rows).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expect(rows.nth(index)).toHaveAttribute('data-state', 'accepted');
      }
      // Reassign the first suggestion to the member.
      const firstAssignee = rows.nth(0).getByRole('combobox', { name: 'Assignee' });
      await firstAssignee.click();
      await page.getByRole('option', { name: secondaryName, exact: true }).click();
      await expect(firstAssignee).toContainText(secondaryName);
      // Accept the second as suggested (unassigned: "Zephyrine" is no member) with a due date.
      await expect(rows.nth(1).getByTestId('meeting-note-ai-suggestion-hint')).toContainText('Zephyrine');
      await expect(rows.nth(1).getByRole('combobox', { name: 'Assignee' })).toContainText('Unassigned');
      await rows.nth(1).getByLabel('Due date').fill('2026-11-05');
      // Reject the third.
      await rows.nth(2).getByTestId('meeting-note-ai-suggestion-reject').click();
      await expect(rows.nth(2)).toHaveAttribute('data-state', 'rejected');

      await review.getByTestId('meeting-note-ai-apply').click();
      await expect(page.getByTestId('meeting-note-ai-review')).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByTestId('meeting-note-summary')).toContainText(`Launch moves to Monday ${tag}`);

      // Exactly the reviewed summary and the two accepted items, in one new version.
      const applied = await notesWorld.readNote(page, noteId);
      expect(applied.note?.summary).toBe(
        [
          'Key points',
          `- Launch moves to Monday ${tag}`,
          '',
          'Decisions',
          `- Ship the beta ${tag}`,
          '',
          'Next steps',
          `- Prepare the release notes ${tag}`,
        ].join('\n'),
      );
      const items = (applied.note?.actionItems ?? [])
        .map((item) => ({ description: item.description, assigneeId: item.assigneeId, dueDate: item.dueDate, completed: item.completed }))
        .sort((a, b) => a.description.localeCompare(b.description));
      expect(items).toEqual([
        { description: `Book the demo room ${tag}`, assigneeId: null, dueDate: '2026-11-05', completed: false },
        { description: `Update the changelog ${tag}`, assigneeId: messagingData.secondary.userId, dueDate: null, completed: false },
      ]);
      expect((await notesWorld.readVersions(page, noteId)).length).toBe(versionsBefore + 1);
      await expect(page.getByTestId('meeting-note-item')).toHaveCount(2);

      // Attach a new transcript: replaced immediately, the summary unchanged.
      const replacement = `${secondaryName}: Second take ${tag}. We keep Monday.`;
      await chooseTranscriptFile(
        page,
        page.getByTestId('meeting-note-attach-transcript'),
        transcriptFile('second take.txt', replacement),
      );
      await expect.poll(() => readStoredTranscript(page, noteId), { timeout: 30_000 }).toBe(replacement);
      const afterAttach = await notesWorld.readNote(page, noteId);
      expect(afterAttach.note?.summary).toBe(applied.note?.summary);
      expect(afterAttach.note?.actionItems.length).toBe(2);
      await page.getByTestId('meeting-note-transcript-toggle').click();
      await expect(page.getByTestId('meeting-note-transcript')).toHaveText(replacement, { timeout: 30_000 });
    } finally {
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
