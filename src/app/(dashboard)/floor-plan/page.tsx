// app/(dashboard)/floor-plan/page.tsx
'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/shell'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Users, Monitor, Video, MessageSquare, Coffee, Zap } from 'lucide-react'
import { RoomTooltip } from '@/components/floor-plan/room-tooltip'
import { RoomDialog } from '@/components/floor-plan/room-dialog'
import { Space, User } from '@/components/floor-plan/types'

export default function FloorPlanPage() {
  const [selectedRoom, setSelectedRoom] = useState<Space | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
  // Demo company data
  const companyName = "TechCorp"
  const onlineUsers = 24
  const activeMeetings = 3
  const pendingMessages = 5

  // Demo spaces data with updated structure to match types
  const spaces: Space[] = [
    {
      id: 'dev-team',
      name: 'Development Team',
      type: 'workspace',
      status: 'active',
      capacity: 8,
      features: ['Whiteboards', 'Multiple monitors'],
      position: { x: 100, y: 100, width: 300, height: 180 },
      users: [
        { id: 1, name: 'John Developer', avatar: '/api/placeholder/32/32', status: 'active', activity: 'Coding' },
        { id: 2, name: 'Sarah Coder', avatar: '/api/placeholder/32/32', status: 'active', activity: 'Code review' },
        { id: 3, name: 'Mike Engineer', avatar: '/api/placeholder/32/32', status: 'away', activity: 'In meeting' }
      ]
    },
    {
      id: 'main-conf',
      name: 'Main Conference Room',
      type: 'conference',
      status: 'active',
      capacity: 12,
      features: ['Video conferencing', 'Presentation screen'],
      position: { x: 450, y: 100, width: 250, height: 150 },
      users: [
        { id: 4, name: 'Alice Manager', avatar: '/api/placeholder/32/32', status: 'presenting', activity: 'Sprint review' },
        { id: 5, name: 'Bob Analyst', avatar: '/api/placeholder/32/32', status: 'viewing', activity: 'Taking notes' }
      ]
    },
    {
      id: 'break-room',
      name: 'Break Room',
      type: 'social',
      status: 'available',
      capacity: 15,
      features: ['Coffee machine', 'Snacks', 'Games'],
      position: { x: 100, y: 320, width: 200, height: 150 },
      users: [
        { id: 6, name: 'Carol Designer', avatar: '/api/placeholder/32/32', status: 'away', activity: 'Coffee break' }
      ]
    },
    {
      id: 'marketing',
      name: 'Marketing Team',
      type: 'workspace',
      status: 'active',
      capacity: 6,
      features: ['Collaboration boards', 'Creative space'],
      position: { x: 450, y: 320, width: 250, height: 150 },
      users: [
        { id: 7, name: 'Dave Marketing', avatar: '/api/placeholder/32/32', status: 'active', activity: 'Campaign planning' },
        { id: 8, name: 'Ellen Content', avatar: '/api/placeholder/32/32', status: 'away', activity: 'Meeting with client' }
      ]
    }
  ]

  // Demo announcements
  const announcements = [
    {
      id: 1,
      author: 'Jennifer Smith',
      role: 'CEO',
      avatar: '/api/placeholder/32/32',
      message: 'All-hands meeting tomorrow at 10 AM in the Main Conference Room',
      time: '2 hours ago'
    },
    {
      id: 2,
      author: 'HR Team',
      role: 'Human Resources',
      avatar: '/api/placeholder/32/32',
      message: 'Remember to complete your quarterly reviews by end of week',
      time: '4 hours ago'
    },
    {
      id: 3,
      author: 'IT Department',
      role: 'Support',
      avatar: '/api/placeholder/32/32',
      message: 'System maintenance scheduled for Saturday 10 PM - 2 AM',
      time: 'Yesterday'
    }
  ]

  // Helper function to get color based on room type
  const getRoomColor = (type: Space['type']) => {
    switch (type) {
      case 'workspace': return { color: '#22C55E', lightColor: '#F0FDF4' };
      case 'conference': return { color: '#0EA5E9', lightColor: '#E5F6FD' };
      case 'social': return { color: '#F59E0B', lightColor: '#FEF3C7' };
      case 'breakout': return { color: '#8B5CF6', lightColor: '#F3E8FF' };
      default: return { color: '#6B7280', lightColor: '#F3F4F6' };
    }
  }

  // Helper function to get color based on user status
  const getUserStatusColor = (status: User['status']) => {
    switch (status) {
      case 'presenting': return '#0EA5E9';
      case 'active': return '#22C55E';
      case 'away': return '#F59E0B';
      case 'viewing': return '#8B5CF6';
      default: return '#6B7280';
    }
  }

  // Function to handle room click
  const handleRoomClick = (room: Space) => {
    setSelectedRoom(room);
    setIsRoomDialogOpen(true);
    console.log(`Selected room: ${room.id}`);
  }

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">{companyName} Virtual Office</h1>
          
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
                              <g key={user.id} transform={`translate(${i * 40}, 0)`}>
                                <circle
                                  cx="15"
                                  cy="15"
                                  r="15"
                                  fill={getUserStatusColor(user.status)}
                                />
                                
                                {/* Status icons */}
                                {user.status === 'presenting' && 
                                  <Monitor x="8" y="8" className="w-14 h-14 text-white opacity-50" />}
                                {user.status === 'away' && user.activity.toLowerCase().includes('break') && 
                                  <Coffee x="8" y="8" className="w-14 h-14 text-white opacity-50" />}
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
        </div>
        
        {/* Sidebar - Announcements */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Company Updates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {announcements.map(announcement => (
                  <div key={announcement.id} className="flex items-start space-x-3">
                    <Avatar>
                      <AvatarImage src={announcement.avatar} />
                      <AvatarFallback>{announcement.author.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{announcement.author}</span>
                        <Badge variant="outline" className="text-xs">{announcement.role}</Badge>
                      </div>
                      <p className="text-sm">{announcement.message}</p>
                      <p className="text-xs text-gray-500">{announcement.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Room Dialog */}
      <RoomDialog 
        room={selectedRoom} 
        open={isRoomDialogOpen} 
        onOpenChange={setIsRoomDialogOpen} 
      />
    </DashboardShell>
  )
}