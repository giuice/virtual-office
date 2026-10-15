import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { actionItemRow, fillActionItemForm, openNote, saveActionItemForm } from '../helpers/meeting-notes-ui';

/**
 * AC-008, UI part (FR-011, BR-005): the note's editor (primary, the author)
 * adds, edits, and deletes action items with description, assignee, and due
 * date, each change shown at once. The assignee (secondary, a member who is
 * not an editor) can toggle completion of their own item but sees no edit or
 * delete control, and sees another person's item read-only (status only).
 * The route and database denials of the same attempts are covered by the DB
 * integration suite (T3).
 */
test.describe('meeting notes — action items in the UI (AC-008)', () => {
  test('editor adds, edits, and deletes items; the assignee only toggles completion of their own item', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Items room');
    const tag = notesWorld.runTag;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} Items ${tag}`,
      meetingDate: new Date(),
      content: '<p>Items agenda</p>',
    });
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
    const other = await notesWorld.createCompanyMember('Other assignee');

    // --- Editor (primary) ---
    const editor = primaryPage;
    await openNote(editor, noteId);
    await expect(editor.getByTestId('meeting-note-action-items')).toContainText('No action items.');

    // Add: description, assignee (the secondary member), due date.
    await editor.getByTestId('meeting-note-item-add').click();
    await fillActionItemForm(editor, {
      description: `Send the minutes ${tag}`,
      assignee: secondaryName,
      dueDate: '2026-11-05',
    });
    await saveActionItemForm(editor);
    const mine = actionItemRow(editor, `Send the minutes ${tag}`);
    await expect(mine).toHaveCount(1);
    await expect(mine.getByTestId('meeting-note-item-assignee')).toContainText(secondaryName);
    await expect(mine.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-05');
    await expect(mine.getByTestId('meeting-note-item-status')).toHaveText('Open');

    // Edit: description and due date; the assignee is kept.
    await mine.getByTestId('meeting-note-item-edit').click();
    await fillActionItemForm(editor, { description: `Send the final minutes ${tag}`, dueDate: '2026-11-06' });
    await saveActionItemForm(editor);
    const edited = actionItemRow(editor, `Send the final minutes ${tag}`);
    await expect(edited).toHaveCount(1);
    await expect(edited.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-06');
    await expect(edited.getByTestId('meeting-note-item-assignee')).toContainText(secondaryName);
    await expect(actionItemRow(editor, `Send the minutes ${tag}`)).toHaveCount(0);

    // A second item for someone else, and a third one that is deleted.
    await editor.getByTestId('meeting-note-item-add').click();
    await fillActionItemForm(editor, { description: `Book the room ${tag}`, assignee: other.displayName });
    await saveActionItemForm(editor);
    await expect(actionItemRow(editor, `Book the room ${tag}`).getByTestId('meeting-note-item-due')).toHaveText('No due date');

    await editor.getByTestId('meeting-note-item-add').click();
    await fillActionItemForm(editor, { description: `Temporary item ${tag}` });
    await saveActionItemForm(editor);
    const temporary = actionItemRow(editor, `Temporary item ${tag}`);
    await expect(temporary).toHaveCount(1);
    await temporary.getByTestId('meeting-note-item-delete').click();
    const confirm = editor.getByRole('alertdialog');
    await expect(confirm).toContainText(`Temporary item ${tag}`);
    await confirm.getByTestId('meeting-note-item-delete-confirm').click();
    await expect(temporary).toHaveCount(0);

    // The stored state matches what was shown.
    const stored = await notesWorld.readNote(editor, noteId);
    expect(stored.note?.actionItems.map((item) => [item.description, item.assigneeId, item.dueDate, item.completed])).toEqual([
      [`Send the final minutes ${tag}`, messagingData.secondary.userId, '2026-11-06', false],
      [`Book the room ${tag}`, other.id, null, false],
    ]);

    // --- Assignee (secondary, not an editor) ---
    const assignee = secondaryPage;
    await openNote(assignee, noteId);
    await expect(assignee.getByTestId('meeting-note-edit-button')).toHaveCount(0);
    await expect(assignee.getByTestId('meeting-note-item-add')).toHaveCount(0);
    await expect(assignee.getByTestId('meeting-note-item-edit')).toHaveCount(0);
    await expect(assignee.getByTestId('meeting-note-item-delete')).toHaveCount(0);

    // Their own item: the completion toggle works.
    const own = actionItemRow(assignee, `Send the final minutes ${tag}`);
    const toggle = own.getByTestId('meeting-note-item-toggle');
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    // The checkbox reflects the stored state, so it turns checked only once the
    // server confirmed the change (locator.check() expects a synchronous flip).
    await toggle.click();
    await expect(toggle).toBeChecked({ timeout: 15_000 });
    await expect(own.getByTestId('meeting-note-item-status')).toHaveText('Done');
    await expect(own).toHaveAttribute('data-completed', 'true');

    // Someone else's item: status only.
    const theirs = actionItemRow(assignee, `Book the room ${tag}`);
    await expect(theirs.getByTestId('meeting-note-item-status')).toHaveText('Open');
    await expect(theirs.getByTestId('meeting-note-item-toggle')).toHaveCount(0);

    const afterToggle = await notesWorld.readNote(editor, noteId);
    expect(afterToggle.note?.actionItems.find((item) => item.description === `Send the final minutes ${tag}`)?.completed).toBe(true);

    // The editor sees the completion after reloading.
    await openNote(editor, noteId);
    await expect(actionItemRow(editor, `Send the final minutes ${tag}`).getByTestId('meeting-note-item-status')).toHaveText('Done');
  });
});
