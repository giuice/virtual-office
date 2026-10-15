import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX, uniqueSearchWord } from '../helpers/meeting-notes-e2e';

/**
 * AC-020 (FR-028; UI label part — editing rights after deletion are T6, the
 * database contract is the DB integration suite): once a space is deleted,
 * its notes stay on the Meetings page and in search, labelled "Space removed",
 * with their author kept.
 */
test.describe('meeting notes — deleted space (AC-020)', () => {
  test('notes of a deleted space show "Space removed" on the Meetings page and in search', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    const word = uniqueSearchWord();
    const space = await notesWorld.createSpace('Doomed room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Retrospective ${word}`;
    await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: `<p>Kept after the space is gone ${word}</p>`,
    });

    // The admin deletes the space through the real route (no one is inside it).
    await notesWorld.deleteSpaceThroughApi(primaryPage, space.id);

    const page = secondaryPage;
    await page.goto('/meetings');
    await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible({ timeout: 30_000 });
    const authorName = process.env.PLAYWRIGHT_PRIMARY_DISPLAY_NAME ?? 'Local Primary';

    // Meetings page list (empty search): the note is listed with the label.
    const listed = page.getByTestId('meeting-note-result').filter({ hasText: title });
    await expect(listed).toHaveCount(1, { timeout: 15_000 });
    await expect(listed.getByTestId('meeting-note-space-removed')).toHaveText('Space removed');
    await expect(listed).not.toContainText(space.name);
    await expect(listed).toContainText(authorName);

    // Search: the same label.
    await page.getByLabel('Search notes', { exact: true }).fill(word);
    const found = page.getByTestId('meeting-note-result').filter({ hasText: title });
    await expect(page.getByTestId('meeting-note-result')).toHaveCount(1, { timeout: 15_000 });
    await expect(found.getByTestId('meeting-note-space-removed')).toHaveText('Space removed');

    // The "Space removed" filter finds it; the deleted space is no longer a choice.
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'Space removed' });
    await expect(found).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByLabel('Space', { exact: true }).locator('option', { hasText: space.name })).toHaveCount(0);
  });
});
