import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * Block B review B-4 (FR-007, FR-010): the delete confirmation deletes the
 * revision the user saw when it opened. Another editor changes the note while
 * the dialog is open and the page refreshes the note in the background
 * (reconnect refetch); confirming then gets the conflict with the newer state
 * and deletes nothing; only an explicit second confirmation of the newer
 * version deletes it.
 *
 * Real app, routes, and local database; the background refresh is triggered
 * by taking the browser offline and back online (network shaping only).
 */
test.describe('meeting notes — delete confirmation keeps its revision (B-4)', () => {
  test('a background refetch during the confirmation does not change what is deleted', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Stale delete room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Stale delete ${notesWorld.runTag}`;
    const meetingDate = new Date();
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate,
      content: '<p>Before the concurrent edit</p>',
      participantIds: [messagingData.secondary.userId],
    });

    const author = primaryPage;
    const view = await openNote(author, noteId);
    await expect(view).toHaveAttribute('data-revision', '1');
    await author.getByTestId('meeting-note-delete-button').click();
    const dialog = author.getByTestId('meeting-note-delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-revision', '1');
    await expect(dialog).toContainText(title);

    // Another editor (the participant) saves meanwhile.
    const newerTitle = `${title} (changed)`;
    await notesWorld.updateNote(secondaryPage, noteId, {
      expectedRevision: 1,
      title: newerTitle,
      meetingDate,
      content: '<p>Concurrent work that must survive</p>',
      participantIds: [messagingData.secondary.userId],
    });

    // A background refresh brings revision 2 into the page (the cached note is
    // stale after 15 s; reconnecting refetches it) while the dialog stays open.
    await author.waitForTimeout(16_000);
    await author.context().setOffline(true);
    await author.context().setOffline(false);
    await expect(view).toHaveAttribute('data-revision', '2', { timeout: 30_000 });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-revision', '1');

    // Confirming deletes nothing: the conflict shows the newer state.
    await dialog.getByTestId('meeting-note-delete-confirm').click();
    const conflict = dialog.getByTestId('meeting-note-delete-conflict');
    await expect(conflict).toBeVisible({ timeout: 30_000 });
    await expect(conflict).toContainText('nothing was deleted');
    await expect(conflict).toContainText('revision 2');
    await expect(conflict).toContainText(newerTitle);
    const kept = await notesWorld.readNote(author, noteId);
    expect(kept.status).toBe(200);
    expect(kept.note?.revision).toBe(2);
    expect(kept.note?.content).toContain('Concurrent work that must survive');

    // Only an explicit confirmation of the newer version deletes it.
    await expect(dialog).toHaveAttribute('data-revision', '2');
    await expect(dialog.getByTestId('meeting-note-delete-confirm')).toHaveText('Delete newer version');
    await dialog.getByTestId('meeting-note-delete-confirm').click();
    await expect(author).toHaveURL(/\/meetings$/, { timeout: 30_000 });
    expect((await notesWorld.readNote(author, noteId)).status).toBe(404);
  });
});
