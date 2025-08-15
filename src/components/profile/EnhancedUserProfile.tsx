'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { UserStatus } from '@/types/database';
import { UploadableAvatar } from '@/components/ui/avatar-system';

// File upload handler - this is where you'd implement your avatar upload logic
// This is just a sample implementation
async function uploadUserAvatar(file: File, userId: string): Promise<string> {
  // Example implementation using FormData
  const formData = new FormData();
  formData.append('avatar', file);
  formData.append('userId', userId);
  
  // Replace with your actual API endpoint
  const response = await fetch('/api/users/avatar', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error('Failed to upload avatar');
  }
  
  const data = await response.json();
  return data.avatarUrl; // Return the URL of the uploaded avatar
}

export function EnhancedUserProfile() {
  const { user } = useAuth();
  const { currentUserProfile, updateUserProfile, isLoading } = useCompany();
  const { showSuccess, showError } = useNotification();

  const [displayName, setDisplayName] = useState(currentUserProfile?.displayName || '');
  const [status, setStatus] = useState<UserStatus>(currentUserProfile?.status || 'online');
  const [statusMessage, setStatusMessage] = useState(currentUserProfile?.statusMessage || '');
  const [isUploading, setIsUploading] = useState(false);

  const statusOptions: { value: UserStatus; label: string; color: string }[] = [
    { value: 'online', label: 'Online', color: 'bg-emerald-500' },
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
  
  const handleAvatarChange = async (file: File) => {
    if (!user || !currentUserProfile) return;
    
    setIsUploading(true);
    try {
      // Upload avatar and get the URL
      const avatarUrl = await uploadUserAvatar(file, currentUserProfile.id);
      
      // Update user profile with new avatar URL
      await updateUserProfile({
        avatarUrl,
      });
      
      showSuccess({ description: 'Avatar updated successfully' });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to update avatar',
      });
      throw error; // Re-throw to let the component handle the error
    } finally {
      setIsUploading(false);
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
          {/* Enhanced avatar component with upload capability */}
          <UploadableAvatar
            userId={currentUserProfile.id}
            displayName={currentUserProfile.displayName}
            currentAvatarUrl={currentUserProfile.avatarUrl}
            onAvatarChange={(url) => handleAvatarChange(url)}
            size="xl"
            status={currentUserProfile.status}
          />
          
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-xl font-medium">{currentUserProfile.displayName}</h3>
            <p className="text-sm text-muted-foreground">{currentUserProfile.email}</p>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                {currentUserProfile.role}
              </span>
              {currentUserProfile.companyId && (
                <span className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full">
                  Company ID: {currentUserProfile.companyId.substring(0, 8)}...
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
