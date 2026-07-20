'use client';

import React, { useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useNotification } from '@/hooks/useNotification';
import Link from 'next/link';
import { UploadableAvatar } from '@/components/profile/UploadableAvatar';
import { avatarCacheManager } from '@/lib/avatar-utils';

export function EnhancedUserMenu() {
  const { user, signOut } = useAuth();
  const { currentUserProfile } = useCompany();
  const { users } = usePresence();
  const { showSuccess, showError } = useNotification();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Get presence-aware status for the current user
  const presenceAwareUser = users?.find(u => u.id === currentUserProfile?.id);
  const currentStatus = presenceAwareUser?.status || currentUserProfile?.status || 'offline';

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      showSuccess({ description: 'Successfully signed out!' });
      window.location.replace('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      showError({ 
        description: error instanceof Error ? error.message : 'An error occurred while signing out' 
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    if (!currentUserProfile) return;
    
    setIsUploading(true);
    
    try {
      // Create form data for the upload
      const formData = new FormData();
      formData.append('avatar', file);
      
      // Send to the API
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload avatar');
      }
      
      await response.json();
      avatarCacheManager.invalidateUser(String(currentUserProfile.id));
      
      // Show success message
      showSuccess({ description: 'Avatar updated successfully' });
      
      // You might want to refresh the user profile here
      // or handle it through a context update
      
    } catch (error) {
      console.error('Avatar upload error:', error);
      showError({
        description: error instanceof Error ? error.message : 'Failed to upload avatar'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // If we don't have a user profile yet, show a simple loading state
  if (!currentUserProfile) {
    return (
      <Button variant="ghost" className="relative size-10 rounded-full">
        <div className="size-10 animate-pulse rounded-full bg-muted" />
      </Button>
    );
  }
  // Combine Supabase user data with our database user profile
  // Use presence-aware status for real-time accuracy
  const combinedUser = {
    ...currentUserProfile,
    status: currentStatus,
    photoURL: user?.user_metadata?.avatar_url || currentUserProfile.avatarUrl || user?.user_metadata.photoURL,
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-menu-trigger"
          className="relative size-10 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <UploadableAvatar
            user={combinedUser}
            size="sm"
            className="cursor-pointer"
            showUploadButton={false}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="grid gap-4">
          <div className="flex gap-4 items-start">
            <UploadableAvatar
              user={combinedUser}
              onAvatarChange={handleAvatarUpload}
              size="lg"
              uploading={isUploading}
            />
            <div className="grid gap-1">
              <p className="text-sm font-medium">{currentUserProfile.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentUserProfile.email}
              </p>
              <div className="flex items-center mt-1">
                <span className={`
                  size-2 rounded-full mr-1
                  ${currentStatus === 'online' ? 'bg-emerald-500' : 
                    currentStatus === 'away' ? 'bg-amber-500' : 
                    currentStatus === 'busy' ? 'bg-rose-500' : 
                    'bg-gray-400'}
                `} />
                <span className="text-xs capitalize">{currentStatus}</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/dashboard/profile">
                <Settings className="size-4" />
                <span>Meu Perfil</span>
              </Link>
            </Button>
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </Button>
            <Button 
              variant="ghost" 
              className="flex items-center justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-9" 
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
            >
              <LogOut className="size-4" />
              <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
