// src/components/floor-plan/index.tsx
'use client'

import { useState, useMemo } from 'react' // Added useMemo
import { Space as LocalSpace, UIUser as User,  spaceColors, userStatusColors } from './types'
// Import the database Space type and adapter functions
import { Space as DBSpace, SpaceType } from '@/types/database'
import { dbSpaceToUISpace } from '@/lib/type-adapters'
import { useSpaces } from '@/hooks/queries/useSpaces'; // Added useSpaces import
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Monitor, Video, MessageSquare, Coffee, Zap } from 'lucide-react'
//import { RoomTooltip } from './room-tooltip'
import { FloorTooltip } from './floor-tooltip'
import { RoomDialog } from './room-dialog/index'
import { UserHoverCard } from './user-hover-card'
import { MessageDialog } from './message-dialog'
import { getAvatarUrl } from '@/lib/avatar-utils'
import { StatusAvatar } from '@/components/ui/status-avatar'

interface FloorPlanProps {
  companyId: string; // Changed companyName to companyId
  onlineUsers: number;
  activeMeetings: number;
  pendingMessages: number;
}

export function FloorPlan({
  companyId, // Changed companyName to companyId
  onlineUsers,
  activeMeetings,
  pendingMessages
}: FloorPlanProps) {
  // Fetch spaces using React Query
  const { data: dbSpaces, isLoading, isError, error } = useSpaces(companyId);

  const [selectedRoom, setSelectedRoom] = useState<LocalSpace | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
  const [hoveredUser, setHoveredUser] = useState<User | null>(null);

  // For direct messaging
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);

  // Convert DBSpaces to LocalSpaces using useMemo for optimization
  const spaces: LocalSpace[] = useMemo(() => {
    if (!dbSpaces) return [];
    return dbSpaces.map(dbSpace => dbSpaceToUISpace(dbSpace));
  }, [dbSpaces]);

  // Function to handle room creation - kept for backward compatibility
  const handleCreateRoom = (newRoomData: Partial<DBSpace>) => {
    console.log('Create room:', newRoomData);
    // This would typically call an API to create the room
    // Now handled by useCreateSpace hook in RoomDialog
  };

  // Helper function to get color based on room type
  const getRoomColor = (type: LocalSpace['type']) => {
    return spaceColors[type] || spaceColors.default;
  }

  // Helper function to get color based on user status
  const getUserStatusColor = (status: User['status']) => {
    return userStatusColors[status] || userStatusColors.default;
  }

  // Function to handle room click - Simplified
  const handleRoomClick = (room: LocalSpace) => {
    setSelectedRoom(room);
    setIsRoomDialogOpen(true);
  }

  // Function to handle messaging a user
  const handleMessageUser = (e: React.MouseEvent, user: User) => {
    e.stopPropagation(); // Prevent triggering the room click
    setSelectedUser(user);
    setIsMessageDialogOpen(true);
  }

  // Handle loading and error states
  if (isLoading) {
    return <div className="p-4 text-center">Loading floor plan...</div>;
  }

  if (isError) {
    return <div className="p-4 text-center text-red-500">Error loading floor plan: {error?.message}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Online</span>
              </div>
              <span className="text-2xl font-bold">{onlineUsers}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Meetings</span>
              </div>
              <span className="text-2xl font-bold">{activeMeetings}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Messages</span>
              </div>
              <span className="text-2xl font-bold">{pendingMessages}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Floor Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Office Floor Plan</CardTitle>
            <Badge variant="outline">Live View</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[500px] bg-accent rounded-lg overflow-hidden">
            <svg viewBox="0 0 800 600" className="w-full h-full">
              {/* Grid Pattern */}
              <pattern
                id="grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.05"
                  strokeWidth="1"
                />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* Rooms */}
              {spaces.map(space => {
                const { color, lightColor } = getRoomColor(space.type);
                return (
                  <FloorTooltip content={{ type: 'space', data: space }} key={space.id}>
                    <g
                      onClick={() => handleRoomClick(space)}
                      className="cursor-pointer transition-transform hover:scale-[1.02]"
                    >
                      <rect
                        x={space.position.x}
                        y={space.position.y}
                        width={space.position.width}
                        height={space.position.height}
                        className="fill-background dark:fill-gray-800"
                        stroke={color}
                        strokeWidth="2"
                        rx="4"
                      />

                      {/* Room Name */}
                      <text
                        x={space.position.x + 20}
                        y={space.position.y + 30}
                        className="fill-foreground text-sm font-medium"
                      >
                        {space.name}
                      </text>

                      {/* Users in room */}
                      <g transform={`translate(${space.position.x + 20}, ${space.position.y + 50})`}>
                        {space.users.map((user, i) => (
                          <g
                            key={user.id}
                            transform={`translate(${i * 40}, 0)`}
                            onMouseEnter={() => setHoveredUser(user)}
                            onMouseLeave={() => setHoveredUser(null)}
                            className="cursor-pointer group"
                          >
                            {/* Avatar with status color */}
                            <circle
                              cx="15"
                              cy="15"
                              r="16"
                              fill={getUserStatusColor(user.status)}
                            />

                            {/* Clip path for avatar */}
                            <defs>
                              <clipPath id={`avatar-clip-${user.id}`}>
                                <circle cx="15" cy="15" r="14" />
                              </clipPath>
                            </defs>

                            {/* User avatar */}
                            <image
                              href={getAvatarUrl(user)}
                              x="1"
                              y="1"
                              height="28"
                              width="28"
                              clipPath={`url(#avatar-clip-${user.id})`}
                            />

                            {/* Status indicator icons */}
                            {user.status === 'presenting' &&
                              <foreignObject x="18" y="-3" width="16" height="16">
                                <Monitor className="h-4 w-4 text-white bg-blue-500 rounded-full p-0.5" />
                              </foreignObject>
                            }
                            {user.status === 'away' && user.activity.toLowerCase().includes('break') &&
                              <foreignObject x="18" y="-3" width="16" height="16">
                                <Coffee className="h-4 w-4 text-white bg-amber-500 rounded-full p-0.5" />
                              </foreignObject>
                            }

                            {/* Message icon */}
                            <foreignObject x="18" y="18" width="16" height="16" className="opacity-0 group-hover:opacity-100">
                              <div
                                className="bg-background dark:bg-card shadow-sm rounded-full p-0.5 cursor-pointer hover:bg-muted transition-colors"
                                onClick={(e) => handleMessageUser(e, user)}
                              >
                                <MessageSquare className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                              </div>
                            </foreignObject>
                          </g>
                        ))}
                      </g>
                    </g>
                  </FloorTooltip>
                );
              })}
            </svg>
          </div>

          {/* Room status bar */}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground border-t pt-4">
            <div>
              <span>Click on a room to join • </span>
              <span className="text-blue-500 dark:text-blue-400">{spaces.length} rooms available</span>
            </div>
            <Badge variant="outline">
              <Zap className="h-3 w-3 mr-1" />
              Real-time updates
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* User Info Bar */}
      {hoveredUser && (
        <Card className="w-full">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <UserHoverCard user={hoveredUser} />
                <span className="text-sm text-muted-foreground">{hoveredUser.activity}</span>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {onlineUsers} Online
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room Dialog */}
      <RoomDialog
        room={selectedRoom as any}
        open={isRoomDialogOpen}
        onOpenChange={setIsRoomDialogOpen}
        onCreate={handleCreateRoom} // Kept for backward compatibility
        companyId={companyId} // Added companyId prop
      />

      {/* Message Dialog */}
      <MessageDialog
        user={selectedUser}
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
      />
    </div>
  )
}