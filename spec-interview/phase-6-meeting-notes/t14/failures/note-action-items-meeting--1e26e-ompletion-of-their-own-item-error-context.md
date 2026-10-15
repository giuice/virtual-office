# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: note-action-items.spec.ts >> meeting notes — action items in the UI (AC-008) >> editor adds, edits, and deletes items; the assignee only toggles completion of their own item
- Location: __tests__\api\playwright\meeting-notes\note-action-items.spec.ts:15:3

# Error details

```
Error: locator.check: Clicking the checkbox did not change its state
Call log:
  - waiting for getByTestId('meeting-note-item').filter({ has: getByTestId('meeting-note-item-description').filter({ hasText: 'Send the final minutes 425396e5' }) }).getByTestId('meeting-note-item-toggle')
    - locator resolved to <input type="checkbox" data-testid="meeting-note-item-toggle" aria-label="Done: Send the final minutes 425396e5" class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"/>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - performing click action
    - click action done
    - waiting for scheduled navigations to finish
    - navigations have finished

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "Virtual Office" [ref=e8] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e9]
          - generic [ref=e12]: Virtual Office
        - generic [ref=e15]:
          - textbox "Search users..." [ref=e16]
          - img [ref=e17]
        - generic [ref=e20]:
          - 'button "Current theme: Paper White. Click to change theme." [ref=e21]':
            - generic [ref=e24]: Paper White
            - generic [ref=e25]: Open theme menu
          - button [ref=e26]:
            - img
          - button "LS" [ref=e28] [cursor=pointer]:
            - generic [ref=e31]: LS
      - heading "Meeting note" [level=1] [ref=e34]
    - generic [ref=e36]:
      - link "Meetings" [ref=e37] [cursor=pointer]:
        - /url: /meetings
        - img
        - text: Meetings
      - alert [ref=e38]:
        - paragraph [ref=e39]: Meeting note not found
        - paragraph [ref=e40]: It may have been deleted, or it belongs to another company.
  - button "Open messages" [ref=e42]:
    - img
    - generic [ref=e43]: "1"
  - region "Notifications alt+T":
    - list:
      - listitem [ref=e44]:
        - button "Close toast" [ref=e45] [cursor=pointer]:
          - img [ref=e46]
        - generic [ref=e50]: Reconnected to Test Space Fixed 1
  - button "Open Next.js Dev Tools" [ref=e56] [cursor=pointer]:
    - img [ref=e57]
  - alert [ref=e60]
```

# Test source

