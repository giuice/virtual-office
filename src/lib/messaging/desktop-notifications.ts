// src/lib/messaging/desktop-notifications.ts
// Phase 4 FR-023 / BR-010: desktop notifications for new messages from others
// in direct and group conversations; Phase 5 FR-025 / BR-011 adds mentions
// (rooms included) and browser-wide suppression. Page-level Notifications API
// only (no service worker): a notification can be shown while a tab of the
// app is open.

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

/**
 * - notify: a direct/group message from someone else (every new one);
 * - mention-only: a room message that may mention the user — announced only
 *   if the server lists the user among its mentions (Phase 5 FR-025);
 * - viewing: this tab shows that conversation right now;
 * - skip: never announced.
 */
export type IncomingMessageDecision = 'notify' | 'mention-only' | 'viewing' | 'skip';

/**
 * A mention is written "@<name>" by the composer (Phase 5 T17), so a room
 * message without "@" mentions nobody and needs no server read. Live INSERTs
 * carry no mentions (TRACK T4); the server's list decides for the others.
 */
const mayMention = (message: Message): boolean => message.content.includes('@');

/**
 * Phase 4 BR-010 / Phase 5 BR-011: others' messages in direct/group
 * conversations, and room messages that mention the user, notify when the
 * tab is hidden or the drawer is not open on that conversation. "Tab hidden"
 * is the foreground-tab definition used by read receipts (TRACK T6):
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
  const directOrGroup = conversation.type === ConversationType.DIRECT || conversation.type === ConversationType.GROUP;
  if (!directOrGroup && !(conversation.type === ConversationType.ROOM && mayMention(message))) return 'skip';
  if (tabVisible && viewedConversationId === conversation.id) return 'viewing';
  return directOrGroup ? 'notify' : 'mention-only';
}

/**
 * Phase 5 FR-025 (browser-wide suppression): each tab of the user records in
 * localStorage, under its own key, the conversation it shows while it is
 * visible; a tab about to announce a message first reads every other tab's
 * record, synchronously. So no tab announces a conversation another visible
 * tab of the same user is viewing, whichever tab received the message first.
 * A visible tab refreshes its record (VIEW_HEARTBEAT_MS); a record older than
 * VIEW_TTL_MS (a tab that crashed or froze without hiding) no longer counts.
 */
const VIEW_KEY_PREFIX = 'vo:messaging:notification-view:';
export const VIEW_HEARTBEAT_MS = 10_000;
const VIEW_TTL_MS = 30_000;

const viewKeyPrefix = (userId: string) => `${VIEW_KEY_PREFIX}${userId}:`;

interface ConversationViewRecord {
  conversationId: string;
  at: number;
}

function parseViewRecord(raw: string | null): ConversationViewRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { conversationId, at } = parsed as Record<string, unknown>;
    return typeof conversationId === 'string' && typeof at === 'number' ? { conversationId, at } : null;
  } catch {
    return null;
  }
}

/** Records (or, with null, removes) the conversation this visible tab shows. */
export function publishConversationView(userId: string, tabId: string, conversationId: string | null): void {
  try {
    const key = `${viewKeyPrefix(userId)}${tabId}`;
    if (conversationId) {
      window.localStorage.setItem(key, JSON.stringify({ conversationId, at: Date.now() }));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: other tabs cannot see this one (best effort).
  }
}

/** Whether another visible tab of the user shows `conversationId` now. Removes expired records. */
export function isConversationViewedElsewhere(userId: string, tabId: string, conversationId: string): boolean {
  try {
    const prefix = viewKeyPrefix(userId);
    const own = `${prefix}${tabId}`;
    const now = Date.now();
    const expired: string[] = [];
    let viewed = false;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix) || key === own) continue;
      const record = parseViewRecord(window.localStorage.getItem(key));
      if (!record || now - record.at >= VIEW_TTL_MS) {
        expired.push(key);
      } else if (record.conversationId === conversationId) {
        viewed = true;
      }
    }
    expired.forEach((key) => window.localStorage.removeItem(key));
    return viewed;
  } catch {
    return false;
  }
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

/** Live cross-tab claims (expired ones dropped), or null without shared storage. */
function readCrossTabClaims(now: number): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(NOTIFIED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const claims: Record<string, number> = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof at === 'number' && now - at < NOTIFIED_TTL_MS) claims[id] = at;
      }
    }
    return claims;
  } catch {
    return null;
  }
}

function claimAcrossTabs(messageId: string): boolean {
  const now = Date.now();
  const claims = readCrossTabClaims(now);
  // No shared storage: this tab alone decides.
  if (!claims) return true;
  if (claims[messageId] !== undefined) return false;
  claims[messageId] = now;
  try {
    window.localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(claims));
  } catch {
    // Storage became unavailable: this tab alone decides.
  }
  return true;
}

/**
 * Not yet claimed by another tab, `confirm` (if any) still holds, then
 * claimed. A `confirm` that fails leaves the message unclaimed for the
 * browser's other tabs (final review r2 #1).
 */
async function confirmAndClaim(messageId: string, confirm?: () => Promise<boolean>): Promise<boolean> {
  const claims = readCrossTabClaims(Date.now());
  if (claims && claims[messageId] !== undefined) return false;
  if (confirm && !(await confirm())) return false;
  return claimAcrossTabs(messageId);
}

/**
 * Claims a message so it is announced (or knowingly left unannounced) once:
 * once per tab, and once across this browser's tabs of the app. The
 * cross-tab check, `confirm` and set run under one Web Lock, which makes them
 * atomic between tabs; without Web Locks it is best effort.
 */
export async function claimMessageNotification(
  messageId: string,
  confirm?: () => Promise<boolean>
): Promise<boolean> {
  if (!rememberTabClaim(messageId)) return false;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    try {
      return await locks.request(NOTIFIED_LOCK_NAME, () => confirmAndClaim(messageId, confirm));
    } catch {
      return confirmAndClaim(messageId, confirm);
    }
  }
  return confirmAndClaim(messageId, confirm);
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

function mentionPlace(conversation: Conversation): string {
  const name = conversation.name?.trim();
  if (conversation.type === ConversationType.ROOM) return name || 'uma sala';
  if (conversation.type === ConversationType.GROUP) return name || 'um grupo';
  return 'uma conversa direta';
}

/** Phase 5 FR-025: "<Autor> mencionou você em <conversa>". */
export function mentionNotificationTitle(conversation: Conversation, senderName: string): string {
  return `${senderName} mencionou você em ${mentionPlace(conversation)}`;
}

/** Phase 5 FR-025: a mention shows the message's full text (no preview cut). */
export function mentionNotificationBody(message: Message, attachmentKind: 'voice' | 'file' | null): string {
  return message.content.trim() || notificationBody(message, attachmentKind);
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
