import type { Browser, BrowserContext, Page } from '@playwright/test';

import { expect, test } from '../fixtures/meeting-notes';
import { closePlacementToasts, guardLocalSupabaseTraffic, login } from '../fixtures/messaging';
import { MEETING_NOTES_E2E_PREFIX, type MeetingNotesE2EWorld } from '../helpers/meeting-notes-e2e';
import {
  configureFakeOpenAi,
  fakeAi,
  installDraftReviewMonitor,
  openAiNotice,
  routeRealtimeInbound,
  successOutcome,
  type DraftReviewMonitor,
  type RealtimeInboundHold,
} from '../helpers/meeting-notes-ai-e2e';
import { openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-033 (FR-021 browser clause, SM-3): a processing whose route response is
 * delayed never shows a draft or a note of the previous scope:
 *   1. the fake provider holds the request (`pause`) while the member signs
 *      out and an account of ANOTHER company signs in (in another tab of the
 *      same browser) before the response arrives;
 *   2. the route really SUCCEEDS (its 200 carries the draft), and the test
 *      holds that response in transit with network interception
 *      (`page.route` + `route.fetch()`; the app is unchanged) while an admin
 *      removes the member and the Realtime frames to this browser are held,
 *      so membership reconciliation cannot retire the scope first. The
 *      browser must re-check access before showing the draft and drop it.
 * The member is a dedicated account of company A (notesWorld), so signing it
 * out or removing it never touches the shared seed accounts. A monitor
 * installed in every document of the context (init script + exposed binding)
 * records whether a draft review was rendered at any moment, across
 * full-page navigations.
 */

async function signedInMember(
  browser: Browser,
  world: MeetingNotesE2EWorld,
  label: string,
): Promise<{
  context: BrowserContext;
  page: Page;
  member: { email: string; password: string; userId: string };
  monitor: DraftReviewMonitor;
  realtime: RealtimeInboundHold;
  verifyTraffic: () => void;
}> {
  const member = await world.createCompanyAccount(label);
  const context = await browser.newContext();
  // Both before the first page: every document is observed, every socket routed.
  const monitor = await installDraftReviewMonitor(context);
  const realtime = await routeRealtimeInbound(context);
  const page = await context.newPage();
  const verifyTraffic = guardLocalSupabaseTraffic(page, label);
  await closePlacementToasts(page);
  await login(page, member.email, member.password);
  return { context, page, member, monitor, realtime, verifyTraffic };
}

function delayedDraft(tag: string) {
  const draftText = `Company A draft ${tag}`;
  return {
    draftText,
    outcome: {
      kind: 'pause' as const,
      then: successOutcome({
        summary: { keyPoints: [draftText], decisions: [], nextSteps: [] },
        actionItems: [{ description: `Company A item ${tag}`, assigneeName: null }],
      }),
    },
  };
}

test.describe('meeting notes — late AI responses across a scope change (AC-033)', () => {
  test('a delayed draft never appears after sign-out and sign-in as another company', async ({
    browser,
    primaryPage,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    const { context, page: noteTab, monitor, verifyTraffic } = await signedInMember(browser, notesWorld, 'Switch member');
    try {
      const tag = notesWorld.runTag;
      const other = await notesWorld.createOtherCompanyAccount('Switch target');
      const otherTitle = `${MEETING_NOTES_E2E_PREFIX} Company B note ${tag}`;
      await notesWorld.createOtherCompanyNote({ title: otherTitle, content: '<p>Company B</p>' });
      const space = await notesWorld.createSpace('Late response room');
      const title = `${MEETING_NOTES_E2E_PREFIX} Late response ${tag}`;
      const noteId = await notesWorld.createNote(noteTab, {
        spaceId: space.id,
        title,
        meetingDate: new Date(),
        content: '<p>Company A only</p>',
      });
      await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript: `Ana: Company A plans ${tag}.` });
      const { draftText, outcome } = delayedDraft(tag);
      await fakeAi.script('openai', outcome);

      // Start processing; the provider holds the request.
      await openNote(noteTab, noteId);
      await monitor.expectActive(noteTab);
      await openAiNotice(noteTab);
      await noteTab.getByTestId('meeting-note-ai-process').click();
      await expect(noteTab.getByTestId('meeting-note-ai-progress')).toBeVisible();
      await fakeAi.waitForHeld('openai', 'paused', 1, 30_000);

      // Another tab of the same browser: sign out (account menu), sign in as company B.
      const switchTab = await context.newPage();
      const verifySwitchTraffic = guardLocalSupabaseTraffic(switchTab, 'switch tab');
      await closePlacementToasts(switchTab);
      await switchTab.goto('/dashboard');
      await switchTab.getByTestId('account-menu-trigger').click();
      await switchTab.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(switchTab).toHaveURL(/\/login/, { timeout: 30_000 });
      await login(switchTab, other.email, other.password);

      // The note's tab has left the previous scope's note.
      await expect(noteTab.getByText(title)).toHaveCount(0, { timeout: 60_000 });

      // Now the delayed response is released.
      await fakeAi.release('openai');
      // Long enough for a late answer to have been rendered.
      await noteTab.waitForTimeout(3_000);
      await monitor.expectActive(noteTab);
      expect(monitor.wasSeen(noteTab), 'no draft of the previous account may be shown').toBe(false);
      await expect(noteTab.getByText(draftText)).toHaveCount(0);
      await expect(noteTab.getByTestId('meeting-note-ai-review')).toHaveCount(0);

      // Company B's session shows B's notes and nothing of A's.
      await switchTab.goto('/meetings');
      await expect(switchTab.getByText(otherTitle)).toBeVisible({ timeout: 30_000 });
      await expect(switchTab.getByText(title)).toHaveCount(0);
      await expect(switchTab.getByText(draftText)).toHaveCount(0);
      await expect(noteTab.getByText(title)).toHaveCount(0);
      expect((await notesWorld.readNote(switchTab, noteId)).status).toBe(404);
      expect(monitor.wasSeen(switchTab), 'the other tab never showed the draft either').toBe(false);

      // Nothing was applied to A's note.
      const stored = await notesWorld.readNote(primaryPage, noteId);
      expect(stored.note?.summary).toBeNull();
      expect(stored.note?.actionItems).toEqual([]);

      await switchTab.close();
      verifySwitchTraffic();
      verifyTraffic();
    } finally {
      await context.close();
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });

  test('a member removed while a successful draft response is in transit never sees the draft', async ({
    browser,
    primaryPage,
    notesWorld,
  }) => {
    await fakeAi.reset();
    await configureFakeOpenAi(primaryPage, notesWorld);
    const { context, page: noteTab, member, monitor, realtime, verifyTraffic } = await signedInMember(
      browser,
      notesWorld,
      'Removed member',
    );
    let releaseHeld: () => void = () => undefined;
    try {
      const tag = notesWorld.runTag;
      const space = await notesWorld.createSpace('Removal room');
      const noteId = await notesWorld.createNote(noteTab, {
        spaceId: space.id,
        title: `${MEETING_NOTES_E2E_PREFIX} Removal ${tag}`,
        meetingDate: new Date(),
        content: '<p>Before removal</p>',
      });
      await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript: `Ana: Removal plans ${tag}.` });
      const draftText = `Company A draft ${tag}`;
      // No pause: the route finishes and returns the draft.
      await fakeAi.script(
        'openai',
        successOutcome({
          summary: { keyPoints: [draftText], decisions: [], nextSteps: [] },
          actionItems: [{ description: `Company A item ${tag}`, assigneeName: null }],
        }),
      );

      // The real route response is fetched, then held until the test releases it.
      const held: { response: { status: number; body: string } | null } = { response: null };
      const released = new Promise<void>((resolve) => {
        releaseHeld = resolve;
      });
      await noteTab.route(
        (url) => url.pathname === `/api/meeting-notes/${noteId}/ai/process`,
        async (route) => {
          const response = await route.fetch({ timeout: 120_000 });
          held.response = { status: response.status(), body: await response.text() };
          await released;
          // The page may have aborted the request meanwhile (it then gets nothing).
          await route.fulfill({ response }).catch(() => undefined);
        },
      );

      await openNote(noteTab, noteId);
      await monitor.expectActive(noteTab);
      await openAiNotice(noteTab);
      await noteTab.getByTestId('meeting-note-ai-process').click();
      await expect(noteTab.getByTestId('meeting-note-ai-progress')).toBeVisible();

      // The server finished successfully: a 200 with the draft is in transit.
      await expect
        .poll(() => held.response?.status ?? null, { timeout: 90_000, message: 'the route answered' })
        .toBe(200);
      const answered = JSON.parse(held.response?.body ?? '{}') as { status?: string; draft?: unknown };
      expect(answered.status).toBe('succeeded');
      expect(JSON.stringify(answered.draft)).toContain(draftText);

      // An admin removes the member; the membership event cannot reach this browser yet.
      realtime.hold();
      await notesWorld.removeFromCompany(member.userId);
      const accessCheck = noteTab.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/meeting-notes/${noteId}`,
        { timeout: 30_000 },
      );
      releaseHeld();

      // The browser re-checks access before showing the draft, and drops it.
      expect((await accessCheck).status()).toBe(404);
      await expect(noteTab.getByTestId('meeting-note-ai-progress')).toHaveCount(0, { timeout: 30_000 });
      await noteTab.waitForTimeout(2_000);
      expect(monitor.wasSeen(noteTab), 'a removed member may not see the draft').toBe(false);
      await expect(noteTab.getByText(draftText)).toHaveCount(0);

      // Membership reconciliation then runs as usual; still no draft.
      realtime.release();
      await noteTab.waitForTimeout(3_000);
      await monitor.expectActive(noteTab);
      expect(monitor.wasSeen(noteTab), 'a removed member may not see the draft').toBe(false);

      // Nothing was applied, and the member no longer reads the note.
      const stored = await notesWorld.readNote(primaryPage, noteId);
      expect(stored.note?.summary).toBeNull();
      expect(stored.note?.actionItems).toEqual([]);
      expect((await notesWorld.readNote(noteTab, noteId)).status).toBe(404);
      verifyTraffic();
    } finally {
      releaseHeld();
      realtime.release();
      await context.close();
      await fakeAi.reset();
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
