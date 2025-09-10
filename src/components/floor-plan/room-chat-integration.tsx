// src/components/floor-plan/room-chat-integration.tsx
// src/components/floor-plan/room-chat-integration.tsx
'use client';

import { useState } from 'react';
import { Space } from '@/types/database'; // Use global Space type
import { RoomMessaging } from '@/components/messaging/room-messaging';

interface RoomChatIntegrationProps {
  selectedRoom: Space | null; // Expect global Space type
  onCloseChat?: () => void;
  position?: 'right' | 'bottom';
}

/**
 * This component integrates the messaging system with the floor plan.
 * It shows a chat panel for the selected room.
 */
export function RoomChatIntegration({
  selectedRoom,
  onCloseChat,
  position = 'right',
}: RoomChatIntegrationProps) {
  const [isMessagingOpen, setIsMessagingOpen] = useState(true);
  
  // Handle closing the messaging panel
  const handleClose = () => {
    setIsMessagingOpen(false);
    if (onCloseChat) {
      onCloseChat();
    }
  };
  
  // If no room is selected, don't render anything
  if (!selectedRoom) {
    return null;
  }
  
  return (
    <RoomMessaging
      roomId={selectedRoom.id}
      roomName={selectedRoom.name}
      isOpen={isMessagingOpen}
      onClose={handleClose}
      position={position}
    />
  );
}
