// src/components/floor-plan/user-hover-card.tsx
'use client';

import { User, userStatusColors } from './types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Mic, MicOff, Monitor, Coffee, Video } from 'lucide-react';
import { getAvatarUrl, getUserInitials, getUserColor } from '@/lib/avatar-utils';

interface UserHoverCardProps {
  user: User;
}

export function UserHoverCard({ user }: UserHoverCardProps) {
  const getStatusIcon = () => {
    switch (user.status) {
      case 'active':
        return <Mic className="h-4 w-4 text-green-500" />;
      case 'presenting':
        return <Monitor className="h-4 w-4 text-blue-500" />;
      case 'viewing':
        return <Video className="h-4 w-4 text-purple-500" />;
      case 'away':
        return user.activity.toLowerCase().includes('break') 
          ? <Coffee className="h-4 w-4 text-amber-500" />
          : <MicOff className="h-4 w-4 text-gray-500" />;
      default:
        return <MicOff className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="flex items-center space-x-2 cursor-pointer group">
          <div className="relative">
            <Avatar className="h-8 w-8 transition-all group-hover:ring-2 group-hover:ring-primary">
              <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
              <AvatarFallback className={getUserColor(user.name)}>
                {getUserInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div 
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background transition-all group-hover:scale-110"
              style={{ backgroundColor: userStatusColors[user.status] || userStatusColors.default }}
            />
          </div>
          <span className="font-medium">{user.name}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex space-x-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
            <AvatarFallback className={getUserColor(user.name)}>
              {getUserInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2 flex-1">
            <h4 className="text-sm font-semibold">{user.name}</h4>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="flex items-center gap-1"
                style={{ borderColor: userStatusColors[user.status] }}
              >
                {getStatusIcon()}
                <span style={{ color: userStatusColors[user.status] }}>
                  {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                </span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.activity}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}