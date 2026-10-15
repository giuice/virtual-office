import { expect, test } from '../fixtures/meeting-notes';
import { daysAgo, localDay, MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { addParticipant, noteEditor, saveNoteForm, toolbarButton } from '../helpers/meeting-notes-ui';

/**
 * AC-001 (FR-001, FR-002, FR-003, FR-005): a member creates a note in a
 * private space through the UI — title, today's date, two participants, and
 * content with a heading, bold text, a list, a checklist, and a link — and the
 * note opens showing every field with the formatting rendered; a second note
 * dated last month is listed after it in the space's Notes tab.
 */
test.describe('meeting notes — create a note (AC-001)', () => {
  test('creates a formatted note with participants and lists it by meeting date', async ({
    primaryPage,
    messagingData,
    notesWorld,
  }) => {
    const page = primaryPage;
    const space = await notesWorld.createSpace('Create room', { isPublic: false });
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
    const otherMember = await notesWorld.createCompanyMember('Create participant');
    const title = `${MEETING_NOTES_E2E_PREFIX} Planning ${notesWorld.runTag}`;

    await page.goto(`/meetings/new?spaceId=${space.id}`);
    await expect(page.getByTestId('meeting-note-form-space')).toHaveText(space.name, { timeout: 30_000 });

    await page.getByLabel('Title').fill(title);
    // The date defaults to today (local day).
    await expect(page.getByLabel('Meeting date')).toHaveValue(localDay(new Date()));

    await addParticipant(page, secondaryName);
    await addParticipant(page, otherMember.displayName);

    const editor = await noteEditor(page);
    await editor.click();
    await toolbarButton(page, 'Heading 2').click();
    await expect(toolbarButton(page, 'Heading 2')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('Decisions');
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Bold').click();
    await page.keyboard.type('Ship on Friday');
    await toolbarButton(page, 'Bold').click();
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Bulleted list').click();
    await page.keyboard.type('Budget approved');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Checklist').click();
    await page.keyboard.type('Send the minutes');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Spec');
    await page.keyboard.press('Shift+Home');
    await toolbarButton(page, 'Link').click();
    await page.getByLabel('Link address').fill('example.com/spec');
    await page.getByRole('button', { name: 'Apply' }).click();

    await saveNoteForm(page);
    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    const noteId = page.url().split('/').pop() ?? '';

    // Every field is shown, with the formatting rendered.
    await expect(page.getByTestId('meeting-note-title')).toHaveText(title);
    await expect(page.getByTestId('meeting-note-space')).toHaveText(space.name);
    const participants = page.getByTestId('meeting-note-participant');
    await expect(participants).toHaveCount(2);
    await expect(participants.filter({ hasText: secondaryName })).toBeVisible();
    await expect(participants.filter({ hasText: otherMember.displayName })).toBeVisible();
    const content = page.getByTestId('meeting-note-content');
    await expect(content.locator('h2')).toHaveText('Decisions');
    await expect(content.locator('strong')).toHaveText('Ship on Friday');
    await expect(content.locator('ul:not([data-type]) > li')).toHaveText('Budget approved');
    await expect(content.locator('ul[data-type="taskList"] li[data-type="taskItem"]')).toContainText('Send the minutes');
    await expect(content.locator('ul[data-type="taskList"] input[type="checkbox"]')).toBeDisabled();
    const link = content.getByRole('link', { name: 'Spec' });
    await expect(link).toHaveAttribute('href', 'https://example.com/spec');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // A second note, dated last month, through the same form.
    const olderTitle = `${MEETING_NOTES_E2E_PREFIX} Retro ${notesWorld.runTag}`;
    await page.goto(`/meetings/new?spaceId=${space.id}`);
    await page.getByLabel('Title').fill(olderTitle);
    await page.getByLabel('Meeting date').fill(localDay(daysAgo(31)));
    await saveNoteForm(page);
    await expect(page.getByTestId('meeting-note-title')).toHaveText(olderTitle);

    // The space's Notes tab: the first note first, the older one after it.
    await page.goto('/floor-plan');
    const card = page.getByTestId(`space-${space.id}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    const panel = page.getByRole('region', { name: `Details for ${space.name}` });
    await panel.getByRole('tab', { name: 'Notes' }).click();
    const items = panel.getByTestId('space-note-item');
    await expect(items).toHaveCount(2, { timeout: 15_000 });
    await expect(items.nth(0)).toContainText(title);
    await expect(items.nth(0)).toHaveAttribute('href', `/meetings/${noteId}`);
    await expect(items.nth(1)).toContainText(olderTitle);
  });
});
