// components/floor-plan/user-avatar.tsx
import { UIUser as User } from './types'
import { EnhancedAvatar } from '@/components/ui/avatar-system'
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
  return (
    <Popover>
      <PopoverTrigger>
        <EnhancedAvatar
          user={user}
          size="sm"
          showStatus={true}
          status={user.status}
          fallbackName={user.name}
          className="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
        />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <EnhancedAvatar
              user={user}
              size="md"
              fallbackName={user.name}
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