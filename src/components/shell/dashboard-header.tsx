// src/components/shell/dashboard-header.tsx
'use client';

import { useState } from 'react';
import { Bell, LogOut, Settings, Home } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { GlobalSearch } from '@/components/search/global-search';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useNotification } from '@/hooks/useNotification';
import { ThemeToggle } from '@/components/theme-toggle';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';
import Link from 'next/link';

interface DashboardHeaderProps {
  heading?: string;
  description?: string;
}

export function DashboardHeader({ heading, description }: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccess } = useNotification();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      showSuccess({ description: 'Successfully signed out!' });
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  // Get user initials for avatar fallback
  const getUserDisplayName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const isDashboardPage = pathname === '/dashboard';

  return (
    <div className="border-b bg-background">
      <div className="flex h-16 items-center px-4 container">
        <div className="mr-8 flex items-center gap-2">
          <div className="hidden md:flex">
            {isDashboardPage ? (
              <h2 className="text-lg font-semibold">Virtual Office</h2>
            ) : (
              <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold hover:text-primary">
                <Home className="h-5 w-5" />
                <span>Virtual Office</span>
              </Link>
            )}
          </div>
        </div>
        
        <div className="flex-1 md:max-w-md lg:max-w-lg">
          <GlobalSearch />
        </div>
        
        <div className="ml-auto flex items-center gap-4">
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
          </Button>
          
          {/* User Menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarImage 
                    src={user?.photoURL || getAvatarUrl({ name: getUserDisplayName(), avatar: '' })} 
                    alt="User avatar" 
                  />
                  <AvatarFallback>{getUserInitials(getUserDisplayName())}</AvatarFallback>
                </Avatar>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="grid gap-4">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage 
                      src={user?.photoURL || getAvatarUrl({ name: getUserDisplayName(), avatar: '' })} 
                      alt="User avatar" 
                    />
                    <AvatarFallback>{getUserInitials(getUserDisplayName())}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{getUserDisplayName()}</p>
                    <p className="text-xs text-muted-foreground">{user?.email || 'No email'}</p>
                  </div>
                </div>
                <Separator />
                <Button variant="ghost" className="flex items-center justify-start gap-2" asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex items-center justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" 
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  <LogOut className="h-4 w-4" />
                  <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      {(heading || description) && (
        <div className="container py-4">
          {heading && <h1 className="text-2xl font-bold">{heading}</h1>}
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      )}
    </div>
  );
}