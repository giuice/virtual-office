import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/meeting-notes';
import { daysAgo, localDay, MEETING_NOTES_E2E_PREFIX, uniqueSearchWord } from '../helpers/meeting-notes-e2e';

/**
 * AC-014 UI path (FR-004, FR-026, BR-001): the Meetings page search box,
 * space and period filters, highlighted text-only excerpts, pagination, and
 * company isolation. Ranking, languages, and timing at 1,000 notes are proven
 * by the DB integration suite; this spec drives the same route through the UI.
 */

function results(page: Page): Locator {
  return page.getByTestId('meeting-note-result');
}

function resultFor(page: Page, title: string): Locator {
  return results(page).filter({ hasText: title });
}

async function search(page: Page, text: string): Promise<void> {
  await page.getByLabel('Search notes', { exact: true }).fill(text);
}

test.describe('meeting notes — Meetings page search (AC-014)', () => {
  test('finds notes by title, content, and action item with filters, highlights, paging, and isolation', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    test.slow();
    const word = uniqueSearchWord();
    const pagingWord = uniqueSearchWord();
    const spaceOne = await notesWorld.createSpace('Search room one');
    const spaceTwo = await notesWorld.createSpace('Search room two');
    const pagingSpace = await notesWorld.createSpace('Search paging room');

    const titleNote = `${MEETING_NOTES_E2E_PREFIX} Orçamento ${word}`;
    const contentNote = `${MEETING_NOTES_E2E_PREFIX} Kickoff ${notesWorld.runTag}`;
    const itemNote = `${MEETING_NOTES_E2E_PREFIX} Planning ${notesWorld.runTag}`;
    const markupNote = `${MEETING_NOTES_E2E_PREFIX} Symbols ${notesWorld.runTag}`;
    const otherCompanyNote = `${MEETING_NOTES_E2E_PREFIX} Orçamento ${word} company B`;

    await notesWorld.createNote(primaryPage, {
      spaceId: spaceOne.id,
      title: titleNote,
      meetingDate: new Date(),
      content: '<p>Pauta geral</p>',
    });
    await notesWorld.createNote(primaryPage, {
      spaceId: spaceTwo.id,
      title: contentNote,
      meetingDate: daysAgo(40),
      content: `<p>Revisão do orçamento ${word} trimestral</p>`,
    });
    const itemNoteId = await notesWorld.createNote(primaryPage, {
      spaceId: spaceOne.id,
      title: itemNote,
      meetingDate: daysAgo(2),
      content: '<p>General planning</p>',
    });
    await notesWorld.addActionItem(primaryPage, itemNoteId, `Send the budget report ${word}`);
    // Text that looks like markup must reach the excerpt as text only. A word
    // precedes it because ts_headline trims punctuation at a fragment start.
    await notesWorld.createNote(primaryPage, {
      spaceId: spaceTwo.id,
      title: markupNote,
      meetingDate: daysAgo(3),
      content: `<p>Symbols &lt;img src=x onerror="window.__mnXss=1"&gt; ${word} markup</p>`,
    });
    await notesWorld.createOtherCompanyNote({
      title: otherCompanyNote,
      content: `<p>Revisão do orçamento ${word} budget</p>`,
    });
    for (let index = 1; index <= 21; index += 1) {
      await notesWorld.createNote(primaryPage, {
        spaceId: pagingSpace.id,
        title: `${MEETING_NOTES_E2E_PREFIX} Paging ${index} ${notesWorld.runTag}`,
        meetingDate: daysAgo(index),
        content: `<p>Paging ${pagingWord}</p>`,
      });
    }

    const page = secondaryPage;
    await page.goto('/meetings');
    await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('search', { name: 'Search meeting notes' })).toBeVisible();

    // Portuguese without the accent matches the title and the content.
    await search(page, `orcamento ${word}`);
    await expect(resultFor(page, titleNote)).toHaveCount(1, { timeout: 15_000 });
    await expect(resultFor(page, contentNote)).toHaveCount(1);
    await expect(resultFor(page, itemNote)).toHaveCount(0);
    await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);
    const contentExcerpt = resultFor(page, contentNote).getByTestId('meeting-note-excerpt');
    await expect(contentExcerpt).toContainText('Notes:');
    await expect(contentExcerpt.locator('mark').filter({ hasText: /orçamento/i })).toHaveCount(1);
    await expect(contentExcerpt.locator('mark').filter({ hasText: word })).toHaveCount(1);
    await expect(resultFor(page, contentNote)).toContainText(spaceTwo.name);

    // English with different case matches the action-item description.
    await search(page, `BUDGET ${word.toUpperCase()}`);
    await expect(resultFor(page, itemNote)).toHaveCount(1, { timeout: 15_000 });
    await expect(resultFor(page, itemNote).getByTestId('meeting-note-excerpt')).toContainText('Action item:');
    await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);

    // Markup-looking text is shown as text; no element is created from it.
    await search(page, `markup ${word}`);
    const markupResult = resultFor(page, markupNote);
    await expect(markupResult).toHaveCount(1, { timeout: 15_000 });
    await expect(markupResult.getByTestId('meeting-note-excerpt')).toContainText('<img src=x');
    await expect(page.getByTestId('meeting-notes-results').locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __mnXss?: number }).__mnXss)).toBeUndefined();

    // Every note of company A with the word; none of company B.
    await search(page, word);
    await expect(results(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);

    // Space filter.
    await page.getByLabel('Space', { exact: true }).selectOption({ label: spaceOne.name });
    await expect(results(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(resultFor(page, titleNote)).toHaveCount(1);
    await expect(resultFor(page, itemNote)).toHaveCount(1);

    // "Space removed" filter: none of these notes lost their space.
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'Space removed' });
    await expect(page.getByText('No notes match this search.')).toBeVisible({ timeout: 15_000 });

    // Period filter (local days; the 40-day-old note falls outside).
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'All spaces' });
    await page.getByLabel('Meeting from').fill(localDay(daysAgo(7)));
    await page.getByLabel('Meeting to').fill(localDay(new Date()));
    await expect(results(page)).toHaveCount(3, { timeout: 15_000 });
    await expect(resultFor(page, contentNote)).toHaveCount(0);

    // An inverted period is refused in the page.
    await page.getByLabel('Meeting from').fill(localDay(new Date()));
    await page.getByLabel('Meeting to').fill(localDay(daysAgo(7)));
    await expect(page.getByText('The start date must be on or before the end date.')).toBeVisible();
    await page.getByLabel('Meeting from').fill('');
    await page.getByLabel('Meeting to').fill('');

    // List mode (empty search) within a space: newest meeting first.
    await search(page, '');
    await page.getByLabel('Space', { exact: true }).selectOption({ label: spaceOne.name });
    await expect(results(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(results(page).nth(0)).toContainText(titleNote);
    await expect(results(page).nth(1)).toContainText(itemNote);
    await expect(results(page).first().getByTestId('meeting-note-excerpt')).toHaveCount(0);

    // Pagination: 21 matches, 20 per page, then "Load more".
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'All spaces' });
    await search(page, pagingWord);
    await expect(results(page)).toHaveCount(20, { timeout: 15_000 });
    await expect(page.getByTestId('meeting-notes-count')).toHaveText('21 notes');
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(results(page)).toHaveCount(21, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });
});
