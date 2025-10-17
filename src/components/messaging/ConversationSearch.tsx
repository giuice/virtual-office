'use client';

import React, { useState, useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Search, Hash, MessageSquare } from 'lucide-react';
import { Space } from '@/types/database';

interface ConversationSearchProps {
  onSelectUser: (userId: string) => void;
  onSelectRoom: (roomId: string, roomName: string) => void;
  currentUserId?: string;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  onSelectUser,
  onSelectRoom,
  currentUserId,
}) => {
  const { companyUsers, spaces } = useCompany();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'rooms'>('users');

  // Filter users based on search query, excluding current user
  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // Debug: log the filtering process
    if (process.env.NODE_ENV === 'development') {
      const currentUserInList = companyUsers.find(u => u.id === currentUserId);
      if (currentUserInList) {
        // Current user found in list, filter should work
      } else if (currentUserId) {
        // Current user ID provided but not found - might be ID mismatch
        console.warn('[ConversationSearch] currentUserId not found in companyUsers', {
          currentUserId,
          companyUserIds: companyUsers.map(u => u.id),
        });
      }
    }

    return companyUsers
      .filter((user) => {
        // Exclude current user
        if (currentUserId && user.id === currentUserId) {
          return false;
        }
        // Filter by search query
        if (!query) return true;
        return (
          user.displayName.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [companyUsers, searchQuery, currentUserId]);

  // Filter rooms based on search query (all spaces can be used for messaging)
  const filteredRooms = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return spaces
      .filter((space) => {
        // Filter by search query
        if (!query) return true;
        return (
          space.name.toLowerCase().includes(query) ||
          (space.description && space.description.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [spaces, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users or rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs for Users/Rooms */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'users' | 'rooms')}
        className="flex-1 flex flex-col"
      >
        <TabsList className="w-full grid grid-cols-2 mx-3 mt-2">
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Users ({filteredUsers.length})
          </TabsTrigger>
          <TabsTrigger value="rooms" className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            Rooms ({filteredRooms.length})
          </TabsTrigger>
        </TabsList>

        {/* Users tab content */}
        <TabsContent value="users" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-0.5 p-2">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {searchQuery ? 'No users found' : 'No users available'}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onSelectUser(user.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent w-full'
                    )}
                  >
                    <div className="relative flex-shrink-0" data-avatar-interactive>
                      <EnhancedAvatarV2
                        user={user}
                        size="sm"
                        showStatus
                        status={user.status}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Rooms tab content */}
        <TabsContent value="rooms" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-0.5 p-2">
              {filteredRooms.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {searchQuery ? 'No rooms found' : 'No rooms available'}
                </div>
              ) : (
                filteredRooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => onSelectRoom(room.id, room.name)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent w-full'
                    )}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                      <Hash className="h-4 w-4" />
                    </div>
                    <div className="flex-1 overflow-hidden min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {room.name}
                      </p>
                      {room.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {room.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
