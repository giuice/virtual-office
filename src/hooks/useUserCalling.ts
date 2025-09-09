// src/hooks/useUserCalling.ts
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { usePresence } from '@/contexts/PresenceContext';
import { MessageType } from '@/types/messaging';
import { useCompany } from '@/contexts/CompanyContext';

interface CallInvitation {
  id: string;
  callerId: string;
  callerName: string;
  targetUserId: string;
  spaceId?: string;
  spaceName?: string;
  type: 'voice' | 'video' | 'teleport';
  timestamp: Date;
  status: 'pending' | 'accepted' | 'declined' | 'timeout';
}

interface UseUserCallingReturn {
  // State
  incomingCalls: CallInvitation[];
  outgoingCalls: CallInvitation[];
  isCallInProgress: boolean;
  
  // Actions
  sendCallInvitation: (targetUserId: string, type: 'voice' | 'video') => Promise<void>;
  sendTeleportInvitation: (targetUserId: string, spaceId: string) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: (callId: string) => Promise<void>;
  endCall: (callId: string) => Promise<void>;
  
  // Utils
  getActiveCall: () => CallInvitation | null;
  clearCall: (callId: string) => void;
}

/**
 * Hook for managing user-to-user calling and teleportation invitations
 * 
 * Features:
 * - Send voice/video call invitations
 * - Send teleportation invitations (teleport user to your space)
 * - Handle incoming call/teleport requests
 * - Automatic timeout handling
 * - System message generation for call events
 */
