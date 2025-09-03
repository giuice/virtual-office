'use client';

import { useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InviteUserDialog } from './invite-user-dialog';
import { getUserInitials } from '@/lib/avatar-utils';
import { UserRole, User } from '@/types/database';
import { useNotification } from '@/hooks/useNotification';

// Role Management Dialog Component
function RoleManagementDialog({ user, onRoleChange }: { 
  user: User; 
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const { showSuccess, showError } = useNotification();

  const handleRoleChange = async () => {
    try {
      setIsLoading(true);
      await onRoleChange(user.id, selectedRole);
      showSuccess({ description: `${user.displayName}'s role updated to ${selectedRole}` });
      setIsOpen(false);
    } catch (error) {
      showError({ 
        description: error instanceof Error ? error.message : 'Failed to update role' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Manage Role</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update User Role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <p className="mb-2">User: <span className="font-medium">{user.displayName}</span></p>
            <p className="mb-4 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full p-2 border rounded-md bg-background"
              disabled={isLoading}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {selectedRole === 'admin' 
                ? 'Admins can manage company settings, users, and all virtual office features.' 
                : 'Members can use the virtual office but cannot manage users or company settings.'}
            </p>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRoleChange} 
              disabled={isLoading || selectedRole === user.role}
            >
              {isLoading ? 'Updating...' : 'Update Role'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Remove User Dialog Component
function RemoveUserDialog({ user, onRemoveUser }: {
  user: User;
  onRemoveUser: (userId: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showSuccess, showError } = useNotification();

  const handleRemoveUser = async () => {
    try {
      setIsLoading(true);
      await onRemoveUser(user.id);
      showSuccess({ description: `${user.displayName} has been removed from the company` });
      setIsOpen(false);
    } catch (error) {
      showError({ 
        description: error instanceof Error ? error.message : 'Failed to remove user' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">Remove</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Remove User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="text-center p-4">
            <p className="mb-4">Are you sure you want to remove <span className="font-medium">{user.displayName}</span> from this company?</p>
            <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
            <p className="text-sm text-destructive">This action cannot be undone.</p>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleRemoveUser} 
              disabled={isLoading}
            >
              {isLoading ? 'Removing...' : 'Remove User'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompanyMembers() {
  const { company, companyUsers, currentUserProfile, updateUserRole, removeUserFromCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(false);
  const { showSuccess, showError } = useNotification();

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

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isAdmin) {
      showError({ description: 'Only admins can change user roles' });
      return;
    }

    try {
      setIsLoading(true);
      await updateUserRole(userId, newRole);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!isAdmin) {
      showError({ description: 'Only admins can remove users' });
      return;
    }

    if (userId === currentUserProfile?.id) {
      showError({ description: 'You cannot remove yourself from the company' });
      return;
    }

    try {
      setIsLoading(true);
      await removeUserFromCompany(userId);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      throw error;
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
                <EnhancedAvatarV2
                  user={user}
                  size="md"
                  showStatus={true}
                  status={user.status}
                  onError={(error) => {
                    console.warn(`Avatar load failed for user ${user.displayName}:`, error.additionalInfo.message);
                  }}
                />
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
                
                {/* Admin actions dropdown */}
                {isAdmin && user.id !== currentUserProfile?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                          <circle cx="5" cy="12" r="1" />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <RoleManagementDialog user={user} onRoleChange={handleRoleChange} />
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <RemoveUserDialog user={user} onRemoveUser={handleRemoveUser} />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}