import { expect, test } from '../fixtures/meeting-notes';
import { daysAgo, localDay, MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { addParticipant, noteEditor, openNote, replaceEditorText } from '../helpers/meeting-notes-ui';

/**
 * Block B review B-3 (FR-006, FR-007): a save that cannot reach the server
 * shows an error and keeps every edited field; a later failed refresh of the
 * note (network still failing after reconnecting) is shown next to the editor
 * and never replaces it; once the network works, saving stores the edits.
 *
 * Real app, routes, and local database. Network shaping only: the browser is
 * taken offline (context.setOffline), and after reconnecting the note's
 * refresh requests are failed in transit (route.abort) — the server is never
 * replaced.
 */
test.describe('meeting notes — save while offline (B-3)', () => {
  test('an offline save keeps the draft; a failed refresh does not unmount the editor; the retry saves it', async ({
    primaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Offline room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Offline ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: daysAgo(5),
      content: '<p>Original offline text</p>',
    });
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);

    const page = primaryPage;
    const context = page.context();
    const view = await openNote(page, noteId);
    await expect(view).toHaveAttribute('data-revision', '1');
    await page.getByTestId('meeting-note-edit-button').click();
    await noteEditor(page);

    // Edit every field.
    const newTitle = `${title} edited`;
    const newText = `Offline decision ${notesWorld.runTag}`;
    const newDay = localDay(daysAgo(2));
    const form = page.getByTestId('meeting-note-form');
    await form.getByLabel('Title').fill(newTitle);
    await form.getByLabel('Meeting date').fill(newDay);
    await addParticipant(page, secondaryName);
    await replaceEditorText(page, newText);

    const expectDraftIntact = async () => {
      await expect(page.getByTestId('meeting-note-edit-panel')).toBeVisible();
      await expect(form.getByLabel('Title')).toHaveValue(newTitle);
      await expect(form.getByLabel('Meeting date')).toHaveValue(newDay);
      await expect(page.getByTestId('meeting-note-participant-chip').filter({ hasText: secondaryName })).toBeVisible();
      await expect(await noteEditor(page)).toContainText(newText);
    };

    // Offline: the save fails at once with a network error; nothing is lost.
    await context.setOffline(true);
    await page.getByTestId('meeting-note-submit').click();
    await expect(form.getByRole('alert').filter({ hasText: 'Could not reach the server' })).toBeVisible({
      timeout: 15_000,
    });
    await expectDraftIntact();
    expect((await notesWorld.readNote(page, noteId)).note?.revision).toBe(1);

    // Back online with the note's refreshes still failing in transit: once the
    // cached note is stale (15 s), reconnecting refetches it and every attempt
    // (with retries) fails. The error shows beside the editor; the draft stays.
    let failedRefreshes = 0;
    const isNoteRead = (url: URL) => url.pathname === `/api/meeting-notes/${noteId}`;
    await page.route(isNoteRead, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      failedRefreshes += 1;
      return route.abort('internetdisconnected');
    });
    await page.waitForTimeout(16_000);
    await context.setOffline(false);
    await expect(page.getByTestId('meeting-note-refresh-error')).toBeVisible({ timeout: 30_000 });
    expect(failedRefreshes).toBeGreaterThan(0);
    await expectDraftIntact();

    // The network works again: saving stores every edit.
    await page.unroute(isNoteRead);
    await page.getByTestId('meeting-note-submit').click();
    const saved = page.getByTestId('meeting-note-view');
    await expect(saved).toBeVisible({ timeout: 30_000 });
    await expect(saved).toHaveAttribute('data-revision', '2');
    await expect(page.getByTestId('meeting-note-title')).toHaveText(newTitle);
    await expect(page.getByTestId('meeting-note-content')).toContainText(newText);

    const stored = await notesWorld.readNote(page, noteId);
    expect(stored.note?.revision).toBe(2);
    expect(stored.note?.title).toBe(newTitle);
    expect(stored.note?.content).toContain(newText);
    expect(stored.note?.participants.map((participant) => participant.userId)).toEqual([messagingData.secondary.userId]);
    expect(localDay(new Date(stored.note?.meetingDate ?? ''))).toBe(newDay);
  });
});
