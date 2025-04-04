// src/components/floor-plan/konva-user-avatar.tsx
import {  User } from '@/types/database';
import { Circle, Group, Text } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';

interface KonvaUserAvatarProps {
  user: User;
  x: number;
  y: number;
  size?: number;
  onClick?: (user: User) => void;
  onMouseEnter?: (e: KonvaEventObject<MouseEvent>, user: User) => void;
  onMouseLeave?: (e: KonvaEventObject<MouseEvent>) => void;
}

export function KonvaUserAvatar({
  user,
  x,
  y,
  size = 10,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: KonvaUserAvatarProps) {
  // Get initials for the avatar
  const initials = user.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : '';
  
  // Define colors based on user status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#10b981'; // Green for online
      case 'busy':
        return '#ef4444';   // Red for busy
      case 'away':
        return '#f59e0b';  // Orange for away
      default:
        return '#6b7280'; // Gray for offline
    }
  };

  // Define avatar background color - use a light color
  const getAvatarColor = (name: string) => {
    console.log(name);

    // Simple hash function to generate a consistent color based on name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to hex color - using pastel colors
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 80%)`;
  };

  const statusColor = getStatusColor(user.status);
  const avatarColor = getAvatarColor(user.displayName);
  
  return (
    <Group
      x={x}
      y={y}
      onClick={() => onClick?.(user)}
      onMouseEnter={(e) => onMouseEnter?.(e, user)}
      onMouseLeave={onMouseLeave}
      onTap={() => onClick?.(user)}
    >
      {/* Main avatar circle with border */}
      <Circle
        radius={size}
        fill={avatarColor}
        stroke="white"
        strokeWidth={1.5}
      />
      
      {/* Initials */}
      <Text
        text={initials}
        fontSize={size * 0.8}
        fontFamily="'Inter', sans-serif"
        fill="#1f2937" // Dark text for contrast
        align="center"
        verticalAlign="middle"
        width={size * 2}
        height={size * 2}
        offsetX={size}
        offsetY={size}
      />
      
      {/* Status indicator */}
      <Circle
        radius={size / 3}
        fill={statusColor}
        stroke="white"
        strokeWidth={1}
        x={size * 0.8}
        y={size * 0.8}
      />
    </Group>
  );
}
