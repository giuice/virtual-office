import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useCompany } from '@/contexts/CompanyContext';
import { conversationMembersQueryKey } from '@/hooks/queries/useConversationMembers';
import { messagingApi } from '@/lib/messaging-api';
import { isVoiceNoteAttachment } from '@/lib/messaging/attachment-policy';
import { membershipRemovalCount } from '@/lib/messaging/membership-removals';
import {
  VIEW_HEARTBEAT_MS,
  claimMessageNotification,
  decideIncomingMessage,
  isConversationViewedElsewhere,
  mentionNotificationBody,
  mentionNotificationTitle,
  notificationBody,
  notificationTag,
  notificationTitle,
  publishConversationView,
  readDesktopNotificationStatus,
  requestDesktopNotificationPermission,
  showDesktopNotification,
  subscribeDesktopNotificationStatus,
  writeDesktopNotificationPreference,
  type DesktopNotificationStatus,
} from '@/lib/messaging/desktop-notifications';
import { MessageOutbox } from '@/lib/messaging/outbox/message-outbox';
import { createOutboxIdentity } from '@/lib/messaging/outbox/outbox-identity';
import { MessageType, type Conversation, type ConversationMember, type Message } from '@/types/messaging';

interface UseIncomingMessageNotificationsOptions {
  /** users.id of the signed-in user. */
  currentUserId: string | undefined;
  /** users.supabase_uid of the same users row (the browser session must be this auth user). */
  currentUserAuthUid: string | undefined;
  /** True once the conversation list has loaded from the server. */
  conversationsLoaded: boolean;
  /** Imperative reader of the cached conversation list. */
  getCachedConversations: () => Conversation[];
  /** Conversation whose feed the drawer shows right now (open, not minimized), or null. */
  viewedConversationId: string | null;
  /** Opens the drawer on a conversation (notification click). */
  onOpenConversation: (conversationId: string) => void;
}

/** A file message without text: a voice note (Phase 4 T15) or other files. */
async function resolveAttachmentKind(messageId: string): Promise<'voice' | 'file'> {
  try {
    const attachments = await messagingApi.getMessageAttachments(messageId);
    return attachments.some(isVoiceNoteAttachment) ? 'voice' : 'file';
  } catch {
    return 'file';
  }
}

/** Messages read from just before the INSERT's time to find it (a 1 ms window holds far fewer). */
const AUTHORIZATION_READ_LIMIT = 20;

/**
 * Phase 5 T18 (FR-025, BR-011): the message as the server shows it to the
 * browser's signed-in user now. The feed route checks membership under that
 * session (403 for a removed or never-member user) and carries the stored
 * mentions, which live INSERTs lack (TRACK T4). Null when refused, not found,
 * or the read failed: nothing is announced.
 */
async function readAuthorizedMessage(message: Message): Promise<Message | null> {
  const sentAt = new Date(message.timestamp).getTime();
  if (!Number.isFinite(sentAt)) return null;
  try {
    const { messages } = await messagingApi.getMessages(message.conversationId, {
      limit: AUTHORIZATION_READ_LIMIT,
      // Newer than 1 ms before the INSERT's time (ms precision; the server keeps µs).
      cursorAfter: new Date(sentAt - 1).toISOString(),
      source: 'notification',
    });
    return messages.find((candidate) => candidate.id === message.id) ?? null;
  } catch {
    return null;
  }
}

const createTabId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface LoadBaseline {
  userId: string;
  /** Server activity time (ms) of each conversation in the first loaded list. */
  lastActivityByConversation: Map<string, number>;
}

function captureLoadBaseline(userId: string, conversations: Conversation[]): LoadBaseline {
  const lastActivityByConversation = new Map<string, number>();
  for (const conversation of conversations) {
    const at = new Date(conversation.lastActivity).getTime();
    if (Number.isFinite(at)) lastActivityByConversation.set(conversation.id, at);
  }
  return { userId, lastActivityByConversation };
}

