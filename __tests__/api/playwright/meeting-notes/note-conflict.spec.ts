import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { noteEditor, openNote, replaceEditorText } from '../helpers/meeting-notes-ui';

/**
 * AC-005, UI part (FR-007, BR-011): two editors open the same revision; the
 * first save wins; the second gets the conflict warning showing the newer
 * state, with its own unsaved text still available, and nothing is
 * overwritten. Loading the newer version shows it in the form and keeps the
 * user's earlier text visible. (Restore-vs-save and attach-vs-apply races are
 * covered at the database level.)
 */
test.describe('meeting notes — concurrent edits (AC-005)', () => {
  test('the second save of the same revision shows the conflict and keeps the first change', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Conflict room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Conflict ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: '<p>Original text</p>',
      participantIds: [messagingData.secondary.userId],
    });

    const first = primaryPage;
    const second = secondaryPage;
    // Both open the editor on revision 1.
    for (const page of [first, second]) {
      const view = await openNote(page, noteId);
      await expect(view).toHaveAttribute('data-revision', '1');
      await page.getByTestId('meeting-note-edit-button').click();
      await noteEditor(page);
    }

    const firstText = `Admin decision ${notesWorld.runTag}`;
    const secondText = `Member decision ${notesWorld.runTag}`;

    await replaceEditorText(first, firstText);
    await first.getByTestId('meeting-note-submit').click();
    const firstView = first.getByTestId('meeting-note-view');
    await expect(firstView).toBeVisible({ timeout: 30_000 });
    await expect(firstView).toHaveAttribute('data-revision', '2');
    await expect(first.getByTestId('meeting-note-content')).toContainText(firstText);

    await replaceEditorText(second, secondText);
    await second.getByTestId('meeting-note-submit').click();

    const dialog = second.getByTestId('meeting-note-conflict-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('heading', { name: 'This note was changed by someone else' })).toBeVisible();
    await expect(dialog.getByTestId('meeting-note-conflict-newer')).toContainText('Revision 2');
    await expect(dialog.getByTestId('meeting-note-conflict-newer-title')).toHaveText(title);
    await expect(dialog.getByTestId('meeting-note-conflict-newer-content')).toContainText(firstText);
    // The user's own text is not lost.
    await expect(dialog.getByTestId('meeting-note-conflict-mine')).toHaveValue(new RegExp(secondText));

    // Nothing was overwritten: the first change is intact on the server.
    const current = await notesWorld.readNote(first, noteId);
    expect(current.note?.revision).toBe(2);
    expect(current.note?.content).toContain(firstText);
    expect(current.note?.content).not.toContain(secondText);

    // Loading the newer version puts it in the form; the earlier text stays visible.
    await dialog.getByRole('button', { name: 'Load newer version' }).click();
    await expect(dialog).toBeHidden();
    await expect(await noteEditor(second)).toContainText(firstText);
    await expect(second.getByTestId('meeting-note-unsaved-backup')).toContainText('Your earlier unsaved text');
    await expect(second.getByTestId('meeting-note-unsaved-backup').getByRole('textbox')).toHaveValue(
      new RegExp(secondText),
    );
  });
});
