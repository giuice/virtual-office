import type { Browser, BrowserContext, Page } from '@playwright/test';

import { expect, test } from '../fixtures/meeting-notes';
import { closePlacementToasts, guardLocalSupabaseTraffic } from '../fixtures/messaging';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import {
  actionItemRow,
  exportNoteMarkdown,
  fillActionItemForm,
  openNote,
  saveActionItemForm,
} from '../helpers/meeting-notes-ui';

/**
 * AC-009, display side (FR-011): an action item's due date is a calendar
 * date. Saved as 2026-11-05 from a browser in America/Los_Angeles (UTC-8/-7),
 * it is stored as 2026-11-05, shown as 2026-11-05 there and in a browser in
 * Asia/Tokyo (UTC+9), and both browsers' Markdown exports say 2026-11-05.
 * A Date-based conversion would move the day in at least one of these zones.
 */
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

async function pageInZone(
  browser: Browser,
  storageState: StorageState,
  timezoneId: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState, timezoneId });
  const page = await context.newPage();
  const verifyTraffic = guardLocalSupabaseTraffic(page, timezoneId);
  await closePlacementToasts(page);
  return {
    page,
    close: async () => {
      await context.close();
      verifyTraffic();
    },
  };
}

test.describe('meeting notes — due dates across time zones (AC-009)', () => {
  test('a due date of 2026-11-05 is saved, shown, and exported as 2026-11-05 in Los Angeles and Tokyo', async ({
    browser,
    primaryPage,
    primaryStorageState,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Due date room');
    const tag = notesWorld.runTag;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} Due date ${tag}`,
      meetingDate: new Date(),
      content: '<p>Due date check</p>',
    });
    const description = `Ship the report ${tag}`;

    // Los Angeles: the editor sets the due date through the form.
    const losAngeles = await pageInZone(browser, primaryStorageState, 'America/Los_Angeles');
    try {
      const page = losAngeles.page;
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/Los_Angeles');
      await openNote(page, noteId);
      await page.getByTestId('meeting-note-item-add').click();
      await fillActionItemForm(page, { description, dueDate: '2026-11-05' });
      await saveActionItemForm(page);
      const row = actionItemRow(page, description);
      await expect(row.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-05');
      await expect(row.locator('time')).toHaveAttribute('datetime', '2026-11-05');

      const stored = await notesWorld.readNote(page, noteId);
      expect(stored.note?.actionItems.map((item) => item.dueDate)).toEqual(['2026-11-05']);

      // The edit form shows the same calendar date.
      await row.getByTestId('meeting-note-item-edit').click();
      await expect(page.getByTestId('meeting-note-item-form').getByLabel('Due date')).toHaveValue('2026-11-05');
      await page.getByTestId('meeting-note-item-form').getByRole('button', { name: 'Cancel' }).click();

      const file = await exportNoteMarkdown(page);
      expect(file.text).toContain('  - Due date: 2026-11-05\n');
    } finally {
      await losAngeles.close();
    }

    // Tokyo: the same item reads and exports as the same day.
    const tokyo = await pageInZone(browser, primaryStorageState, 'Asia/Tokyo');
    try {
      const page = tokyo.page;
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Asia/Tokyo');
      await openNote(page, noteId);
      const row = actionItemRow(page, description);
      await expect(row.getByTestId('meeting-note-item-due')).toHaveText('Due 2026-11-05');
      await row.getByTestId('meeting-note-item-edit').click();
      await expect(page.getByTestId('meeting-note-item-form').getByLabel('Due date')).toHaveValue('2026-11-05');
      await page.getByTestId('meeting-note-item-form').getByRole('button', { name: 'Cancel' }).click();

      const file = await exportNoteMarkdown(page);
      expect(file.text).toContain('  - Due date: 2026-11-05\n');
    } finally {
      await tokyo.close();
    }
  });
});
