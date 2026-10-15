import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-007, UI part (FR-010, BR-003): a participant who is neither author nor
 * admin may edit but sees no delete control; the author deletes only after
 * confirming (cancel keeps the note), then the Meetings page opens and the
 * note is gone for everyone. Removal of versions, items, participants, and
 * transcript is covered at the database level.
 */
test.describe('meeting notes — delete (AC-007)', () => {
  test('the author deletes after confirmation; a participant has no delete control', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Delete room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Delete ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: '<p>To be deleted</p>',
      participantIds: [messagingData.secondary.userId],
    });
    await notesWorld.addActionItem(primaryPage, noteId, `Delete item ${notesWorld.runTag}`);
    // Another note of the same space stays, so the list below is known to be loaded.
    const keptId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} Kept ${notesWorld.runTag}`,
      meetingDate: new Date(),
      content: '<p>Stays</p>',
    });

    // The participant (member, not author) can edit but not delete.
    const participant = secondaryPage;
    await openNote(participant, noteId);
    await expect(participant.getByTestId('meeting-note-edit-button')).toBeVisible();
    await expect(participant.getByTestId('meeting-note-delete-button')).toHaveCount(0);

    // The author: cancelling keeps the note.
    const author = primaryPage;
    await openNote(author, noteId);
    await author.getByTestId('meeting-note-delete-button').click();
    let confirm = author.getByRole('alertdialog');
    await expect(confirm).toContainText('Delete this meeting note?');
    await expect(confirm).toContainText(title);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    expect((await notesWorld.readNote(author, noteId)).status).toBe(200);

    // Confirming deletes it and opens the Meetings page.
    await author.getByTestId('meeting-note-delete-button').click();
    confirm = author.getByRole('alertdialog');
    await confirm.getByTestId('meeting-note-delete-confirm').click();
    await expect(author).toHaveURL(/\/meetings$/, { timeout: 30_000 });
    await author.getByLabel('Space', { exact: true }).selectOption({ label: space.name });
    await expect(author.locator(`[data-testid="meeting-note-result"][data-note-id="${keptId}"]`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(author.locator(`[data-testid="meeting-note-result"][data-note-id="${noteId}"]`)).toHaveCount(0);

    // Gone for everyone: the API and the view answer "not found".
    expect((await notesWorld.readNote(author, noteId)).status).toBe(404);
    await participant.goto(`/meetings/${noteId}`);
    await expect(participant.getByTestId('meeting-note-unavailable')).toContainText('Meeting note not found', {
      timeout: 30_000,
    });
  });
});
