// components/floor-plan/room-dialog.tsx
'use client'

import { useState } from 'react'
import { Space, User } from './types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Mic, MicOff, Monitor, MessageSquare, Users, Lock, Unlock } from 'lucide-react'

interface RoomDialogProps {
  room: Space | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoomDialog({ room, open, onOpenChange }: RoomDialogProps) {
  const [isMicActive, setIsMicActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRoomLocked, setIsRoomLocked] = useState(false)

  if (!room) return null

  // Helper function to get type label
  const getRoomTypeLabel = (type: Space['type']) => {
    switch (type) {
      case 'workspace': return 'Workspace';
      case 'conference': return 'Conference Room';
      case 'social': return 'Social Space';
      case 'breakout': return 'Breakout Room';
      default: return 'Room';
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{room.name}</DialogTitle>
            <Badge>{getRoomTypeLabel(room.type)}</Badge>
          </div>
          <DialogDescription>
            {room.features.join(' • ')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="people" className="mt-2">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="people">People ({room.users.length})</TabsTrigger>
            <TabsTrigger value="controls">Room Controls</TabsTrigger>
          </TabsList>
          
          <TabsContent value="people" className="mt-4">
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <div className="space-y-4">
                {room.users.map(user => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.activity}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.status === 'presenting' && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Monitor className="h-3 w-3" />
                          <span>Presenting</span>
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {room.users.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center text-gray-500">
                    <Users className="h-10 w-10 mb-2 opacity-20" />
                    <p>No one is in this room yet</p>
                    <p className="text-sm">Be the first to join!</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="controls" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isMicActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  <span>Microphone</span>
                </div>
                <Button 
                  variant={isMicActive ? "default" : "outline"}
                  onClick={() => setIsMicActive(!isMicActive)}
                >
                  {isMicActive ? "Active" : "Muted"}
                </Button>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  <span>Screen Sharing</span>
                </div>
                <Button 
                  variant={isScreenSharing ? "default" : "outline"}
                  onClick={() => setIsScreenSharing(!isScreenSharing)}
                >
                  {isScreenSharing ? "Sharing" : "Share Screen"}
                </Button>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isRoomLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  <span>Room Access</span>
                </div>
                <Button 
                  variant={isRoomLocked ? "destructive" : "outline"}
                  onClick={() => setIsRoomLocked(!isRoomLocked)}
                >
                  {isRoomLocked ? "Locked" : "Unlocked"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-gray-500">
            <span>{room.users.length}/{room.capacity} people</span>
          </div>
          <Button type="submit" onClick={() => onOpenChange(false)}>
            Join Room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}