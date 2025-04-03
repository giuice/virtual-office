// src/components/floor-plan/room-dialog/index.tsx
'use client'

import { useState, useEffect } from 'react';
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

// Define the type for the creation payload based on the hook
type SpaceCreateData = Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>;
// Define the type for the update payload based on the hook
type SpaceUpdateData = Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>>;


export function RoomDialog({
  room,
  open,
  onOpenChange,
  // onCreate, // Removed onCreate prop
  // onUpdate, // Removed onUpdate prop - handled by mutation hook now
  isCreating = false,
  companyId // Added companyId prop
}: RoomDialogProps & { companyId: string }) { // Remove onUpdate from props if no longer needed externally
  // Room state - Use global Space type
  const [roomData, setRoomData] = useState<Partial<Space>>({
    id: '',
    name: '',
    type: 'workspace',
    status: 'available',
    capacity: 4,
    features: [],
    position: { x: 100, y: 100, width: 200, height: 150 },
    userIds: [],
    description: '',
    accessControl: { isPublic: true },
    reservations: []
  });

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formValid, setFormValid] = useState(false);

  // UI state
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);

  // For direct messaging
  const [messageUser, setMessageUser] = useState<LocalUser | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);

  const { showSuccess, showError } = useNotification();
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace(); // Call the update hook

  // Initialize form with room data if editing
  useEffect(() => {
    if (room && !isCreating) {
      setRoomData({
        ...room,
        userIds: room.userIds || [],
        accessControl: room.accessControl || { isPublic: true },
        reservations: room.reservations || []
      });
      setIsRoomLocked(room.status === 'locked');
    } else {
      // Reset form for new room
      setRoomData({
        name: '',
        type: 'workspace',
        status: 'available',
        capacity: 4,
        features: [],
        position: { x: 100, y: 100, width: 200, height: 150 },
        userIds: [],
        description: '',
        accessControl: { isPublic: true },
        reservations: []
      });
      setIsRoomLocked(false);
    }
  }, [room, isCreating]);

  // Validate form
  useEffect(() => {
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

    setErrors(newErrors);
    setFormValid(Object.keys(newErrors).length === 0);
  }, [roomData]);

  // Handle sending a direct message to a user
  const handleMessageUser = (user: LocalUser) => {
    setMessageUser(user);
    setIsMessageDialogOpen(true);
  };

  // Join room function (mock implementation)
  const handleJoinRoom = () => {
    console.log(`Joining room: ${roomData.id}`);
    // Here you would implement actual room joining logic with Socket.io
    onOpenChange(false);
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
        userIds: roomData.userIds || [],
        description: roomData.description,
        accessControl: roomData.accessControl || { isPublic: true },
        isTemplate: roomData.isTemplate || false,
        templateName: roomData.templateName,
      };
      createSpace.mutate(createPayload, {
        onSuccess: () => {
          showSuccess({ description: "Room created successfully." });
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
        position: roomData.position,
        userIds: roomData.userIds, // Assuming userIds might be updated here, otherwise handle separately
        description: roomData.description,
        accessControl: roomData.accessControl,
        isTemplate: roomData.isTemplate,
        templateName: roomData.templateName,
      };
      updateSpace.mutate({ id: roomData.id, updates: updatePayload }, {
        onSuccess: () => {
          showSuccess({ description: "Room updated successfully." });
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
              initialRoomData={room || undefined} // Handle null case by converting to undefined
              isMicActive={isMicActive}
              setIsMicActive={setIsMicActive}
              isScreenSharing={isScreenSharing}
              setIsScreenSharing={setIsScreenSharing}
              isRoomLocked={isRoomLocked}
              setIsRoomLocked={setIsRoomLocked}
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