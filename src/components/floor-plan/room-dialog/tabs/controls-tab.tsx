// src/components/floor-plan/room-dialog/tabs/controls-tab.tsx
'use client'

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Lock, Mic, MicOff, Monitor, Unlock } from 'lucide-react';
import { RoomControlsProps } from '../types';

export function ControlsTab({
  isMicActive,
  setIsMicActive,
  isScreenSharing,
  setIsScreenSharing,
  isRoomLocked,
  setIsRoomLocked
}: RoomControlsProps) {
  return (
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
  );
}