```ts
  1   | import { expect, test } from '../fixtures/meeting-notes';
  2   | import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
  3   | import { actionItemRow, fillActionItemForm, openNote, saveActionItemForm } from '../helpers/meeting-notes-ui';
  4   | 
  5   | /**
  6   |  * AC-008, UI part (FR-011, BR-005): the note's editor (primary, the author)
  7   |  * adds, edits, and deletes action items with description, assignee, and due
  8   |  * date, each change shown at once. The assignee (secondary, a member who is
  9   |  * not an editor) can toggle completion of their own item but sees no edit or
  10  |  * delete control, and sees another person's item read-only (status only).
  11  |  * The route and database denials of the same attempts are covered by the DB
  12  |  * integration suite (T3).
  13  |  */
  14  | test.describe('meeting notes — action items in the UI (AC-008)', () => {
  15  |   test('editor adds, edits, and deletes items; the assignee only toggles completion of their own item', async ({
  16  |     primaryPage,
  17  |     secondaryPage,
  18  |     messagingData,
  19  |     notesWorld,
  20  |   }) => {
  21  |     const space = await notesWorld.createSpace('Items room');
  22  |     const tag = notesWorld.runTag;
  23  |     const noteId = await notesWorld.createNote(primaryPage, {
  24  |       spaceId: space.id,
  25  |       title: `${MEETING_NOTES_E2E_PREFIX} Items ${tag}`,
  26  |       meetingDate: new Date(),
  27  |       content: '<p>Items agenda</p>',
  28  |     });
  29  |     const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
  30  |     const other = await notesWorld.createCompanyMember('Other assignee');
  31  | 
  32  |     // --- Editor (primary) ---
  33  |     const editor = primaryPage;
  34  |     await openNote(editor, noteId);
  35  |     await expect(editor.getByTestId('meeting-note-action-items')).toContainText('No action items.');
  36  | 
  37  |     // Add: description, assignee (the secondary member), due date.
  38  |     await editor.getByTestId('meeting-note-item-add').click();
  39  |     await fillActionItemForm(editor, {
  40  |       description: `Send the minutes ${tag}`,
  41  |       assignee: secondaryName,
  42  |       dueDate: '2026-11-05',
  43  |     });
  44  |     await saveActionItemForm(editor);
  45  |     const mine = actionItemRow(editor, `Send the minutes ${tag}`);
  46  |     await expect(mine).toHaveCount(1);
  47  |     await expect(mine.getByTestId('meeting-note-item-assignee')).toContainText(secondaryName);
  48  |     await expect(mine.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-05');
  49  |     await expect(mine.getByTestId('meeting-note-item-status')).toHaveText('Open');
  50  | 
  51  |     // Edit: description and due date; the assignee is kept.
  52  |     await mine.getByTestId('meeting-note-item-edit').click();
  53  |     await fillActionItemForm(editor, { description: `Send the final minutes ${tag}`, dueDate: '2026-11-06' });
  54  |     await saveActionItemForm(editor);
  55  |     const edited = actionItemRow(editor, `Send the final minutes ${tag}`);
  56  |     await expect(edited).toHaveCount(1);
  57  |     await expect(edited.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-06');
  58  |     await expect(edited.getByTestId('meeting-note-item-assignee')).toContainText(secondaryName);
  59  |     await expect(actionItemRow(editor, `Send the minutes ${tag}`)).toHaveCount(0);
  60  | 
  61  |     // A second item for someone else, and a third one that is deleted.
  62  |     await editor.getByTestId('meeting-note-item-add').click();
  63  |     await fillActionItemForm(editor, { description: `Book the room ${tag}`, assignee: other.displayName });
  64  |     await saveActionItemForm(editor);
  65  |     await expect(actionItemRow(editor, `Book the room ${tag}`).getByTestId('meeting-note-item-due')).toHaveText('No due date');
  66  | 
  67  |     await editor.getByTestId('meeting-note-item-add').click();
  68  |     await fillActionItemForm(editor, { description: `Temporary item ${tag}` });
  69  |     await saveActionItemForm(editor);
  70  |     const temporary = actionItemRow(editor, `Temporary item ${tag}`);
  71  |     await expect(temporary).toHaveCount(1);
  72  |     await temporary.getByTestId('meeting-note-item-delete').click();
  73  |     const confirm = editor.getByRole('alertdialog');
  74  |     await expect(confirm).toContainText(`Temporary item ${tag}`);
  75  |     await confirm.getByTestId('meeting-note-item-delete-confirm').click();
  76  |     await expect(temporary).toHaveCount(0);
  77  | 
  78  |     // The stored state matches what was shown.
  79  |     const stored = await notesWorld.readNote(editor, noteId);
  80  |     expect(stored.note?.actionItems.map((item) => [item.description, item.assigneeId, item.dueDate, item.completed])).toEqual([
  81  |       [`Send the final minutes ${tag}`, messagingData.secondary.userId, '2026-11-06', false],
  82  |       [`Book the room ${tag}`, other.id, null, false],
  83  |     ]);
  84  | 
  85  |     // --- Assignee (secondary, not an editor) ---
  86  |     const assignee = secondaryPage;
  87  |     await openNote(assignee, noteId);
  88  |     await expect(assignee.getByTestId('meeting-note-edit-button')).toHaveCount(0);
  89  |     await expect(assignee.getByTestId('meeting-note-item-add')).toHaveCount(0);
  90  |     await expect(assignee.getByTestId('meeting-note-item-edit')).toHaveCount(0);
  91  |     await expect(assignee.getByTestId('meeting-note-item-delete')).toHaveCount(0);
  92  | 
  93  |     // Their own item: the completion toggle works.
  94  |     const own = actionItemRow(assignee, `Send the final minutes ${tag}`);
  95  |     const toggle = own.getByTestId('meeting-note-item-toggle');
  96  |     await expect(toggle).toBeEnabled();
  97  |     await expect(toggle).not.toBeChecked();
> 98  |     await toggle.check();
      |                  ^ Error: locator.check: Clicking the checkbox did not change its state
  99  |     await expect(own.getByTestId('meeting-note-item-status')).toHaveText('Done');
  100 |     await expect(own).toHaveAttribute('data-completed', 'true');
  101 | 
  102 |     // Someone else's item: status only.
  103 |     const theirs = actionItemRow(assignee, `Book the room ${tag}`);
  104 |     await expect(theirs.getByTestId('meeting-note-item-status')).toHaveText('Open');
  105 |     await expect(theirs.getByTestId('meeting-note-item-toggle')).toHaveCount(0);
  106 | 
  107 |     const afterToggle = await notesWorld.readNote(editor, noteId);
  108 |     expect(afterToggle.note?.actionItems.find((item) => item.description === `Send the final minutes ${tag}`)?.completed).toBe(true);
  109 | 
  110 |     // The editor sees the completion after reloading.
  111 |     await openNote(editor, noteId);
  112 |     await expect(actionItemRow(editor, `Send the final minutes ${tag}`).getByTestId('meeting-note-item-status')).toHaveText('Done');
  113 |   });
  114 | });
  115 | 
```