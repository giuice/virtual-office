// components/floor-plan/user-avatar.tsx
import { UIUser as User } from './types'
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { MessageSquare, Phone } from 'lucide-react'

interface UserAvatarProps {
  user: User
}

export function UserAvatar({ user }: UserAvatarProps) {
  // Convert UIUser to format compatible with EnhancedAvatarV2
  const avatarUser = {
    id: user.id.toString(),
    displayName: user.name,
    avatarUrl: user.avatar,
    status: user.status === 'active' ? 'online' : 'offline'
  };

  return (
    <Popover>
      <PopoverTrigger>
        <EnhancedAvatarV2
          user={avatarUser}
          size="sm"
          showStatus={true}
          className="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
        />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <EnhancedAvatarV2
              user={avatarUser}
              size="md"
              showStatus={true}
            />
            <div>
              <h4 className="font-medium">{user.name}</h4>
              <p className="text-sm text-gray-500">{user.activity}</p>
            </div>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <MessageSquare className="h-4 w-4 mr-1" />
              Message
            </Button>
            <Button size="sm" variant="outline">
              <Phone className="h-4 w-4 mr-1" />
              Call
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}