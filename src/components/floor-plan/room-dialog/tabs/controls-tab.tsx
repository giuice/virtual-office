// src/components/floor-plan/room-dialog/tabs/controls-tab.tsx
'use client'

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Lock, Mic, MicOff, Monitor, Unlock } from 'lucide-react';
export interface RoomControlState {
  micActive: boolean;
  screenSharing: boolean;
  locked: boolean;
  admin?: boolean;
}

export interface RoomControlActions {
  setIsMicActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScreenSharing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRoomLocked: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ControlsTabProps {
  controls: RoomControlState;
  actions: RoomControlActions;
}

export function ControlsTab({
  controls,
  actions
}: ControlsTabProps) {
  const { micActive, screenSharing, locked, admin = false } = controls;
  const { setIsMicActive, setIsScreenSharing, setIsRoomLocked } = actions;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {micActive ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          <span>Microphone</span>
        </div>
        <Button 
          variant={micActive ? "default" : "outline"}
          onClick={() => setIsMicActive(!micActive)}
        >
          {micActive ? "Active" : "Muted"}
        </Button>
      </div>
      
      <Separator />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="size-4" />
          <span>Screen Sharing</span>
        </div>
        <Button 
          variant={screenSharing ? "default" : "outline"}
          onClick={() => setIsScreenSharing(!screenSharing)}
        >
          {screenSharing ? "Sharing" : "Share Screen"}
        </Button>
      </div>
      
      {/* Room locking is admin-only */}
      {admin && (
        <>
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              <span>Room Access</span>
            </div>
            <Button 
              variant={locked ? "destructive" : "outline"}
              onClick={() => setIsRoomLocked(!locked)}
            >
              {locked ? "Locked" : "Unlocked"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
