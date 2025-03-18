// src/contexts/MessagingContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { io, Socket } from 'socket.io-client';
import {
  Message,
  Conversation,
  ConversationType,
  MessageType,
  MessageStatus,
  TypingIndicator,
  MessageDraft,
  MessageAttachment,
  PaginationOptions
} from '@/types/messaging';
import {
  createMessage,
  getMessages,
  updateMessageStatus,
  createConversation,
  getConversations,
  getConversation,
  getOrCreateDirectConversation,
  markConversationAsRead,
  setConversationArchiveStatus,
  addMessageReaction,
  removeMessageReaction,
  uploadMessageAttachment,
  sendTypingIndicator as apiSendTypingIndicator
} from '@/lib/messaging-api';

// Define the context type
interface MessagingContextType {
  // Conversations
  conversations: Conversation[];
  activeConversation: Conversation | null;
  loadingConversations: boolean;
  errorConversations: string | null;
  setActiveConversation: (conversation: Conversation | null) => void;
  getOrCreateRoomConversation: (roomId: string, roomName: string) => Promise<Conversation>;
  getOrCreateUserConversation: (userId: string) => Promise<Conversation>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  
  // Messages
  messages: Message[];
  loadingMessages: boolean;
  errorMessages: string | null;
  hasMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (content: string, options?: {
    replyToId?: string;
    attachments?: MessageAttachment[];
    type?: MessageType;
  }) => Promise<void>;
  
  // Message drafts
  messageDrafts: Record<string, MessageDraft>;
  updateMessageDraft: (conversationId: string, content: string) => void;
  
  // Typing indicators
  typingUsers: Record<string, string[]>; // conversationId -> userIds
  sendTypingIndicator: (conversationId: string) => void;
  
  // Attachments
  uploadAttachment: (file: File) => Promise<MessageAttachment>;
  
  // Reactions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  
  // Unread counts
  totalUnreadCount: number;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  
  // Utilities
  refreshConversations: () => Promise<void>;
  refreshMessages: () => Promise<void>;
}

// Create the context with a default undefined value
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// Socket.io events
enum SocketEvents {
  JOIN_CONVERSATION = 'join_conversation',
  LEAVE_CONVERSATION = 'leave_conversation',
  NEW_MESSAGE = 'new_message',
  MESSAGE_STATUS_UPDATED = 'message_status_updated',
  TYPING_INDICATOR = 'typing_indicator',
  CONVERSATION_UPDATED = 'conversation_updated',
}

