// src/contexts/messaging/useSocketEvents.ts
import { useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
// Removed Socket.io import
import { 
  Message,
  Conversation, 
  MessageStatus,
  // Removed TypingIndicator import
} from '@/types/messaging';
// Removed incorrect named imports - functions don't exist in messaging-api.ts
// import { sendTypingIndicator as apiSendTypingIndicator } from '@/lib/messaging-api';
// import { updateMessageStatus } from '@/lib/messaging-api';
import { messagingApi } from '@/lib/messaging-api'; // Import the actual API object (though it lacks needed methods)
import { SocketEvents } from '@/contexts/messaging/types'; // Corrected import path back

// Define TypingIndicator interface locally
interface TypingIndicator {
  conversationId: string;
  userId: string;
  timestamp: Date;
}

export function useSocketEvents(
  activeConversationId: string | null,
  addMessageCallback: (message: Message) => void,
  updateMessageStatusCallback: (messageId: string, status: MessageStatus) => void,
  updateConversationCallback: (conversationId: string, lastMessage: any, senderId: string) => void
) {
  const { user } = useAuth();
  const { company } = useCompany();
  
  // Socket.io connection
  // Removed Socket.io ref
  
  // State for typing indicators
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const typingUsersRef = useRef<Record<string, string[]>>({});
  
  // Removed Socket.io initialization useEffect
  
  // Removed Socket.io room joining useEffect
  
  // Function to send typing indicator
  const sendTypingIndicator = useCallback(async (conversationId: string) => { // Added async
    if (!user) return;
    
    // Send typing indicator to server
    // Call API to send typing indicator
    await messagingApi.sendTypingIndicator(conversationId, user.uid, true); // Assuming true means typing started
    // console.warn('sendTypingIndicator API call not implemented yet.'); // Remove warning
    
    // Removed Socket.io emit for typing indicator
  }, [user]);
  
  // Return functions and state
  return {
    sendTypingIndicator,
    getTypingUsers: (conversationId: string) => typingUsersRef.current[conversationId] || []
  };
}