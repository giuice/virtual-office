'use client';

import { useState } from 'react';
import { InviteUserDialog } from './invite-user-dialog';
import { InvitationList } from './invitation-list';
import { useCompany } from '@/contexts/CompanyContext';

export function InvitationManagement() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { currentUserProfile } = useCompany();

  // Check if current user is admin
  const isAdmin = currentUserProfile?.role === 'admin';

  // Handle invitation sent - refresh the list
  const handleInviteSent = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Don't render if user is not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Invitations</h2>
          <p className="text-muted-foreground">
            Manage invitations and add new team members to your virtual office
          </p>
        </div>
        <InviteUserDialog onInviteSent={handleInviteSent} />
      </div>
      
      <InvitationList refreshTrigger={refreshKey} />
    </div>
  );
}