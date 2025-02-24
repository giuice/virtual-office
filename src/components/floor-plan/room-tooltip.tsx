// components/floor-plan/room-tooltip.tsx
import { Space } from './types'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip'

interface RoomTooltipProps {
  room: Space
  children: React.ReactNode
}

export function RoomTooltip({ room, children }: RoomTooltipProps) {
  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent className="bg-white p-3 shadow-lg rounded-lg border">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{room.name}</h4>
            <Badge variant={room.status === 'active' ? 'success' : 'secondary'}>
              {room.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">
            {room.users.length}/{room.capacity} people
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  )
}