// src/contexts/messaging/useSocketEvents.ts
import { useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { io, Socket } from 'socket.io-client';
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
  const socketRef = useRef<Socket | null>(null);
  
  // State for typing indicators
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const typingUsersRef = useRef<Record<string, string[]>>({});
  
  // Initialize Socket.io connection
  useEffect(() => {
    if (user && company) {
      // Initialize socket connection
      socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
        auth: {
          userId: user.uid,
          companyId: company.id,
        },
      });
      
      // Set up event listeners
      const socket = socketRef.current;
      
      // Handle new messages
      socket.on(SocketEvents.NEW_MESSAGE, async (newMessage: Message) => { // Added async
        // Add message to state if it's for the active conversation
        if (activeConversationId && newMessage.conversationId === activeConversationId) {
          addMessageCallback(newMessage);
          
          // Mark as delivered if from another user
          if (newMessage.senderId !== user.uid) {
            // Call API to mark as delivered
            await messagingApi.updateMessageStatus(newMessage.id, MessageStatus.DELIVERED, user!.uid); // Added userId
            // console.warn('updateMessageStatus API call not implemented yet.'); // Remove warning
          }
        }
        
        // Update conversation list with new message
        updateConversationCallback(newMessage.conversationId, newMessage, newMessage.senderId);
      });
      
      // Handle message status updates
      socket.on(SocketEvents.MESSAGE_STATUS_UPDATED, ({ messageId, status }: { messageId: string, status: MessageStatus }) => {
        updateMessageStatusCallback(messageId, status);
      });
      
      // Handle typing indicators
      socket.on(SocketEvents.TYPING_INDICATOR, ({ conversationId, userId, timestamp }: TypingIndicator) => {
        if (userId !== user.uid) {
          // Add user to typing users for this conversation
          const conversationTypers = [...(typingUsersRef.current[conversationId] || [])];
          if (!conversationTypers.includes(userId)) {
            conversationTypers.push(userId);
            typingUsersRef.current = { 
              ...typingUsersRef.current, 
              [conversationId]: conversationTypers 
            };
          }
          
          // Clear typing indicator after 3 seconds
          if (typingTimeoutsRef.current[userId]) {
            clearTimeout(typingTimeoutsRef.current[userId]);
          }
          
          typingTimeoutsRef.current[userId] = setTimeout(() => {
            const updatedTypers = [...(typingUsersRef.current[conversationId] || [])];
            const index = updatedTypers.indexOf(userId);
            if (index !== -1) {
              updatedTypers.splice(index, 1);
              typingUsersRef.current = { 
                ...typingUsersRef.current, 
                [conversationId]: updatedTypers 
              };
            }
          }, 3000);
        }
      });
      
      // Handle conversation updates
      socket.on(SocketEvents.CONVERSATION_UPDATED, (updatedConversation: Conversation) => {
        // This would be handled at the conversations level
      });
      
      // Clean up on unmount
      return () => {
        socket.disconnect();
        
        // Clear all typing timeouts
        Object.values(typingTimeoutsRef.current).forEach(timeout => {
          clearTimeout(timeout);
        });
      };
    }
  }, [user, company, activeConversationId, addMessageCallback, updateMessageStatusCallback, updateConversationCallback]);
  
  // Join conversation room when active conversation changes
  useEffect(() => {
    if (socketRef.current && activeConversationId) {
      // Leave previous conversation room if there was one
      if (activeConversationId) {
        socketRef.current.emit(SocketEvents.LEAVE_CONVERSATION, { 
          conversationId: activeConversationId 
        });
      }
      
      // Join new conversation room
      socketRef.current.emit(SocketEvents.JOIN_CONVERSATION, { 
        conversationId: activeConversationId 
      });
    }
  }, [activeConversationId]);
  
  // Function to send typing indicator
  const sendTypingIndicator = useCallback(async (conversationId: string) => { // Added async
    if (!user) return;
    
    // Send typing indicator to server
    // Call API to send typing indicator
    await messagingApi.sendTypingIndicator(conversationId, user.uid, true); // Assuming true means typing started
    // console.warn('sendTypingIndicator API call not implemented yet.'); // Remove warning
    
    // Also emit via socket for real-time updates (This part is likely correct)
    if (socketRef.current) {
      socketRef.current.emit(SocketEvents.TYPING_INDICATOR, {
        conversationId,
        userId: user.uid,
        timestamp: new Date(),
      });
    }
  }, [user]);
  
  // Return functions and state
  return {
    sendTypingIndicator,
    getTypingUsers: (conversationId: string) => typingUsersRef.current[conversationId] || []
  };
}