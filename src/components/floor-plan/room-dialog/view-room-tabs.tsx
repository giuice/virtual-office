// src/components/floor-plan/room-dialog/view-room-tabs.tsx
'use client'

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Space } from '@/types/database';
import { UIUser as LocalUser } from '../types';
import { PeopleTab } from './tabs/people-tab';
import { ControlsTab } from './tabs/controls-tab';
import { ReservationsTab } from './tabs/reservations-tab';
import { InfoTab } from './tabs/info-tab';
import { getRoomTypeLabel } from './utils';

interface ViewRoomTabsProps {
  roomData: Partial<Space>;
  isMicActive: boolean;
  setIsMicActive: React.Dispatch<React.SetStateAction<boolean>>;
  isScreenSharing: boolean;
  setIsScreenSharing: React.Dispatch<React.SetStateAction<boolean>>;
  isRoomLocked: boolean;
  setIsRoomLocked: React.Dispatch<React.SetStateAction<boolean>>;
  handleMessageUser: (user: LocalUser) => void;
  handleJoinRoom: () => void;
  onSave: () => void; // Added prop for saving changes
  isSaving: boolean; // Added prop for mutation loading state
}

export function ViewRoomTabs({
  roomData,
  isMicActive,
  setIsMicActive,
  isScreenSharing,
  setIsScreenSharing,
  isRoomLocked,
  setIsRoomLocked,
  handleMessageUser,
  handleJoinRoom,
  onSave, // Accept prop
  isSaving // Accept prop
}: ViewRoomTabsProps) {
  // TODO: Determine if any fields have actually changed to enable/disable save button
  const hasChanges = true; // Placeholder - implement change detection logic

  return (
    <div className="mt-4">
      <Tabs defaultValue="people">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="people">People ({roomData.userIds?.length || 0})</TabsTrigger>
          <TabsTrigger value="controls">Room Controls</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="info">Room Info</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="mt-4">
          <PeopleTab
            userIds={roomData.userIds}
            handleMessageUser={handleMessageUser}
          />
        </TabsContent>

        <TabsContent value="controls" className="mt-4">
          <ControlsTab
            isMicActive={isMicActive}
            setIsMicActive={setIsMicActive}
            isScreenSharing={isScreenSharing}
            setIsScreenSharing={setIsScreenSharing}
            isRoomLocked={isRoomLocked}
            setIsRoomLocked={setIsRoomLocked}
          />
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          <ReservationsTab reservations={roomData.reservations} />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <InfoTab
            type={roomData.type}
            capacity={roomData.capacity}
            features={roomData.features}
            description={roomData.description}
            getRoomTypeLabel={getRoomTypeLabel}
            // TODO: Pass setRoomData or individual setters if info is editable here
          />
        </TabsContent>
      </Tabs>

      <DialogFooter className="mt-6 justify-between"> {/* Use justify-between */}
        {/* Left side: Info */}
        <div className="text-sm text-muted-foreground">
          <span>{roomData.userIds?.length || 0}/{roomData.capacity || 4} people</span>
        </div>
        {/* Right side: Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleJoinRoom}> {/* Keep Join Room */}
            Join Room
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving || !hasChanges} // Disable if saving or no changes
          >
            {isSaving ? 'Saving...' : 'Save Changes'} {/* Show loading text */}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}