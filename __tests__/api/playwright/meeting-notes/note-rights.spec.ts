import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-004, UI part (FR-006, BR-003): a member who is neither the author, a
 * participant, nor an admin reads the note and its history but sees no edit,
 * restore, or delete control. The author (here the admin) sees all three.
 * Route and database denials are covered by the DB integration suite.
 */
test.describe('meeting notes — editing rights in the UI (AC-004)', () => {
  test('a non-participant member sees no edit, restore, or delete control', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Rights room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Rights ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: '<p>First draft</p>',
    });
    // A second version, so an older version exists to restore.
    await notesWorld.updateNote(primaryPage, noteId, {
      expectedRevision: 1,
      title,
      meetingDate: new Date(),
      content: '<p>Second draft</p>',
      participantIds: [],
    });

    // The non-participant member (secondary) reads everything...
    const viewer = secondaryPage;
    await openNote(viewer, noteId);
    await expect(viewer.getByTestId('meeting-note-title')).toHaveText(title);
    await expect(viewer.getByTestId('meeting-note-content')).toContainText('Second draft');
    // ...but has no edit or delete control.
    await expect(viewer.getByTestId('meeting-note-edit-button')).toHaveCount(0);
    await expect(viewer.getByTestId('meeting-note-delete-button')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // History opens for any viewer, an old version opens, but no restore control.
    await viewer.getByTestId('meeting-note-history-button').click();
    const versions = viewer.getByTestId('meeting-note-version-item');
    await expect(versions).toHaveCount(2);
    await viewer.locator('[data-testid="meeting-note-version-item"][data-revision="1"]').click();
    await expect(viewer.getByTestId('meeting-note-version-content')).toContainText('First draft');
    await expect(viewer.getByTestId('meeting-note-restore-button')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Restore this version' })).toHaveCount(0);

    // The author/admin (primary) sees the controls on the same note.
    const author = primaryPage;
    await openNote(author, noteId);
    await expect(author.getByTestId('meeting-note-edit-button')).toBeVisible();
    await expect(author.getByTestId('meeting-note-delete-button')).toBeVisible();
    await author.getByTestId('meeting-note-history-button').click();
    await author.locator('[data-testid="meeting-note-version-item"][data-revision="1"]').click();
    await expect(author.getByTestId('meeting-note-restore-button')).toBeVisible();
  });
});
