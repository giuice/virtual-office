'use client';

import React, { useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/hooks/useNotification';
import Link from 'next/link';
import { UploadableAvatar } from '@/components/ui/avatar-system';

export function EnhancedUserMenu() {
  const { user, signOut } = useAuth();
  const { currentUserProfile } = useCompany();
  const router = useRouter();
  const { showSuccess, showError } = useNotification();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      showSuccess({ description: 'Successfully signed out!' });
      router.push('/login');
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

      const data = await response.json();

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
      <Button variant="ghost" className="relative h-10 w-10 rounded-full">
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
      </Button>
    );
  }
  // Combine Supabase user data with our database user profile
  const combinedUser = {
    ...currentUserProfile,
    photoURL: user?.user_metadata?.avatar_url || currentUserProfile.avatarUrl || user?.photoURL,
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
          <UploadableAvatar
            userId={combinedUser.id}
            displayName={combinedUser.displayName}
            currentAvatarUrl={combinedUser.avatarUrl}
            size="sm"
            status={combinedUser.status}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="grid gap-4">
          <div className="flex gap-4 items-start">
            <UploadableAvatar
              userId={combinedUser.id}
              displayName={combinedUser.displayName}
              currentAvatarUrl={combinedUser.avatarUrl}
              onAvatarChange={(url) => handleAvatarUpload(url)}
              size="sm"
              status={combinedUser.status}
            />
            <div className="grid gap-1">
              <p className="text-sm font-medium">{currentUserProfile.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentUserProfile.email}
              </p>
              <div className="flex items-center mt-1">
                <span className={`
                  h-2 w-2 rounded-full mr-1
                  ${currentUserProfile.status === 'online' ? 'bg-emerald-500' :
                    currentUserProfile.status === 'away' ? 'bg-amber-500' :
                      currentUserProfile.status === 'busy' ? 'bg-rose-500' :
                        'bg-gray-400'}
                `} />
                <span className="text-xs capitalize">{currentUserProfile.status}</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/avatar-demo">
                <Settings className="h-4 w-4" />
                <span>Avatar Demo</span>
              </Link>
            </Button>
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/floor-plan-test/components">
                <Settings className="h-4 w-4" />
                <span>Modern Components Demo</span>
              </Link>
            </Button>
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/floor-plan-test">
                <Settings className="h-4 w-4" />
                <span>Compare old/modern</span>
              </Link>
            </Button>
            <Button variant="ghost" className="flex items-center justify-start gap-2 h-9" asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="flex items-center justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-9"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="h-4 w-4" />
              <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