// Provider component
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  // Auth and company context
  const { user } = useAuth();
  const { company } = useCompany();
  
  // Socket.io connection
  const socketRef = useRef<Socket | null>(null);
  
  // State for conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [errorConversations, setErrorConversations] = useState<string | null>(null);
  
  // State for messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [errorMessages, setErrorMessages] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [messagePagination, setMessagePagination] = useState<PaginationOptions>({
    limit: 20,
    direction: 'older',
  });
  
  // State for message drafts
  const [messageDrafts, setMessageDrafts] = useState<Record<string, MessageDraft>>({});
  
  // State for typing indicators
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((count, conversation) => {
    if (user && conversation.unreadCount && conversation.unreadCount[user.uid]) {
      return count + conversation.unreadCount[user.uid];
    }
    return count;
  }, 0);
  
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
      socket.on(SocketEvents.NEW_MESSAGE, (newMessage: Message) => {
        // Add message to state if it's for the active conversation
        if (activeConversation && newMessage.conversationId === activeConversation.id) {
          setMessages(prev => [...prev, newMessage]);
          
          // Mark as delivered if from another user
          if (newMessage.senderId !== user.uid) {
            updateMessageStatus(newMessage.id, MessageStatus.DELIVERED);
          }
        }
        
        // Update conversation list with new message
        setConversations(prev => {
          const updatedConversations = [...prev];
          const conversationIndex = updatedConversations.findIndex(
            c => c.id === newMessage.conversationId
          );
          
          if (conversationIndex !== -1) {
            const conversation = { ...updatedConversations[conversationIndex] };
            conversation.lastMessage = newMessage;
            conversation.lastActivity = newMessage.timestamp;
            
            // Update unread count if not the active conversation
            if (
              (!activeConversation || activeConversation.id !== conversation.id) && 
              newMessage.senderId !== user.uid
            ) {
              if (!conversation.unreadCount) {
                conversation.unreadCount = {};
              }
              conversation.unreadCount[user.uid] = (conversation.unreadCount[user.uid] || 0) + 1;
            }
            
            // Move conversation to top of list
            updatedConversations.splice(conversationIndex, 1);
            updatedConversations.unshift(conversation);
          }
          
          return updatedConversations;
        });
      });
      
      // Handle message status updates
      socket.on(SocketEvents.MESSAGE_STATUS_UPDATED, ({ messageId, status }: { messageId: string, status: MessageStatus }) => {
        setMessages(prev => 
          prev.map(message => 
            message.id === messageId 
              ? { ...message, status } 
              : message
          )
        );
      });
      
      // Handle typing indicators
      socket.on(SocketEvents.TYPING_INDICATOR, ({ conversationId, userId, timestamp }: TypingIndicator) => {
        if (userId !== user.uid) {
          // Add user to typing users for this conversation
          setTypingUsers(prev => {
            const conversationTypers = [...(prev[conversationId] || [])];
            if (!conversationTypers.includes(userId)) {
              conversationTypers.push(userId);
            }
            return { ...prev, [conversationId]: conversationTypers };
          });
          
          // Clear typing indicator after 3 seconds
          if (typingTimeoutsRef.current[userId]) {
            clearTimeout(typingTimeoutsRef.current[userId]);
          }
          
          typingTimeoutsRef.current[userId] = setTimeout(() => {
            setTypingUsers(prev => {
              const conversationTypers = [...(prev[conversationId] || [])];
              const index = conversationTypers.indexOf(userId);
              if (index !== -1) {
                conversationTypers.splice(index, 1);
              }
              return { ...prev, [conversationId]: conversationTypers };
            });
          }, 3000);
        }
      });
      
      // Handle conversation updates
      socket.on(SocketEvents.CONVERSATION_UPDATED, (updatedConversation: Conversation) => {
        setConversations(prev => {
          const updatedConversations = [...prev];
          const conversationIndex = updatedConversations.findIndex(
            c => c.id === updatedConversation.id
          );
          
          if (conversationIndex !== -1) {
            updatedConversations[conversationIndex] = updatedConversation;
          } else {
            updatedConversations.push(updatedConversation);
          }
          
          return updatedConversations;
        });
        
        // Update active conversation if it's the one that was updated
        if (activeConversation && activeConversation.id === updatedConversation.id) {
          setActiveConversation(updatedConversation);
        }
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
  }, [user, company, activeConversation]);
  
  // Join conversation room when active conversation changes
  useEffect(() => {
    if (socketRef.current && activeConversation) {
      // Leave previous conversation room
      socketRef.current.emit(SocketEvents.LEAVE_CONVERSATION, { 
        conversationId: activeConversation.id 
      });
      
      // Join new conversation room
      socketRef.current.emit(SocketEvents.JOIN_CONVERSATION, { 
        conversationId: activeConversation.id 
      });
      
      // Mark conversation as read
      if (user) {
        markConversationAsRead(activeConversation.id, user.uid);
      }
    }
  }, [activeConversation, user]);
  
  // Load conversations when user or company changes
  useEffect(() => {
    if (user && company) {
      refreshConversations();
    }
  }, [user, company]);
  
  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      refreshMessages();
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      setMessagePagination({
        limit: 20,
        direction: 'older',
      });
    }
  }, [activeConversation]);
  
  // Function to refresh conversations
  const refreshConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoadingConversations(true);
      setErrorConversations(null);
      
      const result = await getConversations(user.uid);
      setConversations(result.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setErrorConversations('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);
  
  // Function to refresh messages
  const refreshMessages = useCallback(async () => {
    if (!activeConversation) return;
    
    try {
      setLoadingMessages(true);
      setErrorMessages(null);
      
      const result = await getMessages(activeConversation.id, {
        pagination: {
          limit: 20,
          direction: 'older',
        },
      });
      
      setMessages(result.messages);
      setHasMoreMessages(result.hasMore);
      setMessagePagination({
        limit: 20,
        direction: 'older',
        cursor: result.nextCursor,
      });
    } catch (error) {
      console.error('Error loading messages:', error);
      setErrorMessages('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversation]);
  
  // Function to load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!activeConversation || !hasMoreMessages || !messagePagination.cursor) return;
    
    try {
      setLoadingMessages(true);
      
      const result = await getMessages(activeConversation.id, {
        pagination: messagePagination,
      });
      
      setMessages(prev => [...result.messages, ...prev]);
      setHasMoreMessages(result.hasMore);
      setMessagePagination({
        ...messagePagination,
        cursor: result.nextCursor,
      });
    } catch (error) {
      console.error('Error loading more messages:', error);
      setErrorMessages('Failed to load more messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversation, hasMoreMessages, messagePagination]);
  
  // Function to send a message
  const sendMessage = useCallback(async (content: string, options?: {
    replyToId?: string;
    attachments?: MessageAttachment[];
    type?: MessageType;
  }) => {
    if (!user || !activeConversation || !content.trim()) return;
    
    try {
      const messageData = {
        conversationId: activeConversation.id,
        senderId: user.uid,
        content: content.trim(),
        replyToId: options?.replyToId,
        attachments: options?.attachments,
        type: options?.type || MessageType.TEXT,
      };
      
      // Clear draft for this conversation
      updateMessageDraft(activeConversation.id, '');
      
      // Optimistically add message to UI
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        ...messageData,
        timestamp: new Date(),
        status: MessageStatus.SENDING,
        type: options?.type || MessageType.TEXT,
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Send message to server
      const savedMessage = await createMessage(messageData);
      
      // Replace optimistic message with saved message
      setMessages(prev => 
        prev.map(message => 
          message.id === optimisticMessage.id ? savedMessage : message
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Mark optimistic message as failed
      setMessages(prev => 
        prev.map(message => 
          message.id.startsWith('temp-') 
            ? { ...message, status: MessageStatus.FAILED } 
            : message
        )
      );
    }
  }, [user, activeConversation]);
  
  // Function to update message draft
  const updateMessageDraft = useCallback((conversationId: string, content: string) => {
    setMessageDrafts(prev => ({
      ...prev,
      [conversationId]: {
        conversationId,
        content,
      },
    }));
  }, []);
  
  // Function to send typing indicator
  const sendTypingIndicator = useCallback((conversationId: string) => {
    if (!user) return;
    
    // Send typing indicator to server
    apiSendTypingIndicator(conversationId, user.uid);
    
    // Also emit via socket for real-time updates
    if (socketRef.current) {
      socketRef.current.emit(SocketEvents.TYPING_INDICATOR, {
        conversationId,
        userId: user.uid,
        timestamp: new Date(),
      });
    }
  }, [user]);
  
  // Function to get or create a room conversation
  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string): Promise<Conversation> => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        c => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
      );
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new room conversation
      const newConversation = await createConversation({
        type: ConversationType.ROOM,
        participants: [user.uid], // Start with just the current user
        name: roomName,
        roomId,
      });
      
      // Add to conversations list
      setConversations(prev => [newConversation, ...prev]);
      
      return newConversation;
    } catch (error) {
      console.error('Error creating room conversation:', error);
      throw error;
    }
  }, [user, conversations]);
  
  // Function to get or create a direct conversation with another user
  const getOrCreateUserConversation = useCallback(async (otherUserId: string): Promise<Conversation> => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    if (user.uid === otherUserId) {
      throw new Error('Cannot create conversation with yourself');
    }
    
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        c => c.type === ConversationType.DIRECT && 
             c.participants.includes(user.uid) && 
             c.participants.includes(otherUserId) &&
             c.participants.length === 2
      );
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new direct conversation
      const newConversation = await getOrCreateDirectConversation(user.uid, otherUserId);
      
      // Add to conversations list
      setConversations(prev => [newConversation, ...prev]);
      
      return newConversation;
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      throw error;
    }
  }, [user, conversations]);
  
  // Function to archive a conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
    try {
      await setConversationArchiveStatus(conversationId, true);
      
      // Update local state
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === conversationId 
            ? { ...conversation, isArchived: true } 
            : conversation
        )
      );
      
      // If this was the active conversation, clear it
      if (activeConversation && activeConversation.id === conversationId) {
        setActiveConversation(null);
      }
    } catch (error) {
      console.error('Error archiving conversation:', error);
      throw error;
    }
  }, [activeConversation]);
  
  // Function to unarchive a conversation
  const unarchiveConversation = useCallback(async (conversationId: string) => {
    try {
      await setConversationArchiveStatus(conversationId, false);
      
      // Update local state
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === conversationId 
            ? { ...conversation, isArchived: false } 
            : conversation
        )
      );
    } catch (error) {
      console.error('Error unarchiving conversation:', error);
      throw error;
    }
  }, []);
  
  // Function to mark a conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    if (!user) return;
    
    try {
      await markConversationAsRead(conversationId, user.uid);
      
      // Update local state
      setConversations(prev => 
        prev.map(conversation => {
          if (conversation.id === conversationId && conversation.unreadCount) {
            const updatedUnreadCount = { ...conversation.unreadCount };
            delete updatedUnreadCount[user.uid];
            
            return {
              ...conversation,
              unreadCount: updatedUnreadCount,
            };
          }
          return conversation;
        })
      );
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  }, [user]);
  
  // Function to add a reaction to a message
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    
    try {
      await addMessageReaction(messageId, user.uid, emoji);
      
      // Update local state
      setMessages(prev => 
        prev.map(message => {
          if (message.id === messageId) {
            const reactions = [...(message.reactions || [])];
            const existingReaction = reactions.find(
              r => r.userId === user.uid && r.emoji === emoji
            );
            
            if (!existingReaction) {
              reactions.push({
                userId: user.uid,
                emoji,
                timestamp: new Date(),
              });
            }
            
            return {
              ...message,
              reactions,
            };
          }
          return message;
        })
      );
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [user]);
  
  // Function to remove a reaction from a message
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    
    try {
      await removeMessageReaction(messageId, user.uid, emoji);
      
      // Update local state
      setMessages(prev => 
        prev.map(message => {
          if (message.id === messageId && message.reactions) {
            const reactions = message.reactions.filter(
              r => !(r.userId === user.uid && r.emoji === emoji)
            );
            
            return {
              ...message,
              reactions,
            };
          }
          return message;
        })
      );
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [user]);
  
  // Function to upload an attachment
  const uploadAttachment = useCallback(async (file: File): Promise<MessageAttachment> => {
    if (!activeConversation) {
      throw new Error('No active conversation');
    }
    
    try {
      return await uploadMessageAttachment(file, activeConversation.id);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  }, [activeConversation]);
  
  // Create context value
  const value: MessagingContextType = {
    // Conversations
    conversations,
    activeConversation,
    loadingConversations,
    errorConversations,
    setActiveConversation,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    
    // Messages
    messages,
    loadingMessages,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    
    // Message drafts
    messageDrafts,
    updateMessageDraft,
    
    // Typing indicators
    typingUsers,
    sendTypingIndicator,
    
    // Attachments
    uploadAttachment,
    
    // Reactions
    addReaction,
    removeReaction,
    
    // Unread counts
    totalUnreadCount,
    markConversationAsRead: markAsRead,
    
    // Utilities
    refreshConversations,
    refreshMessages,
  };
  
  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

// Custom hook to use the messaging context
export function useMessaging() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
}
