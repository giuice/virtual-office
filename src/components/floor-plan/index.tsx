// src/components/floor-plan/index.tsx
'use client'

import { useState } from 'react'
import { Space, User, spaceColors, userStatusColors } from './types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Monitor, Video, MessageSquare, Coffee, Zap } from 'lucide-react'
import { RoomTooltip } from './room-tooltip'
import { RoomDialog } from './room-dialog'
import { UserHoverCard } from './user-hover-card'
import { MessageDialog } from './message-dialog'
import { getAvatarUrl } from '@/lib/avatar-utils'

interface FloorPlanProps {
  spaces: Space[];
  companyName: string;
  onlineUsers: number;
  activeMeetings: number;
  pendingMessages: number;
}

export function FloorPlan({ 
  spaces, 
  companyName, 
  onlineUsers, 
  activeMeetings, 
  pendingMessages 
}: FloorPlanProps) {
  const [selectedRoom, setSelectedRoom] = useState<Space | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
  const [hoveredUser, setHoveredUser] = useState<User | null>(null);
  
  // For direct messaging
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);

  // Helper function to get color based on room type
  const getRoomColor = (type: Space['type']) => {
    return spaceColors[type] || spaceColors.default;
  }

  // Helper function to get color based on user status
  const getUserStatusColor = (status: User['status']) => {
    return userStatusColors[status] || userStatusColors.default;
  }

  // Function to handle room click
  const handleRoomClick = (room: Space) => {
    setSelectedRoom(room);
    setIsRoomDialogOpen(true);
  }
  
  // Function to handle messaging a user
  const handleMessageUser = (e: React.MouseEvent, user: User) => {
    e.stopPropagation(); // Prevent triggering the room click
    setSelectedUser(user);
    setIsMessageDialogOpen(true);
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
          <div className="relative w-full h-[500px] bg-gray-50 rounded-lg overflow-hidden">
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
                  stroke="rgba(0,0,0,0.05)"
                  strokeWidth="1"
                />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {/* Rooms */}
              {spaces.map(space => {
                const { color, lightColor } = getRoomColor(space.type);
                return (
                  <RoomTooltip key={space.id} room={space}>
                    <g 
                      onClick={() => handleRoomClick(space)}
                      className="cursor-pointer transition-transform hover:scale-[1.02]"
                    >
                      <rect
                        x={space.position.x}
                        y={space.position.y}
                        width={space.position.width}
                        height={space.position.height}
                        fill={lightColor}
                        stroke={color}
                        strokeWidth="2"
                        rx="4"
                      />
                      
                      {/* Room Name */}
                      <text
                        x={space.position.x + 20}
                        y={space.position.y + 30}
                        fill="#374151"
                        className="text-sm font-medium"
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
                            {/* Avatar background with status color */}
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
                            
                            {/* User avatar - now using our utility function */}
                            <image
                              href={getAvatarUrl(user)}
                              x="1"
                              y="1"
                              height="28"
                              width="28"
                              clipPath={`url(#avatar-clip-${user.id})`}
                            />
                            
                            {/* Status indicator icons (on top of avatar) */}
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
                            
                            {/* Message icon (appears on hover) */}
                            <foreignObject x="18" y="18" width="16" height="16" className="opacity-0 group-hover:opacity-100">
                              <div
                                className="bg-white shadow-sm rounded-full p-0.5 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={(e) => handleMessageUser(e, user)}
                              >
                                <MessageSquare className="h-3 w-3 text-gray-600" />
                              </div>
                            </foreignObject>
                          </g>
                        ))}
                      </g>
                    </g>
                  </RoomTooltip>
                );
              })}
            </svg>
          </div>
          
          {/* Room status bar */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 border-t pt-4">
            <div>
              <span>Click on a room to join • </span>
              <span className="text-blue-500">{spaces.length} rooms available</span>
            </div>
            <Badge variant="outline">
              <Zap className="h-3 w-3 mr-1" />
              Real-time updates
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* User Info Bar - conditionally render when user is hovered */}
      {hoveredUser && (
        <Card className="w-full">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <UserHoverCard user={hoveredUser} />
                <span className="text-sm text-gray-500">{hoveredUser.activity}</span>
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
        room={selectedRoom} 
        open={isRoomDialogOpen} 
        onOpenChange={setIsRoomDialogOpen} 
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