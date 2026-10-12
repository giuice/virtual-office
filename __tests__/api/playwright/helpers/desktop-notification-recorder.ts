// Desktop-notification observation shared by the Phase 4 notification spec
// (messaging-desktop-notifications.spec.ts) and the Phase 5 mention
// notification spec (messaging-phase5/mention-notifications.spec.ts). The
// page's Notification constructor is wrapped by an init script that records
// every construction (title, body, tag) and every permission request, while
// permission and requestPermission keep the browser's real behavior (granted
// through Playwright, or the browser's own denial when nothing is granted).
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const NOTIFICATION_RECV_TIMEOUT_MS = 15_000;
/** Long enough for a notification the page was going to show to be constructed. */
export const NOTIFICATION_QUIET_WINDOW_MS = 2_500;

export interface RecordedNotification {
  title: string;
  body: string;
  tag: string;
}

export interface NotificationRecord {
  constructed: RecordedNotification[];
  permissionRequests: number;
}

/** Init script: records Notification constructions and permission requests. */
export function installNotificationRecorder(): void {
  const target = window as unknown as {
    __notificationRecord: NotificationRecord;
    __notificationInstances: Notification[];
  };
  target.__notificationRecord = { constructed: [], permissionRequests: 0 };
  target.__notificationInstances = [];
  const RealNotification = window.Notification;
  if (typeof RealNotification !== 'function') return;
  class RecordingNotification extends RealNotification {
    constructor(title: string, options?: NotificationOptions) {
      // Recorded before construction, so an attempt that throws still counts.
      target.__notificationRecord.constructed.push({
        title,
        body: options?.body ?? '',
        tag: options?.tag ?? '',
      });
      super(title, options);
      target.__notificationInstances.push(this);
    }

    static requestPermission(callback?: NotificationPermissionCallback): Promise<NotificationPermission> {
      target.__notificationRecord.permissionRequests += 1;
      return RealNotification.requestPermission(callback);
    }
  }
  Object.defineProperty(window, 'Notification', {
    value: RecordingNotification,
    writable: true,
    configurable: true,
  });
}

/** Page init script: the tab is in the background from its first script on. */
export function startHidden(): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
}

export async function notificationRecord(page: Page): Promise<NotificationRecord> {
  return page.evaluate(
    () => (window as unknown as { __notificationRecord: NotificationRecord }).__notificationRecord,
  );
}

export async function notificationsOf(page: Page): Promise<RecordedNotification[]> {
  return (await notificationRecord(page)).constructed;
}

/** Waits for the page's notification count to reach `count`, then returns them. */
export async function expectNotificationCount(page: Page, count: number): Promise<RecordedNotification[]> {
  await expect
    .poll(async () => (await notificationsOf(page)).length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS })
    .toBe(count);
  return notificationsOf(page);
}

/** After a quiet window, the page still has exactly `count` notifications. */
export async function expectNoNewNotification(page: Page, count: number, reason: string): Promise<void> {
  await page.waitForTimeout(NOTIFICATION_QUIET_WINDOW_MS);
  expect((await notificationsOf(page)).length, reason).toBe(count);
}

/** Clicks the newest recorded notification with `tag`, as the OS would on a click. */
export async function clickNotification(page: Page, tag: string): Promise<void> {
  const clicked = await page.evaluate((wanted) => {
    const instances = (window as unknown as { __notificationInstances: Notification[] }).__notificationInstances;
    const notification = instances.filter((candidate) => candidate.tag === wanted).at(-1);
    if (!notification) return false;
    notification.dispatchEvent(new Event('click'));
    return true;
  }, tag);
  expect(clicked, `a notification tagged ${tag}`).toBe(true);
}

/** Grants the notification permission to the app's origin in this browser context. */
export async function grantNotifications(context: BrowserContext, origin: string): Promise<void> {
  await context.grantPermissions(['notifications'], { origin });
}

export const notificationTagOf = (conversationId: string) => `vo-messaging-conversation-${conversationId}`;
export const notificationsToggle = (page: Page) => page.getByTestId('messaging-notifications-toggle');
