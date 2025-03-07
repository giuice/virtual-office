// src/components/floor-plan/room-tooltip.tsx
'use client'

import { Space } from './types'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip'
import { Users, Lock } from 'lucide-react'
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';

interface RoomTooltipProps {
  room: Space
  children: React.ReactNode
}

export function RoomTooltip({ room, children }: RoomTooltipProps) {
  // Get badge variant based on room status
  const getBadgeVariant = (status: Space['status']) => {
    switch (status) {
      case 'active': return 'default';
      case 'available': return 'outline';
      case 'maintenance': return 'destructive';
      case 'locked': return 'secondary';
      default: return 'outline';
    }
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-background dark:bg-gray-800 p-4 shadow-lg rounded-lg border max-w-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-base">{room.name}</h4>
              <Badge variant={getBadgeVariant(room.status)}>
                {room.status === 'locked' && <Lock className="h-3 w-3 mr-1" />}
                {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{room.users.length}/{room.capacity} people</span>
            </div>
            
            {room.features.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {room.features.map((feature, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            )}
            
            {room.users.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">People in this room:</p>
                <div className="flex flex-col gap-2">
                  {room.users.map(user => (
                    <div key={user.id} className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
                        <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.activity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}