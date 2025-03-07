'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { UserStatus } from '@/types/database';
import { getUserInitials } from '@/lib/avatar-utils';

export function UserProfile() {
  const { user } = useAuth();
  const { currentUserProfile, updateUserProfile, isLoading } = useCompany();
  const { showSuccess, showError } = useNotification();

  const [displayName, setDisplayName] = useState(currentUserProfile?.displayName || '');
  const [status, setStatus] = useState<UserStatus>(currentUserProfile?.status || 'online');
  const [statusMessage, setStatusMessage] = useState(currentUserProfile?.statusMessage || '');

  const statusOptions: { value: UserStatus; label: string; color: string }[] = [
    { value: 'online', label: 'Online', color: 'bg-green-500' },
    { value: 'away', label: 'Away', color: 'bg-yellow-500' },
    { value: 'busy', label: 'Busy', color: 'bg-red-500' },
    { value: 'offline', label: 'Offline', color: 'bg-gray-400' },
  ];

  const handleUpdateProfile = async () => {
    if (!user || !currentUserProfile) return;

    try {
      await updateUserProfile({
        displayName,
        status,
        statusMessage,
      });
      showSuccess({ description: 'Your profile has been updated' });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to update profile',
      });
    }
  };

  if (!currentUserProfile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>
            Loading profile information...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Profile</CardTitle>
        <CardDescription>
          Update your personal information and status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Picture & Basic Info */}
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
          <div className="relative">
            <Avatar className="h-24 w-24">
              {currentUserProfile.avatarUrl ? (
                <img src={currentUserProfile.avatarUrl} alt={currentUserProfile.displayName} />
              ) : (
                <div className="flex h-full w-full text-2xl items-center justify-center bg-primary/10 text-primary">
                  {getUserInitials(currentUserProfile.displayName)}
                </div>
              )}
            </Avatar>
            <span 
              className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background ${
                statusOptions.find(s => s.value === currentUserProfile.status)?.color || 'bg-gray-400'
              }`}
            />
          </div>
          
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-xl font-medium">{currentUserProfile.displayName}</h3>
            <p className="text-sm text-muted-foreground">{currentUserProfile.email}</p>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                {currentUserProfile.role}
              </span>
              {currentUserProfile.companyId && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full">
                  {currentUserProfile.companyId}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Edit Profile Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium">
              Display Name
            </label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="status" className="text-sm font-medium">
              Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex items-center gap-2 p-2 border rounded-md ${
                    status === option.value ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  onClick={() => setStatus(option.value)}
                  disabled={isLoading}
                >
                  <span className={`h-3 w-3 rounded-full ${option.color}`} />
                  <span className="text-sm">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="statusMessage" className="text-sm font-medium">
              Status Message
            </label>
            <Input
              id="statusMessage"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="What are you working on?"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              This will be visible to your team members
            </p>
          </div>
          
          <div className="pt-4">
            <Button 
              onClick={handleUpdateProfile} 
              disabled={isLoading || !displayName}
            >
              {isLoading ? 'Updating...' : 'Update Profile'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}