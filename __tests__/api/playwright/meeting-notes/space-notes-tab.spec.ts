import { expect, test } from '../fixtures/meeting-notes';
import { daysAgo, MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';

/**
 * AC-001 (FR-003; listing part — the note view and its formatting are T6):
 * a space's "Notes" tab lists the space's notes newest meeting date first,
 * regardless of creation order, and offers "New note". The member (secondary)
 * reads the notes the admin (primary) wrote in a private space.
 */
test.describe('meeting notes — space Notes tab (AC-001)', () => {
  test('lists the space notes by meeting date, newest first, including a backdated note', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Private notes room', { isPublic: false });

    // Creation order differs from meeting-date order on purpose.
    const todayTitle = `${MEETING_NOTES_E2E_PREFIX} Today sync ${notesWorld.runTag}`;
    const lastMonthTitle = `${MEETING_NOTES_E2E_PREFIX} Last month review ${notesWorld.runTag}`;
    const yesterdayTitle = `${MEETING_NOTES_E2E_PREFIX} Yesterday standup ${notesWorld.runTag}`;
    const todayId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: todayTitle,
      meetingDate: new Date(),
      content: '<p>Agenda for today</p>',
    });
    const lastMonthId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: lastMonthTitle,
      meetingDate: daysAgo(31),
      content: '<p>Backdated review</p>',
    });
    const yesterdayId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: yesterdayTitle,
      meetingDate: daysAgo(1),
      content: '<p>Standup notes</p>',
    });

    const page = secondaryPage;
    await page.goto('/floor-plan');
    const card = page.getByTestId(`space-${space.id}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    const panel = page.getByRole('region', { name: `Details for ${space.name}` });
    await expect(panel).toBeVisible();
    const detailsTab = panel.getByRole('tab', { name: 'Details' });
    const notesTab = panel.getByRole('tab', { name: 'Notes' });
    // Details stays the default tab.
    await expect(detailsTab).toHaveAttribute('aria-selected', 'true');

    // Keyboard reachable (§13): arrow keys move between the tabs.
    await detailsTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(notesTab).toBeFocused();
    await expect(notesTab).toHaveAttribute('aria-selected', 'true');

    const items = panel.getByTestId('space-note-item');
    await expect(items).toHaveCount(3, { timeout: 15_000 });
    await expect(items.nth(0)).toContainText(todayTitle);
    await expect(items.nth(1)).toContainText(yesterdayTitle);
    await expect(items.nth(2)).toContainText(lastMonthTitle);
    await expect(items.nth(0)).toHaveAttribute('href', `/meetings/${todayId}`);
    await expect(items.nth(1)).toHaveAttribute('href', `/meetings/${yesterdayId}`);
    await expect(items.nth(2)).toHaveAttribute('href', `/meetings/${lastMonthId}`);
    // The author snapshot is shown on each row.
    await expect(items.nth(0)).toContainText(process.env.PLAYWRIGHT_PRIMARY_DISPLAY_NAME ?? 'Local Primary');

    const newNote = panel.getByRole('link', { name: `New note in ${space.name}` });
    await expect(newNote).toHaveAttribute('href', `/meetings/new?spaceId=${space.id}`);

    // Switching tabs neither navigated nor closed the panel (click-stop surface).
    await expect(page).toHaveURL(/\/floor-plan/);
    await expect(panel).toBeVisible();
  });
});
