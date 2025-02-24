// components/floor-plan/room-dialog.tsx
import { Space } from './types'
import { UserAvatar } from './user-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface RoomDialogProps {
  room: Space | null
  onClose: () => void
}

export function RoomDialog({ room, onClose }: RoomDialogProps) {
  if (!room) return null

  return (
    <Dialog open={!!room} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{room.name}</DialogTitle>
          <DialogDescription>
            {room.type} • {room.status}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Current Users</h4>
            <div className="flex flex-wrap gap-2">
              {room.users.map(user => (
                <UserAvatar key={user.id} user={user} />
              ))}
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Features</h4>
            <div className="flex gap-2">
              {room.features.map(feature => (
                <Badge key={feature} variant="secondary">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button>
              Join Room
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}