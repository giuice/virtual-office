// src/components/floor-plan/user-hover-card.tsx
'use client'

import { UIUser as User, userStatusColors } from './types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Mic, MicOff, Monitor, Coffee } from 'lucide-react';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';

interface UserHoverCardProps {
  user: User;
}

export function UserHoverCard({ user }: UserHoverCardProps) {
  const getStatusIcon = () => {
    switch (user.status) {
      case 'active':
        return <Mic className="h-3 w-3 mr-1 text-success" />;
      case 'presenting':
        return <Monitor className="h-3 w-3 mr-1 text-primary" />;
      case 'away':
        return user.activity.toLowerCase().includes('break') 
          ? <Coffee className="h-3 w-3 mr-1 text-warning" />
          : <MicOff className="h-3 w-3 mr-1 text-warning" />;
      default:
        return <MicOff className="h-3 w-3 mr-1 text-muted-foreground" />;
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="flex items-center space-x-2 cursor-pointer">
          <Avatar className="h-8 w-8">
            <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
            <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{user.name}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex justify-between space-x-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
            <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1 flex-1">
            <h4 className="text-sm font-semibold">{user.name}</h4>
            <div className="flex items-center">
              <Badge variant="outline" className="mr-2 flex items-center">
                {getStatusIcon()}
                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.activity}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
