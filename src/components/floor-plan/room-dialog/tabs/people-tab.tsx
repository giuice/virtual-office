// src/components/floor-plan/room-dialog/tabs/people-tab.tsx
'use client'

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Users } from 'lucide-react';
import { UIUser as LocalUser } from '../../types';
import { StatusAvatar } from '@/components/ui/avatar-system';
import { useCompany } from '@/contexts/CompanyContext';
import { RoomPeopleTabProps } from '../types';

export function PeopleTab({ userIds = [], handleMessageUser }: RoomPeopleTabProps) {
  // Get companyUsers from context to resolve user details
  const { companyUsers } = useCompany();

  return (
    <ScrollArea className="h-[200px] rounded-md border p-4">
      <div className="space-y-4">
        {userIds.length > 0 ? (
          userIds.map(userId => {
            const user = companyUsers.find(u => u.id === userId);
            if (!user) return null; // Skip if user not found in context yet

            // Adapt LocalUser structure for StatusAvatar/MessageDialog if needed
            const localUser: LocalUser = {
              id: 0, // LocalUser expects number ID, use placeholder or refactor components
              name: user.displayName,
              avatar: user.avatarUrl || '',
              status: 'active', // LocalUser has different status types, map or use placeholder
              activity: user.statusMessage || user.status || ''
            };

            return (
              <div key={user.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusAvatar user={localUser} size="sm" />
                  <div>
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground">{user.statusMessage || user.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Message user"
                    onClick={() => handleMessageUser(localUser)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
            <Users className="h-10 w-10 mb-2 opacity-20" />
            <p>No one is in this room yet</p>
            <p className="text-sm">Be the first to join!</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}