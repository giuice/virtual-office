// src/lib/messaging/desktop-notifications.ts
// Phase 4 FR-023 / BR-010: desktop notifications for new messages from others
// in direct and group conversations. Page-level Notifications API only (no
// service worker): a notification can be shown while a tab of the app is open.

import { ConversationType, MessageType, type Conversation, type Message } from '@/types/messaging';

/**
 * What the drawer control shows:
 * - unsupported: the browser has no Notifications API;
 * - blocked: the browser permission is "denied";
 * - enabled: the user turned them on here and the permission is "granted";
 * - available: anything else (never asked, dismissed, or turned off in-app).
 */
export type DesktopNotificationStatus = 'unsupported' | 'blocked' | 'enabled' | 'available';

const PREFERENCE_KEY_PREFIX = 'vo:messaging:desktop-notifications:';
const PREFERENCE_ON = 'on';
const PREFERENCE_OFF = 'off';
/** In-tab signal that the preference changed (`storage` only fires in other tabs). */
const PREFERENCE_EVENT = 'vo:messaging:desktop-notifications-change';

const NOTIFIED_STORAGE_KEY = 'vo:messaging:notified-messages';
const NOTIFIED_LOCK_NAME = 'vo:messaging:notification-claim';
/** How long a claimed message id is remembered across tabs. */
const NOTIFIED_TTL_MS = 10 * 60_000;
const MAX_TAB_CLAIMS = 500;
const PREVIEW_MAX_LENGTH = 120;

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

function readPermission(): NotificationPermission | null {
  if (!notificationsSupported()) return null;
  try {
    return window.Notification.permission;
  } catch {
    return null;
  }
}

const preferenceKey = (userId: string) => `${PREFERENCE_KEY_PREFIX}${userId}`;

/** The user's in-app opt-in on this browser. Absent (never chosen) means off. */
function readPreference(userId: string): boolean {
  try {
    return window.localStorage.getItem(preferenceKey(userId)) === PREFERENCE_ON;
  } catch {
    return false;
  }
}

