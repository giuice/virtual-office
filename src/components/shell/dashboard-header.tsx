// src/components/shell/dashboard-header.tsx
'use client';

import { Bell, LogOut, Settings, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { GlobalSearch } from '@/components/search/global-search';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useNotification } from '@/hooks/useNotification';

import Link from 'next/link';
import { EnhancedUserMenu } from './enhanced-user-menu';
import { useCompany } from '@/contexts/CompanyContext';
import ThemeSwitcher from '../ui/ThemeSwitcher';


interface DashboardHeaderProps {
  heading?: string;
  description?: string;
}

export function DashboardHeader({ heading, description }: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  const { currentUserProfile } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccess } = useNotification();
  const handleSignOut = async () => {
    try {
      await signOut();
      showSuccess({ description: 'Successfully signed out!' });
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Get user initials for avatar fallback
  const getUserDisplayName = () => {
    if (user?.user_metadata.displayName) return user.user_metadata.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const isDashboardPage = pathname === '/dashboard';

  return (
    <div className="border-b bg-background">
      <div className="flex h-16 items-center px-4 max-w-[1600px] mx-auto">
        <div className="mr-8 flex items-center gap-2">
          <div className="hidden md:flex">
            {isDashboardPage ? (
              <h2 className="text-lg font-semibold">Virtual Office</h2>
            ) : (
              <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold hover:text-primary">
                <Home className="size-5" />
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
          <ThemeSwitcher align="end" side="bottom" />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="size-5" />
            <span className="absolute top-0 right-0 size-2 rounded-full bg-red-500"></span>
          </Button>

          {/* User Menu */}
          
            <EnhancedUserMenu />
        
        </div>
      </div>

      {(heading || description) && (
        <div className="max-w-[1600px] mx-auto p-4">
          {heading && <h1 className="text-2xl font-bold">{heading}</h1>}
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      )}
    </div>
  );
}
