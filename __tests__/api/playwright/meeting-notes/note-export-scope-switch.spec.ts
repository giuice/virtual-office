import type { Download, Page } from '@playwright/test';

import { expect, test } from '../fixtures/meeting-notes';
import { closePlacementToasts, guardLocalSupabaseTraffic, login } from '../fixtures/messaging';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * Block B review B-2 (SPEC FR-021 browser clause, FR-027): an export started
 * by account A whose response arrives only after the browser switched to an
 * account of ANOTHER company never becomes a download, and nothing of A's
 * note appears in B's session.
 *
 * Real app, routes, Auth, and local database. The only shaping is network
 * timing: the export request reaches the real route, and its real response is
 * held by the test (route.fetch, then fulfill later) until after the switch.
 * The switch happens the way a shared browser sees it: another tab of the same
 * browser signs out through the account menu and signs in as B on the login
 * page; the auth client tells the note's tab.
 */
test.describe('meeting notes — export across an account switch (B-2)', () => {
  test('a delayed export of the previous account never downloads after sign-in as another company', async ({
    primaryPage,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Export switch room');
    const title = `${MEETING_NOTES_E2E_PREFIX} Export switch ${notesWorld.runTag}`;
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: '<p>Company A only</p>',
    });
    const transcript = `Company A transcript ${notesWorld.runTag}`;
    await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript });
    const otherTitle = `${MEETING_NOTES_E2E_PREFIX} Company B note ${notesWorld.runTag}`;
    await notesWorld.createOtherCompanyNote({ title: otherTitle, content: '<p>Company B</p>' });
    const account = await notesWorld.createOtherCompanyAccount('Switcher');

    const context = primaryPage.context();
    const downloads: string[] = [];
    const recordDownloads = (page: Page) => page.on('download', (download: Download) => downloads.push(download.suggestedFilename()));
    recordDownloads(primaryPage);
    context.on('page', recordDownloads);

    // Hold the real export response until the switch is done.
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    // Resolved once the real route answered for account A: the switch starts
    // only then, so the held response is A's real 200 (a first-hit compile of
    // the route must not let the sign-out reach the server first).
    let markFetched: () => void = () => undefined;
    const fetched = new Promise<void>((resolve) => {
      markFetched = resolve;
    });
    let markHandled: () => void = () => undefined;
    const handled = new Promise<void>((resolve) => {
      markHandled = resolve;
    });
    await primaryPage.route(
      (url) => url.pathname === `/api/meeting-notes/${noteId}/export`,
      async (route) => {
        markStarted();
        try {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          markFetched();
          await released;
          // The page may have aborted the request meanwhile (that is a pass too).
          await route.fulfill({ response }).catch(() => undefined);
        } finally {
          markHandled();
        }
      },
    );

    const noteTab = primaryPage;
    await openNote(noteTab, noteId);
    await noteTab.getByTestId('meeting-note-export-include-transcript').setChecked(true);
    await noteTab.getByRole('button', { name: 'Export Markdown' }).click();
    await started;
    await fetched;

    // Another tab of the same browser: sign out (account menu), sign in as B.
    const switchTab = await context.newPage();
    const verifySwitchTraffic = guardLocalSupabaseTraffic(switchTab, 'switch tab');
    await closePlacementToasts(switchTab);
    await switchTab.goto('/dashboard');
    await switchTab.getByTestId('account-menu-trigger').click();
    await switchTab.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(switchTab).toHaveURL(/\/login/, { timeout: 30_000 });
    await login(switchTab, account.email, account.password);

    // The note's tab has left account A's note (the view is keyed by scope).
    await expect(noteTab.getByText(title)).toHaveCount(0, { timeout: 60_000 });

    // Now the previous account's export response arrives.
    release();
    await handled;
    // Long enough for a late onSuccess to have created the download.
    await noteTab.waitForTimeout(3_000);
    expect(downloads, 'no file of the previous account may be downloaded').toEqual([]);

    // B's session shows B's note and nothing of A's.
    await switchTab.goto('/meetings');
    await expect(switchTab.getByText(otherTitle)).toBeVisible({ timeout: 30_000 });
    await expect(switchTab.getByText(title)).toHaveCount(0);
    await expect(switchTab.getByText(transcript)).toHaveCount(0);
    await expect(noteTab.getByText(title)).toHaveCount(0);
    await expect(noteTab.getByText(transcript)).toHaveCount(0);
    const asB = await notesWorld.readNote(switchTab, noteId);
    expect(asB.status).toBe(404);

    await switchTab.close();
    verifySwitchTraffic();
  });
});
