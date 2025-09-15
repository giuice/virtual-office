'use client';
 
 import React, { useState, useEffect, useRef, useCallback } from 'react';
 import { useInfiniteQuery } from '@tanstack/react-query';
 import { MessageList } from './MessageList';
 import { MessageInput } from './MessageInput';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Button } from '@/components/ui/button';
 import { Message } from '@/types/messaging';

import { useMessaging } from '@/contexts/messaging/MessagingContext';
 import { Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
 
 interface ChatWindowProps {
   conversationId: string;
   onSendMessage: (content: string, replyToId?: string) => void;
   title?: string;
   onClose?: () => void;
   className?: string;
 }
 
 // API response type for paginated messages
 interface MessagesResponse {
   messages: Message[];
   nextCursor?: string;
   hasMore: boolean;
 }
 
 export const ChatWindow: React.FC<ChatWindowProps> = ({
   conversationId,
   onSendMessage,
   title,
   onClose,
   className = "",
 }) => {
   const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
   const scrollAreaRef = useRef<HTMLDivElement>(null);
   const [isAtBottom, setIsAtBottom] = useState(true);
 

  // Consume centralized realtime status; only "connected" when this is the active conversation
  const { connectionStatus, activeConversation } = useMessaging();
  const isConnected = activeConversation?.id === conversationId && connectionStatus === 'SUBSCRIBED';
 
   // Windowed message loading with infinite query
   const {
     data,
     fetchNextPage,
     hasNextPage,
     isFetchingNextPage,
     isLoading,
     isError,
     error,
   } = useInfiniteQuery({
     queryKey: ['messages', conversationId],
     queryFn: async ({ pageParam = 0 }) => {
       const params = new URLSearchParams({
         conversationId,
         limit: '20',
         cursor: pageParam.toString(),
       });
       
       const response = await fetch(`/api/messages/get?${params}`);
       if (!response.ok) {
         throw new Error('Failed to fetch messages');
       }
       
       return response.json() as Promise<MessagesResponse>;
     },
     getNextPageParam: (lastPage) => 
       lastPage.hasMore && lastPage.nextCursor ? parseInt(lastPage.nextCursor) : undefined,
     initialPageParam: 0,
   });
 
   // Flatten all messages from all pages
   const allMessages = data?.pages.flatMap(page => page.messages) || [];
 
   const handleStartReply = useCallback((message: Message) => {
     setReplyingToMessage(message);
   }, []);
 
   const handleCancelReply = useCallback(() => {
     setReplyingToMessage(null);
   }, []);
 
   // Handle scroll to load older messages
   const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
     const element = event.currentTarget;
     const isNearTop = element.scrollTop < 100;
     const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
     
     setIsAtBottom(isNearBottom);
     
     // Load more messages when scrolled near the top
     if (isNearTop && hasNextPage && !isFetchingNextPage) {
       fetchNextPage();
     }
   }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
 
   // Auto-scroll to bottom when new messages arrive (if user is already at bottom)
   useEffect(() => {
     if (isAtBottom && scrollAreaRef.current) {
       const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
       if (scrollElement) {
         scrollElement.scrollTop = scrollElement.scrollHeight;
       }
     }
   }, [allMessages, isAtBottom]);
 
   if (isError) {
     return (
       <div className={`flex flex-col h-full border rounded-lg bg-card text-card-foreground ${className}`}>
         <div className="flex-1 flex items-center justify-center p-4">
           <div className="text-center">
             <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
             <p className="text-sm text-muted-foreground">
               Failed to load messages: {error?.message}
             </p>
             <Button 
               variant="outline" 
               size="sm" 
               className="mt-2"
               onClick={() => window.location.reload()}
             >
               Retry
             </Button>
           </div>
         </div>
       </div>
     );
   }
 
   return (
     <div className={`flex flex-col h-full border rounded-lg bg-card text-card-foreground ${className}`}>
       {/* Header */}
       <div className="p-3 border-b flex items-center justify-between">
         <div className="flex items-center gap-2">
           <h2 className="font-semibold text-lg">
             {title || `Chat: ${conversationId.slice(0, 8)}...`}
           </h2>
           {/* Connection status indicator */}
           <div className="flex items-center gap-1">
             {isConnected ? (
               <span title="Connected to realtime" aria-label="Connected to realtime">
                 <Wifi className="h-4 w-4 text-green-500" />
               </span>
             ) : (
               <span title="Not connected to realtime" aria-label="Not connected to realtime">
                 <WifiOff className="h-4 w-4 text-gray-400" />
               </span>
             )}
           </div>
         </div>
         {onClose && (
           <Button variant="ghost" size="sm" onClick={onClose}>
             ×
           </Button>
         )}
       </div>
 
       {/* Message List Area */}
       <ScrollArea 
         className="flex-1" 
         ref={scrollAreaRef}
         onScrollCapture={handleScroll}
       >
         <div className="p-4">
           {/* Load more button/indicator at top */}
           {hasNextPage && (
             <div className="text-center mb-4">
               {isFetchingNextPage ? (
                 <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                   <Loader2 className="h-4 w-4 animate-spin" />
                   Loading older messages...
                 </div>
               ) : (
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   onClick={() => fetchNextPage()}
                   className="text-sm text-muted-foreground"
                 >
                   Load older messages
                 </Button>
               )}
             </div>
           )}
           
           {isLoading ? (
             <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
               <Loader2 className="h-4 w-4 animate-spin" />
               Loading messages...
             </div>
           ) : (
             <MessageList messages={allMessages} onStartReply={handleStartReply} />
           )}
         </div>
       </ScrollArea>
 
       {/* Message Input Area */}
       <div className="p-3 border-t">
         <MessageInput
           onSendMessage={onSendMessage}
           replyingToMessage={replyingToMessage}
           onCancelReply={handleCancelReply}
           isLoading={isLoading}
         />
       </div>
     </div>
   );
 };
