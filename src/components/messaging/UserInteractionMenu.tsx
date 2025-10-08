// src/components/messaging/UserInteractionMenu.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare,
  Phone,
  PhoneCall,
  MapPin,
  UserCheck,
  UserX,
  Info,
  Mail,
  Calendar,
  Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getUserInitials, getAvatarUrl } from '@/lib/avatar-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { usePresence } from '@/contexts/PresenceContext';
import { User } from '@/types/database';

interface UserInteractionMenuProps {
  user: User;
  children: React.ReactNode;
  onCall?: (userId: string) => void;
  onTeleport?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
  showCallActions?: boolean;
  showTeleportActions?: boolean;
  className?: string;
}

export function UserInteractionMenu({
  user,
  children,
  onCall,
  onTeleport,
  onViewProfile,
  showCallActions = true,
  showTeleportActions = true,
  className,
}: UserInteractionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const { currentUserProfile } = useCompany();
  const { getOrCreateUserConversation, setActiveConversation } = useMessaging();
  const { usersInSpaces } = usePresence();


  // Don't show menu for current user - compare DB IDs
  if (currentUserProfile?.id === user.id) {
    return <>{children}</>;
  }

  // Get user's current location/space
  const getCurrentUserLocation = () => {
    for (const [spaceId, users] of usersInSpaces.entries()) {
      if (users.some(u => u.id === user.id)) {
        return spaceId;
      }
    }
    return null;
  };

  const userLocation = getCurrentUserLocation();
  const avatarSrc = getAvatarUrl(user);
  const initials = getUserInitials(user.displayName || 'User');

  // Status color mapping
  const statusColors = {
    online: 'bg-emerald-500',
    away: 'bg-amber-500', 
    busy: 'bg-rose-500',
    offline: 'bg-gray-400',
  };

  const statusColor = statusColors[user.status as keyof typeof statusColors] || statusColors.offline;

  // Action handlers
  const handleSendMessage = async () => {
    try {
      setIsOpen(false);
      
      // Create or get existing direct conversation
      const conversation = await getOrCreateUserConversation(user.id);
      
      if (conversation) {
        // Set as active conversation to open the messaging interface
        setActiveConversation(conversation);
      }
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  };

  const handleCall = () => {
    setIsOpen(false);
    if (onCall) {
      onCall(user.id);
    }
  };

  const handleTeleportToUser = () => {
    setIsOpen(false);
    if (onTeleport && userLocation) {
      onTeleport(userLocation);
    }
  };

  const handleViewProfile = () => {
    setIsOpen(false);
    if (onViewProfile) {
      onViewProfile(user.id);
    }
  };

  const handleEmailUser = () => {
    setIsOpen(false);
    window.location.href = `mailto:${user.email}`;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
    }}>
      <DropdownMenuTrigger 
        asChild 
        className={className}
        data-avatar-interactive
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {children}
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        className="w-64 p-2 z-[1000]" 
        align="start"
        side="bottom"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        data-avatar-interactive
      >
        {/* User Info Header */}
        <DropdownMenuLabel className="p-0 mb-2">
          <div className="flex items-center space-x-3 p-2 rounded-lg bg-muted/50">
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={avatarSrc} alt={user.displayName} />
                <AvatarFallback className="text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Status indicator */}
              <span
                className={cn(
                  'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background',
                  statusColor
                )}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {user.displayName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs capitalize px-2 py-0",
                    user.status === 'online' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                    user.status === 'away' && "bg-amber-50 text-amber-700 border-amber-200",
                    user.status === 'busy' && "bg-rose-50 text-rose-700 border-rose-200",
                    user.status === 'offline' && "bg-gray-50 text-gray-700 border-gray-200"
                  )}
                >
                  {user.status}
                </Badge>
                
                {userLocation && (
                  <Badge variant="outline" className="text-xs">
                    <MapPin className="h-3 w-3 mr-1" />
                    In Space
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Primary Actions */}
        <DropdownMenuItem 
          onClick={(e) => { e.stopPropagation(); handleSendMessage(); }}
          onSelect={(e) => { e.preventDefault(); }}
          className="cursor-pointer focus:bg-primary/10"
        >
          <MessageSquare className="h-4 w-4 mr-3 text-primary" />
          <div>
            <p className="font-medium">Send Message</p>
            <p className="text-xs text-muted-foreground">Start a conversation</p>
          </div>
        </DropdownMenuItem>

        {/* Call Actions */}
        {showCallActions && user.status !== 'offline' && (
          <>
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); handleCall(); }}
              onSelect={(e) => { e.preventDefault(); }}
              className="cursor-pointer"
              disabled={user.status === 'busy'}
            >
              <Phone className="h-4 w-4 mr-3 text-blue-600" />
              <div>
                <p className="font-medium">Quick Call</p>
                <p className="text-xs text-muted-foreground">
                  {user.status === 'busy' ? 'User is busy' : 'Voice/video call'}
                </p>
              </div>
            </DropdownMenuItem>

            {userLocation && showTeleportActions && (
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); handleTeleportToUser(); }}
                onSelect={(e) => { e.preventDefault(); }}
                className="cursor-pointer"
              >
                <Zap className="h-4 w-4 mr-3 text-purple-600" />
                <div>
                  <p className="font-medium">Join User</p>
                  <p className="text-xs text-muted-foreground">Teleport to their space</p>
                </div>
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />

        {/* Secondary Actions */}
        <DropdownMenuItem 
          onClick={(e) => { e.stopPropagation(); handleEmailUser(); }}
          onSelect={(e) => { e.preventDefault(); }}
          className="cursor-pointer"
        >
          <Mail className="h-4 w-4 mr-3 text-gray-600" />
          <span>Send Email</span>
        </DropdownMenuItem>

        <DropdownMenuItem 
          onClick={(e) => { e.stopPropagation(); handleViewProfile(); }}
          onSelect={(e) => { e.preventDefault(); }}
          className="cursor-pointer"
        >
          <Info className="h-4 w-4 mr-3 text-gray-600" />
          <span>View Profile</span>
        </DropdownMenuItem>

        {/* Future: Calendar integration */}
        <DropdownMenuItem 
          className="cursor-pointer opacity-50"
          disabled
        >
          <Calendar className="h-4 w-4 mr-3 text-gray-400" />
          <span className="text-muted-foreground">Schedule Meeting</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}