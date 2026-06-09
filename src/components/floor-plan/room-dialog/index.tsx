'use client'

// src/components/floor-plan/room-dialog/index.tsx
import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Space } from '@/types/database';
import { UIUser as LocalUser } from '../types';
import { MessageDialog } from '../message-dialog';
import { RoomDialogProps } from './types';
import { RoomHeader } from './room-header';
import { CreateRoomForm } from './create-room-form';
import { ViewRoomTabs } from './view-room-tabs';
import { useCreateSpace, useUpdateSpace } from '@/hooks/mutations/useSpaceMutations'; // Import useUpdateSpace
import { useNotification } from '@/hooks/useNotification';
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { useAuth } from '@/contexts/AuthContext';

// Define the type for the creation payload based on the hook
type SpaceCreateData = Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>;
// Define the type for the update payload based on the hook
type SpaceUpdateData = Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>>;

function getInitialRoomData(room: Space | null, isCreating: boolean): Partial<Space> {
  if (room && !isCreating) {
    return {
      ...room,
      accessControl: room.accessControl || { isPublic: true },
      reservations: room.reservations || [],
    };
  }

  return {
    name: '',
    type: 'workspace',
    status: 'available',
    capacity: 4,
    features: [],
    position: { x: 100, y: 100, width: 200, height: 150 },
    description: '',
    accessControl: { isPublic: true },
    reservations: [],
  };
}

function validateRoomData(roomData: Partial<Space>): Record<string, string> {
  const newErrors: Record<string, string> = {};

  if (!roomData.name?.trim()) {
    newErrors.name = 'Room name is required';
  } else if (roomData.name.length > 30) {
    newErrors.name = 'Room name must be 30 characters or less';
  }

  if (roomData.capacity && (roomData.capacity < 1 || roomData.capacity > 50)) {
    newErrors.capacity = 'Capacity must be between 1 and 50';
  }

  if (roomData.description && roomData.description.length > 200) {
    newErrors.description = 'Description must be 200 characters or less';
  }

  return newErrors;
}

export function RoomDialog({
  room,
  open,
  onOpenChange,
  // onCreate, // Removed onCreate prop
  // onUpdate, // Removed onUpdate prop - handled by mutation hook now
  isCreating = false,
  companyId, // Added companyId prop
  isAdmin = false // Added isAdmin prop
}: RoomDialogProps & { companyId: string }) { // Remove onUpdate from props if no longer needed externally
  const { user } = useAuth();
  const previousRoomInput = useRef({ room, isCreating });
  // Room state - Use global Space type
  const [roomData, setRoomData] = useReducerState<Partial<Space>>(() => getInitialRoomData(room, isCreating));

  // UI state
  const [isMicActive, setIsMicActive] = useReducerState(false);
  const [isScreenSharing, setIsScreenSharing] = useReducerState(false);
  const [isRoomLocked, setIsRoomLocked] = useReducerState(false);

  // For direct messaging
  const [messageUser, setMessageUser] = useReducerState<LocalUser | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useReducerState(false);

  const { showSuccess, showError } = useNotification();
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace(); // Call the update hook
  const { currentUserProfile } = useCompany();

  if (previousRoomInput.current.room !== room || previousRoomInput.current.isCreating !== isCreating) {
    previousRoomInput.current = { room, isCreating };
    setRoomData(getInitialRoomData(room, isCreating));
    setIsRoomLocked(room && !isCreating ? room.status === 'locked' : false);
  }

  const errors = validateRoomData(roomData);
  const formValid = Object.keys(errors).length === 0;

  // Handle sending a direct message to a user
  const handleMessageUser = (user: LocalUser) => {
    setMessageUser(user);
    setIsMessageDialogOpen(true);
  };

  // Join room function (mock implementation)
  const handleJoinRoom = () => {
    console.log('Joining room:', roomData.name);
    // TODO: Implement actual room joining logic
    showSuccess({ description: `Joined ${roomData.name}` });
  };

  // Save room function - Use mutation hooks
  const handleSaveRoom = () => {
    // Disable if invalid or either mutation is loading
    if (!formValid || createSpace.isPending || updateSpace.isPending) return;

    // Update room status based on lock state
    const finalStatus = isRoomLocked ? 'locked' : (roomData.status || 'available');

    if (isCreating) {
      // Construct the data object for creation
      const createPayload: SpaceCreateData = {
        companyId: companyId,
        name: roomData.name || 'Untitled Room',
        type: roomData.type || 'workspace',
        status: finalStatus,
        capacity: roomData.capacity || 4,
        features: roomData.features || [],
        position: roomData.position || { x: 100, y: 100, width: 200, height: 150 },
        description: roomData.description,
        accessControl: roomData.accessControl || { isPublic: true },
        isTemplate: roomData.isTemplate || false,
        templateName: roomData.templateName,
        neighborhoodId: roomData.neighborhoodId // Story 3.9 neighborhood assignment
      };
      createSpace.mutate(createPayload, {
        onSuccess: () => {
          showSuccess({ description: "Room created successfully." });
          // React Query invalidates ['spaces'] cache automatically
          onOpenChange(false);
        },
        onError: (error) => {
          showError({ title: "Error", description: `Failed to create room: ${error.message}` });
        },
      });
    } else if (roomData.id) { // Check if we have an ID for update
      // Construct the data object for update
      const updatePayload: SpaceUpdateData = {
        // Only include fields that have changed or are relevant for update
        name: roomData.name,
        type: roomData.type,
        status: finalStatus,
        capacity: roomData.capacity,
        features: roomData.features,
        position: roomData.position, // Assuming userIds might be updated here, otherwise handle separately
        description: roomData.description,
        accessControl: roomData.accessControl,
        isTemplate: roomData.isTemplate,
        templateName: roomData.templateName,
        neighborhoodId: roomData.neighborhoodId, // Story 3.9 neighborhood assignment
      };
      updateSpace.mutate({ id: roomData.id, updates: updatePayload }, {
        onSuccess: () => {
          showSuccess({ description: "Room updated successfully." });
          // React Query invalidates ['spaces'] cache automatically
          onOpenChange(false);
        },
        onError: (error) => {
          showError({ title: "Error", description: `Failed to update room: ${error.message}` });
        },
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <RoomHeader
            name={roomData.name}
            type={roomData.type}
            features={roomData.features}
            isCreating={isCreating}
          />

          {isCreating ? (
            <CreateRoomForm
              roomData={roomData}
              setRoomData={setRoomData}
              errors={errors}
              formValid={formValid}
              onSave={handleSaveRoom}
              onCancel={() => onOpenChange(false)}
              isLoading={createSpace.isPending}
            />
          ) : (
            <ViewRoomTabs
              roomData={roomData}
              setRoomData={setRoomData}
              initialRoomData={room || undefined} // Handle null case by converting to undefined
              controls={{
                micActive: isMicActive,
                screenSharing: isScreenSharing,
                locked: isRoomLocked,
                admin: isAdmin,
              }}
              controlActions={{
                setIsMicActive,
                setIsScreenSharing,
                setIsRoomLocked,
              }}
              handleMessageUser={handleMessageUser}
              handleJoinRoom={handleJoinRoom}
              onSave={handleSaveRoom}
              isSaving={updateSpace.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <MessageDialog
        user={messageUser}
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
      />
    </>
  );
}
