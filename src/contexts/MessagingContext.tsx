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
  sendMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
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

    // TODO: Add listeners for other events (e.g., conversation updates, errors)

    setSocket(newSocket);

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  const sendMessage = (messageData: Omit<Message, 'id' | 'timestamp'>) => {
    if (socket && isConnected) {
      // TODO: Add sender information (e.g., from user context)
      const messageToSend = {
        ...messageData,
        // senderId: currentUser.id, // Example
        timestamp: new Date().toISOString(),
      };
      socket.emit('send_message', messageToSend);
      // Optionally add optimistic update to local state
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
          })
          .catch(error => {
            // TODO: Handle network error (e.g., revert optimistic update?)
            console.error('Network error updating reaction:', error);
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