/**
 * Returns the handler MessagingContext calls for each live message INSERT from
 * someone else, once its conversation is known. Only live Realtime events
 * reach it — never the catch-up/refetch/polling paths. Realtime can still
 * deliver, as a live event, a message committed shortly before this page
 * subscribed (it matches changes when it reads them from the WAL, which can
 * lag behind the commit), so a message already covered by the first
 * conversation list this page loaded is not announced either: messages that
 * already existed are never announced (TRACK T31).
 *
 * Phase 5 T18 (FR-025, BR-011): a direct/group message, or a room message
 * that mentions the user, is authorized by the server under the browser's
 * session (member; for rooms, mentioned), only then claimed once per browser
 * (Phase 4 claim; block C fix F4), the session confirmed to be this user's
 * under the claim's lock. Then, with no await before display, it is dropped if the signed-in
 * user changed, a "Sair mesmo" stop began, a removal from the conversation
 * was received (its list-stream event since the message arrived, F1; it left
 * the cached list, or its roster read 403), notifications were turned
 * off, or any visible tab of the user in this browser shows the
 * conversation. A message that mentions the user is announced as a mention
 * — never also as an ordinary message.
 */
export function useIncomingMessageNotifications({
  currentUserId,
  currentUserAuthUid,
  conversationsLoaded,
  getCachedConversations,
  viewedConversationId,
  onOpenConversation,
}: UseIncomingMessageNotificationsOptions) {
  const { companyUsers } = useCompany();
  const queryClient = useQueryClient();
  const [tabId] = useState(createTabId);
  const currentUserIdRef = useRef(currentUserId);
  const viewedConversationIdRef = useRef(viewedConversationId);
  const companyUsersRef = useRef(companyUsers);
  const onOpenConversationRef = useRef(onOpenConversation);
  const loadBaselineRef = useRef<LoadBaseline | null>(null);
  const identity = useMemo(
    () => (currentUserAuthUid ? createOutboxIdentity(currentUserAuthUid) : null),
    [currentUserAuthUid]
  );

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    viewedConversationIdRef.current = viewedConversationId;
    companyUsersRef.current = companyUsers;
    onOpenConversationRef.current = onOpenConversation;
  }, [currentUserId, viewedConversationId, companyUsers, onOpenConversation]);

  // T18: what this tab shows while visible, for the user's other tabs.
  useEffect(() => {
    if (!currentUserId) return;
    const publish = () =>
      publishConversationView(
        currentUserId,
        tabId,
        document.visibilityState === 'visible' ? viewedConversationId : null
      );
    const withdraw = () => publishConversationView(currentUserId, tabId, null);
    publish();
    const heartbeat = viewedConversationId ? window.setInterval(publish, VIEW_HEARTBEAT_MS) : null;
    document.addEventListener('visibilitychange', publish);
    window.addEventListener('pageshow', publish);
    window.addEventListener('pagehide', withdraw);
    return () => {
      if (heartbeat !== null) window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', publish);
      window.removeEventListener('pageshow', publish);
      window.removeEventListener('pagehide', withdraw);
      withdraw();
    };
  }, [currentUserId, tabId, viewedConversationId]);

  // The state at load: the first list this page received for this user.
  const readLoadBaseline = useCallback((): LoadBaseline | null => {
    if (!currentUserId) return null;
    if (loadBaselineRef.current?.userId !== currentUserId) {
      const conversations = getCachedConversations();
      loadBaselineRef.current = conversations.length > 0 || conversationsLoaded
        ? captureLoadBaseline(currentUserId, conversations)
        : null;
    }
    return loadBaselineRef.current;
  }, [conversationsLoaded, currentUserId, getCachedConversations]);

  useEffect(() => {
    if (conversationsLoaded) readLoadBaseline();
  }, [conversationsLoaded, readLoadBaseline]);

  return useCallback(async (message: Message, conversation: Conversation) => {
    const userId = currentUserId;
    // Disabled, denied, or unsupported: nothing is attempted (AC-028).
    if (!userId || !identity || readDesktopNotificationStatus(userId) !== 'enabled') return;

    // Already in the conversation's activity when this page loaded: it existed
    // before, even if Realtime delivers it late. Both times are server times.
    const loadedActivity = readLoadBaseline()?.lastActivityByConversation.get(conversation.id);
    const sentAt = new Date(message.timestamp).getTime();
    if (loadedActivity !== undefined && Number.isFinite(sentAt) && sentAt <= loadedActivity) return;

    // Block C fix F1: a removal from the conversation received from here on drops it.
    const removalsBefore = membershipRemovalCount(userId, conversation.id);
    const decision = decideIncomingMessage({
      message,
      conversation,
      currentUserId: userId,
      viewedConversationId: viewedConversationIdRef.current,
      tabVisible: document.visibilityState === 'visible',
    });
    if (decision === 'skip') return;
    // A message being viewed is claimed too, so another tab of this browser
    // does not announce what the user is already reading.
    if (decision === 'viewing') {
      await claimMessageNotification(message.id);
      return;
    }

    // T18: a "Sair mesmo" in progress drops it now; one that starts later, at display.
    const signOutBefore = MessageOutbox.signOutStopState(userId);
    if (signOutBefore.active) return;

    const [authorized, attachmentKind] = await Promise.all([
      readAuthorizedMessage(message),
      !message.content.trim() && message.type === MessageType.FILE
        ? resolveAttachmentKind(message.id)
        : Promise.resolve(null),
    ]);
    if (!authorized) return;
    const userKey = userId.toLowerCase();
    const mentioned = (authorized.mentionedUserIds ?? []).some((id) => id.toLowerCase() === userKey);
    if (decision === 'mention-only' && !mentioned) return;
    // Block C fix F4: claimed once per browser only after this tab's
    // authorization succeeded, so a tab whose read failed leaves the message
    // to another tab of the browser. The read ran under whatever session the
    // browser holds: it counts only if that session is still this user's (an
    // account switch needs no auth event). That check runs under the claim's
    // cross-tab lock, after any wait for it and before the claim is stored
    // (final review #1, r2 #1): a failed check leaves the message to another
    // tab, and no await remains between it and display.
    const confirmOwner = async () => (await identity.check()) === 'owner';
    if (!(await claimMessageNotification(message.id, confirmOwner))) return;

    // Final check: no await from here to display (residual race D6).
    if (currentUserIdRef.current !== userId) return;
    const signOutNow = MessageOutbox.signOutStopState(userId);
    if (signOutNow.active || signOutNow.stops !== signOutBefore.stops) return;
    if (membershipRemovalCount(userId, conversation.id) !== removalsBefore) return;
    const stillListed = getCachedConversations().some((listed) => listed.id === conversation.id);
    const roster = queryClient.getQueryData<ConversationMember[] | null>(
      conversationMembersQueryKey(userId, conversation.id)
    );
    if (!stillListed || roster === null) return;
    if (readDesktopNotificationStatus(userId) !== 'enabled') return;
    if (document.visibilityState === 'visible' && viewedConversationIdRef.current === conversation.id) return;
    if (isConversationViewedElsewhere(userId, tabId, conversation.id)) return;

    const senderName = companyUsersRef.current.find((user) => user.id === authorized.senderId)?.displayName?.trim();
    const title = mentioned
      ? mentionNotificationTitle(conversation, senderName || 'Alguém')
      : notificationTitle(conversation, senderName || 'Nova mensagem');
    const body = mentioned
      ? mentionNotificationBody(authorized, attachmentKind)
      : notificationBody(authorized, attachmentKind);
    showDesktopNotification(
      title,
      { body, tag: notificationTag(conversation.id) },
      () => onOpenConversationRef.current(conversation.id),
    );
  }, [currentUserId, getCachedConversations, identity, queryClient, readLoadBaseline, tabId]);
}

const serverStatus = (): DesktopNotificationStatus => 'unsupported';

/** State and actions of the drawer's desktop-notification control. */
export function useDesktopNotificationSetting(currentUserId: string | undefined) {
  const getStatus = useCallback(() => readDesktopNotificationStatus(currentUserId), [currentUserId]);
  const status = useSyncExternalStore(subscribeDesktopNotificationStatus, getStatus, serverStatus);

  /** User action only: asks for permission when needed, then turns them on. */
  const enable = useCallback(async (): Promise<DesktopNotificationStatus> => {
    if (!currentUserId) return readDesktopNotificationStatus(currentUserId);
    const permission = await requestDesktopNotificationPermission();
    // Also written when refused, so the control re-reads the new permission.
    writeDesktopNotificationPreference(currentUserId, permission === 'granted');
    return readDesktopNotificationStatus(currentUserId);
  }, [currentUserId]);

  const disable = useCallback(() => {
    if (currentUserId) writeDesktopNotificationPreference(currentUserId, false);
  }, [currentUserId]);

  return { status, enable, disable };
}
