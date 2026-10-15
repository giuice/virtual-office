# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: meetings-search.spec.ts >> meeting notes — Meetings page search (AC-014) >> finds notes by title, content, and action item with filters, highlights, paging, and isolation
- Location: __tests__\api\playwright\meeting-notes\meetings-search.spec.ts:26:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('meeting-note-result').filter({ hasText: 'MN E2E Symbols fe34b068' }).getByTestId('meeting-note-excerpt')
Expected substring: "<img src=x"
Received string:    "Notes:mnxtbdsvqttl markup"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByTestId('meeting-note-result').filter({ hasText: 'MN E2E Symbols fe34b068' }).getByTestId('meeting-note-excerpt')
    14 × locator resolved to <p data-testid="meeting-note-excerpt" class="mt-2 line-clamp-3 text-sm text-muted-foreground">…</p>
       - unexpected value "Notes:mnxtbdsvqttl markup"

```

```yaml
- paragraph:
  - text: "Notes:"
  - mark: mnxtbdsvqttl
  - mark: markup
```

# Test source

```ts
  10  |  * by the DB integration suite; this spec drives the same route through the UI.
  11  |  */
  12  | 
  13  | function results(page: Page): Locator {
  14  |   return page.getByTestId('meeting-note-result');
  15  | }
  16  | 
  17  | function resultFor(page: Page, title: string): Locator {
  18  |   return results(page).filter({ hasText: title });
  19  | }
  20  | 
  21  | async function search(page: Page, text: string): Promise<void> {
  22  |   await page.getByLabel('Search notes', { exact: true }).fill(text);
  23  | }
  24  | 
  25  | test.describe('meeting notes — Meetings page search (AC-014)', () => {
  26  |   test('finds notes by title, content, and action item with filters, highlights, paging, and isolation', async ({
  27  |     primaryPage,
  28  |     secondaryPage,
  29  |     notesWorld,
  30  |   }) => {
  31  |     test.slow();
  32  |     const word = uniqueSearchWord();
  33  |     const pagingWord = uniqueSearchWord();
  34  |     const spaceOne = await notesWorld.createSpace('Search room one');
  35  |     const spaceTwo = await notesWorld.createSpace('Search room two');
  36  |     const pagingSpace = await notesWorld.createSpace('Search paging room');
  37  | 
  38  |     const titleNote = `${MEETING_NOTES_E2E_PREFIX} Orçamento ${word}`;
  39  |     const contentNote = `${MEETING_NOTES_E2E_PREFIX} Kickoff ${notesWorld.runTag}`;
  40  |     const itemNote = `${MEETING_NOTES_E2E_PREFIX} Planning ${notesWorld.runTag}`;
  41  |     const markupNote = `${MEETING_NOTES_E2E_PREFIX} Symbols ${notesWorld.runTag}`;
  42  |     const otherCompanyNote = `${MEETING_NOTES_E2E_PREFIX} Orçamento ${word} company B`;
  43  | 
  44  |     await notesWorld.createNote(primaryPage, {
  45  |       spaceId: spaceOne.id,
  46  |       title: titleNote,
  47  |       meetingDate: new Date(),
  48  |       content: '<p>Pauta geral</p>',
  49  |     });
  50  |     await notesWorld.createNote(primaryPage, {
  51  |       spaceId: spaceTwo.id,
  52  |       title: contentNote,
  53  |       meetingDate: daysAgo(40),
  54  |       content: `<p>Revisão do orçamento ${word} trimestral</p>`,
  55  |     });
  56  |     const itemNoteId = await notesWorld.createNote(primaryPage, {
  57  |       spaceId: spaceOne.id,
  58  |       title: itemNote,
  59  |       meetingDate: daysAgo(2),
  60  |       content: '<p>General planning</p>',
  61  |     });
  62  |     await notesWorld.addActionItem(primaryPage, itemNoteId, `Send the budget report ${word}`);
  63  |     // Text that looks like markup must reach the excerpt as text only.
  64  |     await notesWorld.createNote(primaryPage, {
  65  |       spaceId: spaceTwo.id,
  66  |       title: markupNote,
  67  |       meetingDate: daysAgo(3),
  68  |       content: `<p>&lt;img src=x onerror="window.__mnXss=1"&gt; ${word} markup</p>`,
  69  |     });
  70  |     await notesWorld.createOtherCompanyNote({
  71  |       title: otherCompanyNote,
  72  |       content: `<p>Revisão do orçamento ${word} budget</p>`,
  73  |     });
  74  |     for (let index = 1; index <= 21; index += 1) {
  75  |       await notesWorld.createNote(primaryPage, {
  76  |         spaceId: pagingSpace.id,
  77  |         title: `${MEETING_NOTES_E2E_PREFIX} Paging ${index} ${notesWorld.runTag}`,
  78  |         meetingDate: daysAgo(index),
  79  |         content: `<p>Paging ${pagingWord}</p>`,
  80  |       });
  81  |     }
  82  | 
  83  |     const page = secondaryPage;
  84  |     await page.goto('/meetings');
  85  |     await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible({ timeout: 30_000 });
  86  |     await expect(page.getByRole('search', { name: 'Search meeting notes' })).toBeVisible();
  87  | 
  88  |     // Portuguese without the accent matches the title and the content.
  89  |     await search(page, `orcamento ${word}`);
  90  |     await expect(resultFor(page, titleNote)).toHaveCount(1, { timeout: 15_000 });
  91  |     await expect(resultFor(page, contentNote)).toHaveCount(1);
  92  |     await expect(resultFor(page, itemNote)).toHaveCount(0);
  93  |     await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);
  94  |     const contentExcerpt = resultFor(page, contentNote).getByTestId('meeting-note-excerpt');
  95  |     await expect(contentExcerpt).toContainText('Notes:');
  96  |     await expect(contentExcerpt.locator('mark').filter({ hasText: /orçamento/i })).toHaveCount(1);
  97  |     await expect(contentExcerpt.locator('mark').filter({ hasText: word })).toHaveCount(1);
  98  |     await expect(resultFor(page, contentNote)).toContainText(spaceTwo.name);
  99  | 
  100 |     // English with different case matches the action-item description.
  101 |     await search(page, `BUDGET ${word.toUpperCase()}`);
  102 |     await expect(resultFor(page, itemNote)).toHaveCount(1, { timeout: 15_000 });
  103 |     await expect(resultFor(page, itemNote).getByTestId('meeting-note-excerpt')).toContainText('Action item:');
  104 |     await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);
  105 | 
  106 |     // Markup-looking text is shown as text; no element is created from it.
  107 |     await search(page, `markup ${word}`);
  108 |     const markupResult = resultFor(page, markupNote);
  109 |     await expect(markupResult).toHaveCount(1, { timeout: 15_000 });
> 110 |     await expect(markupResult.getByTestId('meeting-note-excerpt')).toContainText('<img src=x');
      |                                                                    ^ Error: expect(locator).toContainText(expected) failed
  111 |     await expect(page.getByTestId('meeting-notes-results').locator('img')).toHaveCount(0);
  112 |     expect(await page.evaluate(() => (window as unknown as { __mnXss?: number }).__mnXss)).toBeUndefined();
  113 | 
  114 |     // Every note of company A with the word; none of company B.
  115 |     await search(page, word);
  116 |     await expect(results(page)).toHaveCount(4, { timeout: 15_000 });
  117 |     await expect(results(page).filter({ hasText: 'company B' })).toHaveCount(0);
  118 | 
  119 |     // Space filter.
  120 |     await page.getByLabel('Space', { exact: true }).selectOption({ label: spaceOne.name });
  121 |     await expect(results(page)).toHaveCount(2, { timeout: 15_000 });
  122 |     await expect(resultFor(page, titleNote)).toHaveCount(1);
  123 |     await expect(resultFor(page, itemNote)).toHaveCount(1);
  124 | 
  125 |     // "Space removed" filter: none of these notes lost their space.
  126 |     await page.getByLabel('Space', { exact: true }).selectOption({ label: 'Space removed' });
  127 |     await expect(page.getByText('No notes match this search.')).toBeVisible({ timeout: 15_000 });
  128 | 
  129 |     // Period filter (local days; the 40-day-old note falls outside).
  130 |     await page.getByLabel('Space', { exact: true }).selectOption({ label: 'All spaces' });
  131 |     await page.getByLabel('Meeting from').fill(localDay(daysAgo(7)));
  132 |     await page.getByLabel('Meeting to').fill(localDay(new Date()));
  133 |     await expect(results(page)).toHaveCount(3, { timeout: 15_000 });
  134 |     await expect(resultFor(page, contentNote)).toHaveCount(0);
  135 | 
  136 |     // An inverted period is refused in the page.
  137 |     await page.getByLabel('Meeting from').fill(localDay(new Date()));
  138 |     await page.getByLabel('Meeting to').fill(localDay(daysAgo(7)));
  139 |     await expect(page.getByText('The start date must be on or before the end date.')).toBeVisible();
  140 |     await page.getByLabel('Meeting from').fill('');
  141 |     await page.getByLabel('Meeting to').fill('');
  142 | 
  143 |     // List mode (empty search) within a space: newest meeting first.
  144 |     await search(page, '');
  145 |     await page.getByLabel('Space', { exact: true }).selectOption({ label: spaceOne.name });
  146 |     await expect(results(page)).toHaveCount(2, { timeout: 15_000 });
  147 |     await expect(results(page).nth(0)).toContainText(titleNote);
  148 |     await expect(results(page).nth(1)).toContainText(itemNote);
  149 |     await expect(results(page).first().getByTestId('meeting-note-excerpt')).toHaveCount(0);
  150 | 
  151 |     // Pagination: 21 matches, 20 per page, then "Load more".
  152 |     await page.getByLabel('Space', { exact: true }).selectOption({ label: 'All spaces' });
  153 |     await search(page, pagingWord);
  154 |     await expect(results(page)).toHaveCount(20, { timeout: 15_000 });
  155 |     await expect(page.getByTestId('meeting-notes-count')).toHaveText('21 notes');
  156 |     await page.getByRole('button', { name: 'Load more' }).click();
  157 |     await expect(results(page)).toHaveCount(21, { timeout: 15_000 });
  158 |     await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  159 |   });
  160 | });
  161 | 
```