export function useUserCalling(): UseUserCallingReturn {
  const { user } = useAuth();
  const { getOrCreateUserConversation, sendMessage } = useMessaging();
  const { updateLocation } = usePresence();
  const { currentUserProfile } = useCompany();
  
  // State for managing calls
  const [incomingCalls, setIncomingCalls] = useState<CallInvitation[]>([]);
  const [outgoingCalls, setOutgoingCalls] = useState<CallInvitation[]>([]);
  const [isCallInProgress, setIsCallInProgress] = useState(false);

  // Generate unique call ID
  const generateCallId = useCallback(() => {
    return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  // Resolve a human-friendly display name for the current user
  const getDisplayName = useCallback((): string => {
    if (currentUserProfile?.displayName) return currentUserProfile.displayName;
    const meta = (user?.user_metadata || {}) as Record<string, any>;
    const fromMeta = meta.displayName || meta.full_name || meta.name;
    if (fromMeta) return String(fromMeta);
    if (user?.email) return user.email.split('@')[0];
    return 'Unknown';
  }, [currentUserProfile, user]);

  /**
   * Send a voice or video call invitation to another user
   */
  const sendCallInvitation = useCallback(async (targetUserId: string, type: 'voice' | 'video') => {
    if (!user) return;

    try {
      const callId = generateCallId();
      const invitation: CallInvitation = {
        id: callId,
        callerId: user.id,
        callerName: getDisplayName(),
        targetUserId,
        type,
        timestamp: new Date(),
        status: 'pending'
      };

      // Add to outgoing calls
      setOutgoingCalls(prev => [...prev, invitation]);

      // Get or create conversation with target user
      const conversation = await getOrCreateUserConversation(targetUserId);
      
      if (conversation) {
        // Send system message about the call invitation
        const callTypeText = type === 'voice' ? 'voice call' : 'video call';
        await sendMessage(
          `📞 ${getDisplayName()} is calling you (${callTypeText})`,
          {
            type: MessageType.SYSTEM,
            // We'll extend this later to include call invitation metadata
          }
        );
      }

      // Set timeout for call invitation (30 seconds)
      setTimeout(() => {
        setOutgoingCalls(prev => 
          prev.map(call => 
            call.id === callId 
              ? { ...call, status: 'timeout' }
              : call
          )
        );
      }, 30000);

      console.log(`[useUserCalling] Sent ${type} call invitation to user ${targetUserId}`);
    } catch (error) {
      console.error('[useUserCalling] Failed to send call invitation:', error);
    }
  }, [user, generateCallId, getOrCreateUserConversation, sendMessage]);

  /**
   * Send a teleportation invitation to bring user to your current space
   */
  const sendTeleportInvitation = useCallback(async (targetUserId: string, spaceId: string) => {
    if (!user) return;

    try {
      const callId = generateCallId();
      const invitation: CallInvitation = {
        id: callId,
        callerId: user.id,
        callerName: getDisplayName(),
        targetUserId,
        spaceId,
        type: 'teleport',
        timestamp: new Date(),
        status: 'pending'
      };

      // Add to outgoing calls
      setOutgoingCalls(prev => [...prev, invitation]);

      // Get or create conversation with target user
      const conversation = await getOrCreateUserConversation(targetUserId);
      
      if (conversation) {
        // Send system message about the teleport invitation
        await sendMessage(
          `✨ ${getDisplayName()} invites you to join them in their space`,
          {
            type: MessageType.SYSTEM,
          }
        );
      }

      // Set timeout for teleport invitation (60 seconds)
      setTimeout(() => {
        setOutgoingCalls(prev => 
          prev.map(call => 
            call.id === callId 
              ? { ...call, status: 'timeout' }
              : call
          )
        );
      }, 60000);

      console.log(`[useUserCalling] Sent teleport invitation to user ${targetUserId} for space ${spaceId}`);
    } catch (error) {
      console.error('[useUserCalling] Failed to send teleport invitation:', error);
    }
  }, [user, generateCallId, getOrCreateUserConversation, sendMessage]);

  /**
   * Accept an incoming call or teleport invitation
   */
  const acceptCall = useCallback(async (callId: string) => {
    if (!user) return;

    try {
      const call = incomingCalls.find(c => c.id === callId);
      if (!call) return;

      // Update call status
      setIncomingCalls(prev => 
        prev.map(c => 
          c.id === callId 
            ? { ...c, status: 'accepted' }
            : c
        )
      );

      if (call.type === 'teleport' && call.spaceId) {
        // Handle teleportation
        await updateLocation(call.spaceId);
        
        // Send confirmation message
        const conversation = await getOrCreateUserConversation(call.callerId);
        if (conversation) {
          await sendMessage(
            `✅ ${getDisplayName()} accepted your invitation and joined the space`,
            { type: MessageType.SYSTEM }
          );
        }
      } else {
        // Handle voice/video call
        setIsCallInProgress(true);
        
        // Send confirmation message
        const conversation = await getOrCreateUserConversation(call.callerId);
        if (conversation) {
          const callType = call.type === 'voice' ? 'voice call' : 'video call';
          await sendMessage(
            `✅ ${getDisplayName()} accepted your ${callType}`,
            { type: MessageType.SYSTEM }
          );
        }

        // Here you would integrate with WebRTC or calling service
        console.log(`[useUserCalling] Starting ${call.type} call with ${call.callerName}`);
      }

      console.log(`[useUserCalling] Accepted call ${callId}`);
    } catch (error) {
      console.error('[useUserCalling] Failed to accept call:', error);
    }
  }, [user, incomingCalls, updateLocation, getOrCreateUserConversation, sendMessage]);

  /**
   * Decline an incoming call or teleport invitation
   */
  const declineCall = useCallback(async (callId: string) => {
    if (!user) return;

    try {
      const call = incomingCalls.find(c => c.id === callId);
      if (!call) return;

      // Update call status
      setIncomingCalls(prev => 
        prev.map(c => 
          c.id === callId 
            ? { ...c, status: 'declined' }
            : c
        )
      );

      // Send decline message
      const conversation = await getOrCreateUserConversation(call.callerId);
      if (conversation) {
        const actionType = call.type === 'teleport' ? 'invitation' : `${call.type} call`;
        await sendMessage(
          `❌ ${getDisplayName()} declined your ${actionType}`,
          { type: MessageType.SYSTEM }
        );
      }

      console.log(`[useUserCalling] Declined call ${callId}`);
    } catch (error) {
      console.error('[useUserCalling] Failed to decline call:', error);
    }
  }, [user, incomingCalls, getOrCreateUserConversation, sendMessage]);

  /**
   * End an active call
   */
  const endCall = useCallback(async (callId: string) => {
    try {
      setIsCallInProgress(false);
      
      // Remove from active calls
      setIncomingCalls(prev => prev.filter(c => c.id !== callId));
      setOutgoingCalls(prev => prev.filter(c => c.id !== callId));

      console.log(`[useUserCalling] Ended call ${callId}`);
    } catch (error) {
      console.error('[useUserCalling] Failed to end call:', error);
    }
  }, []);

  /**
   * Get the currently active call
   */
  const getActiveCall = useCallback((): CallInvitation | null => {
    const activeCalls = [
      ...incomingCalls.filter(c => c.status === 'accepted'),
      ...outgoingCalls.filter(c => c.status === 'accepted')
    ];
    
    return activeCalls[0] || null;
  }, [incomingCalls, outgoingCalls]);

  /**
   * Clear a call from the lists
   */
  const clearCall = useCallback((callId: string) => {
    setIncomingCalls(prev => prev.filter(c => c.id !== callId));
    setOutgoingCalls(prev => prev.filter(c => c.id !== callId));
  }, []);

  return {
    // State
    incomingCalls,
    outgoingCalls,
    isCallInProgress,
    
    // Actions
    sendCallInvitation,
    sendTeleportInvitation,
    acceptCall,
    declineCall,
    endCall,
    
    // Utils
    getActiveCall,
    clearCall,
  };
}