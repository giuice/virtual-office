// src/components/messaging/conversation-list.tsx
'use client';

import { useState, useEffect } from 'react';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationType } from '@/types/messaging';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MessageSquare, 
  Search, 
  X, 
  Users, 
  User, 
  ChevronRight, 
  Clock 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  onSelectConversation?: () => void;
  className?: string;
}

export function ConversationList({
  onSelectConversation,
  className,
}: ConversationListProps) {
  const {
    conversations,
    activeConversation,
    setActiveConversation,
    loadingConversations,
    refreshConversations,
    totalUnreadCount,
  } = useMessaging();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'rooms'>('all');
  
  // Filter conversations based on search and tab
  const filteredConversations = conversations.filter(conversation => {
    // Filter by tab
    if (activeTab === 'direct' && conversation.type !== ConversationType.DIRECT) {
      return false;
    }
    if (activeTab === 'rooms' && conversation.type !== ConversationType.ROOM) {
      return false;
    }
    
    // Filter by search
    if (searchQuery) {
      const name = conversation.name?.toLowerCase() || '';
      return name.includes(searchQuery.toLowerCase());
    }
    
    return true;
  });
  
  // Sort conversations by last activity
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });
  
  // Format time
  const formatTime = (timestamp: Date) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };
  
  // Render conversation item
  const renderConversationItem = (conversation: any) => {
    const isActive = activeConversation?.id === conversation.id;
    const unreadCount = conversation.unreadCount && Object.values(conversation.unreadCount).reduce((sum: any, count: any) => sum + count, 0);
    
    return (
      <div
        key={conversation.id}
        className={cn(
          "flex items-center p-3 cursor-pointer hover:bg-secondary rounded-lg mb-1 transition-colors",
          isActive && "bg-secondary"
        )}
        onClick={() => {
          setActiveConversation(conversation);
          if (onSelectConversation) {
            onSelectConversation();
          }
        }}
      >
        <Avatar className="h-10 w-10 mr-3">
          {conversation.type === ConversationType.DIRECT ? (
            <User className="h-6 w-6" />
          ) : (
            <Users className="h-6 w-6" />
          )}
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="font-medium truncate">
              {conversation.name || 'Unnamed Conversation'}
            </div>
            <div className="text-xs text-muted-foreground flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {formatTime(conversation.lastActivity)}
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <div className="text-sm text-muted-foreground truncate">
              {conversation.lastMessage?.content || 'No messages yet'}
            </div>
            {unreadCount > 0 && (
              <Badge variant="default" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
        
        <ChevronRight className="h-4 w-4 ml-2 text-muted-foreground" />
      </div>
    );
  };
  
  // Render loading state
  if (loadingConversations) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            <span>Conversations</span>
            {totalUnreadCount > 0 && (
              <Badge variant="default" className="ml-2">
                {totalUnreadCount}
              </Badge>
            )}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
            onClick={refreshConversations}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 pt-2">
        <div className="px-4 mb-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <Tabs 
          defaultValue="all" 
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'all' | 'direct' | 'rooms')}
          className="px-4"
        >
          <TabsList className="w-full mb-4">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="direct" className="flex-1">Direct</TabsTrigger>
            <TabsTrigger value="rooms" className="flex-1">Rooms</TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[400px]">
            <div className="px-1">
              {sortedConversations.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>No conversations found</p>
                </div>
              ) : (
                sortedConversations.map(renderConversationItem)
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}