export function writeDesktopNotificationPreference(userId: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(preferenceKey(userId), enabled ? PREFERENCE_ON : PREFERENCE_OFF);
  } catch {
    // Storage unavailable: the choice cannot be kept; nothing else depends on it.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

/**
 * Opt-in rule: notifications are on only when the user enabled them in the
 * drawer on this browser AND the browser permission is "granted". A granted
 * permission alone (e.g. given to another account or before turning them off
 * in-app) does not enable them; a denied/revoked permission disables them.
 */
export function readDesktopNotificationStatus(userId: string | null | undefined): DesktopNotificationStatus {
  const permission = readPermission();
  if (permission === null) return 'unsupported';
  if (permission === 'denied') return 'blocked';
  if (permission === 'granted' && userId && readPreference(userId)) return 'enabled';
  return 'available';
}

/**
 * Asks the browser for permission. Call only from a user action (the drawer
 * control); never on load. Resolves to the permission after the request.
 */
export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | null> {
  if (!notificationsSupported()) return null;
  const current = readPermission();
  if (current !== 'default') return current;
  try {
    return await window.Notification.requestPermission();
  } catch {
    return readPermission();
  }
}

/** Calls `listener` whenever the status may have changed (preference or permission). */
export function subscribeDesktopNotificationStatus(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFERENCE_KEY_PREFIX)) listener();
  };
  window.addEventListener(PREFERENCE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  // A permission changed in the browser's site settings is picked up when the
  // user comes back to the tab, and live where the Permissions API reports it.
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', listener);
  let permissionStatus: PermissionStatus | null = null;
  let unsubscribed = false;
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((status) => {
      if (unsubscribed) return;
      permissionStatus = status;
      status.addEventListener('change', listener);
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    window.removeEventListener(PREFERENCE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', listener);
    permissionStatus?.removeEventListener('change', listener);
  };
}

export type IncomingMessageDecision = 'notify' | 'viewing' | 'skip';

/**
 * BR-010: others' messages in direct/group conversations notify when the tab
 * is hidden or the drawer is not open on that conversation. "Tab hidden" is
 * the foreground-tab definition used by read receipts (TRACK T6):
 * `document.visibilityState`, not window focus.
 */
export function decideIncomingMessage(input: {
  message: Message;
  conversation: Conversation;
  currentUserId: string;
  viewedConversationId: string | null;
  tabVisible: boolean;
}): IncomingMessageDecision {
  const { message, conversation, currentUserId, viewedConversationId, tabVisible } = input;
  // users.id comparison (the realtime row's sender_id is the application id).
  if (message.senderId === currentUserId) return 'skip';
  if (message.type === MessageType.SYSTEM) return 'skip';
  if (conversation.type !== ConversationType.DIRECT && conversation.type !== ConversationType.GROUP) {
    return 'skip';
  }
  if (tabVisible && viewedConversationId === conversation.id) return 'viewing';
  return 'notify';
}

const tabClaims = new Set<string>();

function rememberTabClaim(messageId: string): boolean {
  if (tabClaims.has(messageId)) return false;
  tabClaims.add(messageId);
  if (tabClaims.size > MAX_TAB_CLAIMS) {
    const oldest = tabClaims.values().next().value;
    if (oldest !== undefined) tabClaims.delete(oldest);
  }
  return true;
}

function claimAcrossTabs(messageId: string): boolean {
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(NOTIFIED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const claims: Record<string, number> = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof at === 'number' && now - at < NOTIFIED_TTL_MS) claims[id] = at;
      }
    }
    if (claims[messageId] !== undefined) return false;
    claims[messageId] = now;
    window.localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(claims));
    return true;
  } catch {
    // No shared storage: this tab alone decides.
    return true;
  }
}

/**
 * Claims a message so it is announced (or knowingly left unannounced) once:
 * once per tab, and once across this browser's tabs of the app. The
 * cross-tab check-and-set runs under a Web Lock, which makes it atomic
 * between tabs; without Web Locks it is best effort.
 */
export async function claimMessageNotification(messageId: string): Promise<boolean> {
  if (!rememberTabClaim(messageId)) return false;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    try {
      return await locks.request(NOTIFIED_LOCK_NAME, () => claimAcrossTabs(messageId));
    } catch {
      return claimAcrossTabs(messageId);
    }
  }
  return claimAcrossTabs(messageId);
}

/** Notification body: the text preview, or what kind of content was sent. */
export function notificationBody(message: Message, attachmentKind: 'voice' | 'file' | null): string {
  const text = message.content.replace(/\s+/g, ' ').trim();
  if (text) {
    return text.length > PREVIEW_MAX_LENGTH ? `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…` : text;
  }
  if (attachmentKind === 'voice') return 'Nota de voz';
  if (message.type === MessageType.IMAGE) return 'Imagem';
  return 'Anexo';
}

export function notificationTitle(conversation: Conversation, senderName: string): string {
  if (conversation.type === ConversationType.GROUP) {
    return `${senderName} em ${conversation.name?.trim() || 'grupo'}`;
  }
  return senderName;
}

/** One notification per conversation on screen: a newer one replaces it. */
export const notificationTag = (conversationId: string) => `vo-messaging-conversation-${conversationId}`;

/** Shows the notification; returns null when the browser refuses to construct it. */
export function showDesktopNotification(
  title: string,
  options: { body: string; tag: string },
  onClick: () => void,
): Notification | null {
  if (readPermission() !== 'granted') return null;
  try {
    const notification = new window.Notification(title, options);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Focusing is best effort.
      }
      onClick();
      notification.close();
    };
    return notification;
  } catch {
    // e.g. browsers that only allow notifications from a service worker.
    return null;
  }
}
