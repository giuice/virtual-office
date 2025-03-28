'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, Conversation, MessageReaction } from '@/types/messaging'; // Import MessageReaction
import { useCompany } from './CompanyContext'; // Import useCompany

interface MessagingContextType {
  socket: Socket | null;
  isConnected: boolean;
  messages: Message[];
  conversations: Conversation[];
  // Update sendMessage signature to include optional replyToId
  sendMessage: (messageData: Omit<Message, 'id' | 'timestamp' | 'replyToId'>, replyToId?: string) => void;
  addReaction: (messageId: string, emoji: string) => void; // Add addReaction type
  // Add more functions as needed: markAsRead, fetchConversations, etc.
}

const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

interface MessagingProviderProps {
  children: ReactNode;
}

export const MessagingProvider: React.FC<MessagingProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { currentUserProfile } = useCompany(); // Get user profile for senderId

  useEffect(() => {
    // Initialize Socket.IO connection
    // TODO: Replace with actual server URL from environment variables
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_IO_URL || 'http://localhost:3001'); // Use environment variable or fallback

    newSocket.on('connect', () => {
      console.log('Socket.IO connected:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
    });

    newSocket.on('receive_message', (message: Message) => {
      // TODO: Implement logic to add received message to state
      console.log('Received message:', message);
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    // Listen for reaction updates from other users
    newSocket.on('reaction_updated', (reactionData: { messageId: string; reaction: string; userId: string; add: boolean }) => {
      console.log('Received reaction update:', reactionData);
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === reactionData.messageId) {
            // Avoid applying update if it's from the current user (already handled optimistically)
            if (reactionData.userId === currentUserProfile?.id) {
              return msg;
            }

            const existingReactions = msg.reactions || [];
            let updatedReactions: MessageReaction[];

            if (reactionData.add) {
              // Add reaction from another user
              const newReaction: MessageReaction = {
                emoji: reactionData.reaction,
                userId: reactionData.userId,
                timestamp: new Date(), // Use current time or server time if available
              };
              // Avoid adding duplicates if somehow received multiple times
              if (!existingReactions.some(r => r.userId === newReaction.userId && r.emoji === newReaction.emoji)) {
                updatedReactions = [...existingReactions, newReaction];
              } else {
                updatedReactions = existingReactions;
              }
            } else {
              // Remove reaction from another user
              updatedReactions = existingReactions.filter(
                (r) => !(r.userId === reactionData.userId && r.emoji === reactionData.reaction)
              );
            }
            return { ...msg, reactions: updatedReactions };
          }
          return msg;
        })
      );
    });

    // TODO: Add listeners for other events (e.g., conversation updates, errors)

    setSocket(newSocket);

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Update sendMessage to accept and handle replyToId
  const sendMessage = (messageData: Omit<Message, 'id' | 'timestamp' | 'replyToId'>, replyToId?: string) => {
    if (socket && isConnected && currentUserProfile) { // Ensure currentUserProfile exists
      const messageToSend: Partial<Message> & { content: string; conversationId: string } = { // Use Partial<Message> for flexibility
        ...messageData,
        senderId: currentUserProfile.id, // Add senderId from context
        timestamp: new Date(), // Assign Date object directly
        ...(replyToId && { replyToId }), // Conditionally add replyToId
      };
      console.log("Sending message:", messageToSend); // Debug log
      socket.emit('send_message', messageToSend);
      // Optionally add optimistic update to local state
      // Note: Optimistic update needs careful handling of the full Message object structure
      // setMessages((prevMessages) => [...prevMessages, { ...messageToSend, id: 'temp-id-' + Date.now() }]);
    } else {
      console.error('Socket not connected, cannot send message.');
      // TODO: Implement message queueing or error handling
    }
  };

  const addReaction = (messageId: string, emoji: string) => {
    if (!currentUserProfile) {
      console.error("Cannot add reaction: User profile not loaded.");
      return;
    }

    const userId = currentUserProfile.id;

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id === messageId) {
          const existingReactions = msg.reactions || [];
          // Check if user already reacted with this emoji
          const userReactionIndex = existingReactions.findIndex(
            (r) => r.userId === userId && r.emoji === emoji
          );

          let updatedReactions: MessageReaction[];

          if (userReactionIndex > -1) {
            // User is removing their reaction
            updatedReactions = existingReactions.filter(
              (_, index) => index !== userReactionIndex
            );
          } else {
            // User is adding a new reaction
            const newReaction: MessageReaction = {
              emoji,
              userId,
              timestamp: new Date(),
            };
            updatedReactions = [...existingReactions, newReaction];
          }
          
          // Call the API endpoint to persist the reaction
          fetch('/api/messages/react', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId, emoji }),
          })
          .then(response => {
            if (!response.ok) {
              // TODO: Handle API error (e.g., revert optimistic update?)
              console.error(`API Error (${response.status}): Failed to update reaction.`);
            }
            // Optionally handle success, though optimistic update is already done
            // Emit socket event after successful API call
            if (socket) {
              socket.emit('update_reaction', {
                messageId,
                reaction: emoji,
                userId,
                add: userReactionIndex === -1, // true if adding, false if removing
              });
            }
          })
          .catch(error => {
            // TODO: Handle network error (e.g., revert optimistic update?)
            console.error('Network error updating reaction:', error);
            // Consider reverting optimistic update here
            // setMessages(prevMessages); // Revert to state before optimistic update
          });

          return { ...msg, reactions: updatedReactions };
        }
        return msg;
      })
    );
  };

  // TODO: Implement other context functions (fetchConversations, markAsRead, etc.)

  const value = {
    socket,
    isConnected,
    messages,
    conversations,
    sendMessage,
    addReaction, // Add addReaction to the context value
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
};

export const useMessaging = (): MessagingContextType => {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
};
