'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { InviteUserDialog } from './invite-user-dialog';
import { getUserInitials } from '@/lib/avatar-utils';

export function CompanyMembers() {
  const { company, companyUsers, currentUserProfile } = useCompany();

  // Check if the current user is an admin
  const isAdmin = company?.adminIds.includes(currentUserProfile?.id || '') || false;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="default">Admin</Badge>;
      default:
        return <Badge variant="outline">Member</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {companyUsers.length} member{companyUsers.length !== 1 ? 's' : ''} in {company?.name}
          </CardDescription>
        </div>
        {isAdmin && <InviteUserDialog />}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {companyUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.displayName} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary/10 text-primary">
                        {getUserInitials(user.displayName)}
                      </div>
                    )}
                  </Avatar>
                  <span 
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${getStatusColor(user.status)}`}
                  />
                </div>
                <div>
                  <div className="font-medium">{user.displayName}</div>
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getRoleBadge(user.role)}
                {user.id === currentUserProfile?.id && (
                  <Badge variant="secondary">You</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}