// src/hooks/useTypingIndicator.ts
import { useState, useCallback, useRef } from 'react';
import { messagingApi } from '@/lib/messaging-api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook for managing typing indicators in conversations
 * Provides debounced typing status updates
 */
export function useTypingIndicator(conversationId: string | null) {
  const { user } = useAuth();
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentTypingRef = useRef<boolean>(false);

  // Send typing status with debouncing
  const updateTypingStatus = useCallback(async (typing: boolean) => {
    if (!conversationId || !user) return;

    // Only send if status actually changed
    if (lastSentTypingRef.current === typing) return;

    try {
      await messagingApi.sendTypingIndicator(conversationId, user.id, typing);
      lastSentTypingRef.current = typing;
      setIsTyping(typing);
      
      console.log(`[useTypingIndicator] Sent typing status: ${typing} for conversation ${conversationId}`);
    } catch (error) {
      console.error('[useTypingIndicator] Failed to send typing indicator:', error);
    }
  }, [conversationId, user]);

  // Start typing indicator
  const startTyping = useCallback(() => {
    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Send typing started if not already typing
    if (!lastSentTypingRef.current) {
      updateTypingStatus(true);
    }

    // Set timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 2000);
  }, [updateTypingStatus]);

  // Stop typing indicator
  const stopTyping = useCallback(() => {
    // Clear timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Send typing stopped
    updateTypingStatus(false);
  }, [updateTypingStatus]);

  // Handle input change (call this from your message input component)
  const handleInputChange = useCallback((value: string) => {
    if (value.trim().length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
  }, [startTyping, stopTyping]);

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    // Don't automatically start typing on focus, wait for actual input
  }, []);

  // Handle input blur
  const handleInputBlur = useCallback(() => {
    stopTyping();
  }, [stopTyping]);

  // Handle form submit (stop typing when message is sent)
  const handleMessageSent = useCallback(() => {
    stopTyping();
  }, [stopTyping]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (lastSentTypingRef.current) {
      updateTypingStatus(false);
    }
  }, [updateTypingStatus]);

  return {
    isTyping,
    startTyping,
    stopTyping,
    handleInputChange,
    handleInputFocus,
    handleInputBlur,
    handleMessageSent,
    cleanup
  };
}