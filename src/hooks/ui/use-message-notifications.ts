import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useCompany } from '@/contexts/CompanyContext';
import { messagingApi } from '@/lib/messaging-api';
import { isVoiceNoteAttachment } from '@/lib/messaging/attachment-policy';
import {
  claimMessageNotification,
  decideIncomingMessage,
  notificationBody,
  notificationTag,
  notificationTitle,
  readDesktopNotificationStatus,
  requestDesktopNotificationPermission,
  showDesktopNotification,
  subscribeDesktopNotificationStatus,
  writeDesktopNotificationPreference,
  type DesktopNotificationStatus,
} from '@/lib/messaging/desktop-notifications';
import { MessageType, type Conversation, type Message } from '@/types/messaging';

interface UseIncomingMessageNotificationsOptions {
  /** users.id of the signed-in user. */
  currentUserId: string | undefined;
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
 * reach it — never the catch-up/refetch paths. Realtime can still deliver, as
 * a live event, a message committed shortly before this page subscribed (it
 * matches changes when it reads them from the WAL, which can lag behind the
 * commit), so a message already covered by the first conversation list this
 * page loaded is not announced either: messages that already existed are
 * never announced (TRACK T31).
 */
export function useIncomingMessageNotifications({
  currentUserId,
  conversationsLoaded,
  getCachedConversations,
  viewedConversationId,
  onOpenConversation,
}: UseIncomingMessageNotificationsOptions) {
  const { companyUsers } = useCompany();
  const viewedConversationIdRef = useRef(viewedConversationId);
  const companyUsersRef = useRef(companyUsers);
  const onOpenConversationRef = useRef(onOpenConversation);
  const loadBaselineRef = useRef<LoadBaseline | null>(null);

  useEffect(() => {
    viewedConversationIdRef.current = viewedConversationId;
    companyUsersRef.current = companyUsers;
    onOpenConversationRef.current = onOpenConversation;
  }, [viewedConversationId, companyUsers, onOpenConversation]);

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
    // Disabled, denied, or unsupported: nothing is attempted (AC-028).
    if (!currentUserId || readDesktopNotificationStatus(currentUserId) !== 'enabled') return;

    // Already in the conversation's activity when this page loaded: it existed
    // before, even if Realtime delivers it late. Both times are server times.
    const loadedActivity = readLoadBaseline()?.lastActivityByConversation.get(conversation.id);
    const sentAt = new Date(message.timestamp).getTime();
    if (loadedActivity !== undefined && Number.isFinite(sentAt) && sentAt <= loadedActivity) return;

    const decision = decideIncomingMessage({
      message,
      conversation,
      currentUserId,
      viewedConversationId: viewedConversationIdRef.current,
      tabVisible: document.visibilityState === 'visible',
    });
    if (decision === 'skip') return;
    // A message being viewed is claimed too, so another tab of this browser
    // does not announce what the user is already reading.
    if (!(await claimMessageNotification(message.id)) || decision === 'viewing') return;

    const attachmentKind = !message.content.trim() && message.type === MessageType.FILE
      ? await resolveAttachmentKind(message.id)
      : null;
    if (readDesktopNotificationStatus(currentUserId) !== 'enabled') return;

    const senderName = companyUsersRef.current.find((user) => user.id === message.senderId)?.displayName?.trim()
      || 'Nova mensagem';
    showDesktopNotification(
      notificationTitle(conversation, senderName),
      { body: notificationBody(message, attachmentKind), tag: notificationTag(conversation.id) },
      () => onOpenConversationRef.current(conversation.id),
    );
  }, [currentUserId, readLoadBaseline]);
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
