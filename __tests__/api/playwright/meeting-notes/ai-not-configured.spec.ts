import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { aiSection } from '../helpers/meeting-notes-ai-e2e';
import {
  actionItemRow,
  fillActionItemForm,
  openNote,
  saveActionItemForm,
  saveNoteForm,
} from '../helpers/meeting-notes-ui';

/**
 * AC-018 (FR-025): with no AI provider configured for the company, a member
 * who may edit a note (with a stored transcript) sees the AI controls
 * disabled with "An admin needs to configure AI" and no settings link, while
 * manual editing (fields and action items) works; an admin additionally gets
 * a link that opens the company page's AI settings section.
 */
test.describe('meeting notes — AI not configured (AC-018)', () => {
  test('AI controls are disabled with the message; manual editing works; only the admin gets the settings link', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    await notesWorld.resetAiSettingsUnsafe();
    const tag = notesWorld.runTag;
    const space = await notesWorld.createSpace('No AI room');
    const member = secondaryPage;
    const noteId = await notesWorld.createNote(member, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} No AI ${tag}`,
      meetingDate: new Date(),
      content: '<p>Written by hand</p>',
    });
    await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript: `Ana: Hello ${tag}.` });

    // The member (author, so an editor): disabled controls, the message, no link.
    await openNote(member, noteId);
    const memberAi = aiSection(member);
    await expect(memberAi.getByTestId('meeting-note-ai-not-configured')).toBeVisible({ timeout: 30_000 });
    await expect(memberAi.getByTestId('meeting-note-ai-start')).toBeDisabled();
    await expect(memberAi).toContainText('An admin needs to configure AI.');
    await expect(memberAi.getByTestId('meeting-note-ai-settings-link')).toHaveCount(0);

    // Manual editing works: the fields and an action item.
    const newTitle = `${MEETING_NOTES_E2E_PREFIX} No AI edited ${tag}`;
    await member.getByTestId('meeting-note-edit-button').click();
    await member.getByLabel('Title', { exact: true }).fill(newTitle);
    await saveNoteForm(member);
    await expect(member.getByTestId('meeting-note-title')).toHaveText(newTitle);
    const description = `Send the minutes ${tag}`;
    await member.getByTestId('meeting-note-item-add').click();
    await fillActionItemForm(member, { description });
    await saveActionItemForm(member);
    await expect(actionItemRow(member, description)).toBeVisible();
    const stored = await notesWorld.readNote(member, noteId);
    expect(stored.note?.title).toBe(newTitle);
    expect(stored.note?.actionItems.map((item) => item.description)).toEqual([description]);

    // The admin: the same disabled controls plus the link to the AI settings.
    const admin = primaryPage;
    await openNote(admin, noteId);
    const adminAi = aiSection(admin);
    await expect(adminAi.getByTestId('meeting-note-ai-not-configured')).toBeVisible({ timeout: 30_000 });
    await expect(adminAi.getByTestId('meeting-note-ai-start')).toBeDisabled();
    await expect(adminAi).toContainText('An admin needs to configure AI.');
    const link = adminAi.getByTestId('meeting-note-ai-settings-link');
    await expect(link).toHaveAttribute('href', '/company?tab=settings#ai-settings');
    await link.click();
    await expect(admin).toHaveURL(/\/company\?tab=settings#ai-settings$/, { timeout: 30_000 });
    await expect(admin.locator('#ai-settings')).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByTestId('ai-settings-status')).toHaveText('AI is not configured yet.');
  });
});
