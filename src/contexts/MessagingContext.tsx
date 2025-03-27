'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, Conversation } from '@/types/messaging'; // Import from the specific messaging types file

interface MessagingContextType {
  socket: Socket | null;
  isConnected: boolean;
  messages: Message[];
  conversations: Conversation[];
  sendMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
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

  useEffect(() => {
    // Initialize Socket.IO connection
    // TODO: Replace with actual server URL from environment variables
    const newSocket = io('http://localhost:3001'); // Example URL

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

  // TODO: Implement other context functions (fetchConversations, markAsRead, etc.)

  const value = {
    socket,
    isConnected,
    messages,
    conversations,
    sendMessage,
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
