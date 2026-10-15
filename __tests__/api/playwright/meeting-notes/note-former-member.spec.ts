import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { noteEditor, openNote, saveNoteForm } from '../helpers/meeting-notes-ui';

/**
 * AC-021, display part (FR-030): a participant who left the company is shown
 * as "Former member" with the name snapshot, in the view and in the edit
 * form, and in the version history; saving the note while they are still
 * listed succeeds and keeps them; they cannot be newly picked. Access and
 * rejoin rules are covered at the database level.
 */
test.describe('meeting notes — former member participants (AC-021)', () => {
  test('shows a removed participant as "Former member" and keeps them on save', async ({
    primaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Former member room');
    const leaver = await notesWorld.createCompanyMember('Leaver');
    const title = `${MEETING_NOTES_E2E_PREFIX} Former ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: '<p>Before the change</p>',
      participantIds: [leaver.id, messagingData.secondary.userId],
    });
    await notesWorld.removeFromCompany(leaver.id);

    const page = primaryPage;
    await openNote(page, noteId);
    const leaverRow = page.getByTestId('meeting-note-participant').filter({ hasText: leaver.displayName });
    await expect(leaverRow).toBeVisible();
    await expect(leaverRow).toHaveAttribute('data-former-member', 'true');
    await expect(leaverRow.getByTestId('meeting-note-former-member')).toHaveText('Former member');
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
    const currentRow = page.getByTestId('meeting-note-participant').filter({ hasText: secondaryName });
    await expect(currentRow.getByTestId('meeting-note-former-member')).toHaveCount(0);

    // The edit form lists them as "Former member" too, removable but not pickable.
    await page.getByTestId('meeting-note-edit-button').click();
    await noteEditor(page);
    const chip = page.getByTestId('meeting-note-participant-chip').filter({ hasText: leaver.displayName });
    await expect(chip).toContainText('Former member');
    await expect(chip.getByRole('button', { name: `Remove ${leaver.displayName}` })).toBeEnabled();
    await page.getByRole('button', { name: 'Add participants' }).click();
    await page.getByRole('textbox', { name: 'Search members' }).fill(leaver.displayName);
    await expect(page.getByRole('button', { name: `Add ${leaver.displayName}` })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Saving with the former member still listed succeeds and keeps them.
    const newTitle = `${title} (edited)`;
    await page.getByLabel('Title').fill(newTitle);
    await saveNoteForm(page);
    await expect(page.getByTestId('meeting-note-title')).toHaveText(newTitle);
    await expect(page.getByTestId('meeting-note-view')).toHaveAttribute('data-revision', '2');
    await expect(
      page.getByTestId('meeting-note-participant').filter({ hasText: leaver.displayName }),
    ).toHaveAttribute('data-former-member', 'true');

    const saved = await notesWorld.readNote(page, noteId);
    expect(saved.note?.participants.find((participant) => participant.userId === leaver.id)).toMatchObject({
      displayName: leaver.displayName,
      isCurrentMember: false,
    });

    // History (block B review B-5): a version recorded while they were a
    // member shows them as "Former member" too, with the name snapshot.
    await page.getByTestId('meeting-note-history-button').click();
    await page.locator('[data-testid="meeting-note-version-item"][data-revision="1"]').click();
    const versionView = page.getByTestId('meeting-note-version-view');
    await expect(versionView.getByTestId('meeting-note-version-title')).toHaveText(title);
    const historicLeaver = versionView
      .getByTestId('meeting-note-version-participant')
      .filter({ hasText: leaver.displayName });
    await expect(historicLeaver).toHaveAttribute('data-former-member', 'true');
    await expect(historicLeaver).toContainText(`${leaver.displayName} (Former member)`);
    const historicCurrent = versionView
      .getByTestId('meeting-note-version-participant')
      .filter({ hasText: secondaryName });
    await expect(historicCurrent).not.toHaveAttribute('data-former-member', 'true');
    await expect(historicCurrent).not.toContainText('Former member');
  });
});
