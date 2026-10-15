import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-003, render side (FR-002): note content carrying a script tag, an
 * onerror handler, an inline event handler, and a javascript: link is shown
 * without anything running. The content is first saved through the real
 * route (write-side sanitization) and then overwritten RAW in the local
 * database, so the view itself must neutralize it before it reaches the DOM.
 */
const HOSTILE_HTML = [
  '<p>Visible agenda text</p>',
  '<script>window.__mnXss = "script"; alert("script")</script>',
  '<img src="x" onerror="window.__mnXss = \'onerror\'; alert(\'onerror\')">',
  '<p onclick="window.__mnXss = \'onclick\'" onmouseover="window.__mnXss = \'hover\'">Hover me</p>',
  '<a href="javascript:window.__mnXss = \'link\'">Unsafe link</a>',
  '<a href="https://example.com/safe">Safe link</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<svg><script>window.__mnXss = "svg"</script></svg>',
].join('');

test.describe('meeting notes — rendering hostile content (AC-003)', () => {
  test('shows stored script, handlers, and javascript: links without executing them', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Sanitize room');
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} Hostile ${notesWorld.runTag}`,
      meetingDate: new Date(),
      content: HOSTILE_HTML,
    });

    // Write side: the route stored a sanitized copy.
    const saved = await notesWorld.readNote(primaryPage, noteId);
    expect(saved.note?.content).toContain('Visible agenda text');
    expect(saved.note?.content).not.toMatch(/<script|onerror|onclick|javascript:|<iframe|<img/i);

    // Render side: the raw markup reaches the database by another path.
    await notesWorld.overwriteStoredContentUnsafe(noteId, HOSTILE_HTML);

    const page = secondaryPage;
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await openNote(page, noteId);
    const content = page.getByTestId('meeting-note-content');
    await expect(content).toContainText('Visible agenda text');
    await expect(content).toContainText('Unsafe link');

    // Nothing hostile reached the DOM.
    await expect(content.locator('script, img, iframe, svg, [onerror], [onclick], [onmouseover]')).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
    await expect(content.getByRole('link', { name: 'Safe link' })).toHaveAttribute('href', 'https://example.com/safe');

    // Interacting with the neutralized parts runs nothing.
    await content.getByText('Hover me').hover();
    await content.getByText('Hover me').click();
    await content.getByText('Unsafe link').click();
    await expect(page).toHaveURL(new RegExp(`/meetings/${noteId}$`));

    expect(await page.evaluate(() => (window as unknown as { __mnXss?: string }).__mnXss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });
});
