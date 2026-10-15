import { expect, test } from '../fixtures/meeting-notes';
import { daysAgo, MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-006, UI part (FR-008, FR-009, BR-007): a note saved three times shows
 * three versions with who and when; a viewer who is not an editor opens a
 * version but cannot restore it; an editor restores version 1, which creates
 * a fourth version equal to version 1 (title, date, participants, content).
 */
test.describe('meeting notes — history and restore (AC-006)', () => {
  test('lists three versions and restores version 1 as a new version', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('History room');
    const primaryName = await notesWorld.displayNameOf(messagingData.primary.userId);
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
    const v1Title = `${MEETING_NOTES_E2E_PREFIX} History v1 ${notesWorld.runTag}`;
    const v1Date = daysAgo(3);
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: v1Title,
      meetingDate: v1Date,
      content: '<p>Version one text</p>',
      participantIds: [messagingData.secondary.userId],
    });
    // Saves 2 and 3 drop the secondary from the participants (no longer an editor).
    await notesWorld.updateNote(primaryPage, noteId, {
      expectedRevision: 1,
      title: `${MEETING_NOTES_E2E_PREFIX} History v2 ${notesWorld.runTag}`,
      meetingDate: daysAgo(2),
      content: '<p>Version two text</p>',
      participantIds: [],
    });
    await notesWorld.updateNote(primaryPage, noteId, {
      expectedRevision: 2,
      title: `${MEETING_NOTES_E2E_PREFIX} History v3 ${notesWorld.runTag}`,
      meetingDate: daysAgo(1),
      content: '<p>Version three text</p>',
      participantIds: [],
    });

    // A viewer who is not an editor: three versions with who/when, no restore.
    const viewer = secondaryPage;
    await openNote(viewer, noteId);
    await viewer.getByTestId('meeting-note-history-button').click();
    const viewerVersions = viewer.getByTestId('meeting-note-version-item');
    await expect(viewerVersions).toHaveCount(3);
    for (const [index, revision] of [3, 2, 1].entries()) {
      const item = viewerVersions.nth(index);
      await expect(item).toHaveAttribute('data-revision', String(revision));
      await expect(item.getByTestId('meeting-note-version-meta')).toContainText(primaryName);
      await expect(item.getByTestId('meeting-note-version-meta').locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
    }
    await viewer.locator('[data-testid="meeting-note-version-item"][data-revision="1"]').click();
    await expect(viewer.getByTestId('meeting-note-version-title')).toHaveText(v1Title);
    await expect(viewer.getByTestId('meeting-note-version-content')).toContainText('Version one text');
    await expect(viewer.getByTestId('meeting-note-restore-button')).toHaveCount(0);

    // The editor (author/admin) restores version 1.
    const editor = primaryPage;
    await openNote(editor, noteId);
    await editor.getByTestId('meeting-note-history-button').click();
    await expect(editor.getByTestId('meeting-note-version-item')).toHaveCount(3);
    await editor.locator('[data-testid="meeting-note-version-item"][data-revision="1"]').click();
    await editor.getByTestId('meeting-note-restore-button').click();
    const confirm = editor.getByRole('alertdialog');
    await expect(confirm).toContainText('Restore revision 1?');
    await confirm.getByTestId('meeting-note-restore-confirm').click();
    await expect(confirm).toBeHidden({ timeout: 30_000 });

    // A fourth version now heads the list; the note shows version 1's fields.
    const editorVersions = editor.getByTestId('meeting-note-version-item');
    await expect(editorVersions).toHaveCount(4, { timeout: 15_000 });
    await expect(editorVersions.nth(0)).toHaveAttribute('data-revision', '4');
    await editor.keyboard.press('Escape');
    const view = editor.getByTestId('meeting-note-view');
    await expect(view).toHaveAttribute('data-revision', '4');
    await expect(editor.getByTestId('meeting-note-title')).toHaveText(v1Title);
    await expect(editor.getByTestId('meeting-note-content')).toContainText('Version one text');
    await expect(editor.getByTestId('meeting-note-participant').filter({ hasText: secondaryName })).toBeVisible();

    // Version 4 equals version 1 on the server.
    const versions = await notesWorld.readVersions(editor, noteId);
    const byRevision = new Map(versions.map((version) => [version.revision, version]));
    const v1 = await notesWorld.readVersion(editor, noteId, byRevision.get(1)?.id ?? '');
    const v4 = await notesWorld.readVersion(editor, noteId, byRevision.get(4)?.id ?? '');
    expect(v4.title).toBe(v1.title);
    expect(new Date(v4.meetingDate).getTime()).toBe(new Date(v1.meetingDate).getTime());
    expect(v4.content).toBe(v1.content);
    expect(v4.summary ?? null).toBe(v1.summary ?? null);
    expect(v4.participants?.map((participant) => participant.userId)).toEqual(
      v1.participants?.map((participant) => participant.userId),
    );
  });
});
