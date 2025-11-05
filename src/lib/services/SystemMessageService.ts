// src/lib/services/SystemMessageService.ts
import { messagingApi } from '@/lib/messaging-api';
import { MessageStatus, MessageType } from '@/types/messaging';

/**
 * Service for creating and managing system messages for space events
 * Implements Phase 2 of the realtime message integration plan
 */
export class SystemMessageService {
  
  /**
   * Create a system message when a user joins a space
   */
  static async createSpaceJoinMessage(
    spaceId: string, 
    userId: string, 
    userDisplayName: string
  ): Promise<void> {
    try {
      // Get or create room conversation for this space
      const conversation = await messagingApi.getOrCreateRoomConversation(
        spaceId, 
        `Space ${spaceId}`, 
        [userId] // Initial participant
      );

      // Create system message
      await messagingApi.sendMessage({
        conversationId: conversation.id,
        senderId: userId, // System messages still need a sender ID
        content: `${userDisplayName} joined the space`,
        type: MessageType.SYSTEM,
        status: MessageStatus.SENT
      });

      console.log(`[SystemMessageService] Created space join message for user ${userDisplayName} in space ${spaceId}`);
    } catch (error) {
      console.error(`[SystemMessageService] Failed to create space join message:`, error);
      // Don't throw - system messages should fail silently to avoid disrupting user experience
    }
  }

  /**
   * Create a system message when a user leaves a space
   */
  static async createSpaceLeaveMessage(
    spaceId: string, 
    userId: string, 
    userDisplayName: string
  ): Promise<void> {
    try {
      // Get existing room conversation for this space
      const conversation = await messagingApi.getOrCreateRoomConversation(
        spaceId, 
        `Space ${spaceId}`, 
        [userId]
      );

      // Create system message
      await messagingApi.sendMessage({
        conversationId: conversation.id,
        senderId: userId,
        content: `${userDisplayName} left the space`,
        type: MessageType.SYSTEM,
        status: MessageStatus.SENT
      });

      console.log(`[SystemMessageService] Created space leave message for user ${userDisplayName} in space ${spaceId}`);
    } catch (error) {
      console.error(`[SystemMessageService] Failed to create space leave message:`, error);
    }
  }

  /**
   * Create a system message when space status changes
   */
  static async createSpaceStatusMessage(
    spaceId: string, 
    status: string, 
    spaceName?: string
  ): Promise<void> {
    try {
      // Get system user ID (could be a special system user)
      const systemUserId = 'system'; // This might need to be a real user ID or handled differently

      // Get room conversation for this space
      const conversation = await messagingApi.getOrCreateRoomConversation(
        spaceId, 
        spaceName || `Space ${spaceId}`, 
        [systemUserId]
      );

      // Create appropriate message based on status
      let message = '';
      switch (status.toLowerCase()) {
        case 'in_use':
        case 'occupied':
          message = 'Meeting started';
          break;
        case 'available':
          message = 'Meeting ended';
          break;
        case 'maintenance':
          message = 'Space is under maintenance';
          break;
        default:
          message = `Space status changed to: ${status}`;
      }

      // Create system message
      await messagingApi.sendMessage({
        conversationId: conversation.id,
        senderId: systemUserId,
        content: message,
        type: MessageType.SYSTEM,
        status: MessageStatus.SENT
      });

      console.log(`[SystemMessageService] Created space status message for space ${spaceId}: ${message}`);
    } catch (error) {
      console.error(`[SystemMessageService] Failed to create space status message:`, error);
    }
  }

  /**
   * Create a system message for meeting events
   */
  static async createMeetingMessage(
    spaceId: string,
    eventType: 'start' | 'end',
    meetingTitle?: string
  ): Promise<void> {
    try {
      const systemUserId = 'system';

      const conversation = await messagingApi.getOrCreateRoomConversation(
        spaceId,
        `Space ${spaceId}`,
        [systemUserId]
      );

      const meetingName = meetingTitle || 'Meeting';
      const message = eventType === 'start' 
        ? `${meetingName} has started`
        : `${meetingName} has ended`;

      await messagingApi.sendMessage({
        conversationId: conversation.id,
        senderId: systemUserId,
        content: message,
        type: MessageType.SYSTEM,
        status: MessageStatus.SENT
      });

      console.log(`[SystemMessageService] Created meeting ${eventType} message for space ${spaceId}`);
    } catch (error) {
      console.error(`[SystemMessageService] Failed to create meeting ${eventType} message:`, error);
    }
  }

  /**
   * Create a system message for general announcements
   */
  static async createAnnouncementMessage(
    spaceId: string,
    announcement: string
  ): Promise<void> {
    try {
      const systemUserId = 'system';

      const conversation = await messagingApi.getOrCreateRoomConversation(
        spaceId,
        `Space ${spaceId}`,
        [systemUserId]
      );

      await messagingApi.sendMessage({
        conversationId: conversation.id,
        senderId: systemUserId,
        content: `📢 ${announcement}`,
        type: MessageType.SYSTEM,
        status: MessageStatus.SENT
      });

      console.log(`[SystemMessageService] Created announcement message for space ${spaceId}`);
    } catch (error) {
      console.error(`[SystemMessageService] Failed to create announcement message:`, error);
    }
  }
}