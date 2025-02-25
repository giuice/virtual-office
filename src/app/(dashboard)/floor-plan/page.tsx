// src/app/(dashboard)/floor-plan/page.tsx
'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { FloorPlan } from '@/components/floor-plan'
import { Minimap } from '@/components/floor-plan/minimap'
import { Space, Announcement } from '@/components/floor-plan/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function FloorPlanPage() {
  // State for selected room
  const [selectedRoom, setSelectedRoom] = useState<Space | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);

  // Demo company data
  const companyName = "TechCorp"
  const onlineUsers = 24
  const activeMeetings = 3
  const pendingMessages = 5

  // Demo spaces data with proper typing
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
  const announcements: Announcement[] = [
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

  // Handle room selection from minimap
  const handleRoomSelect = (room: Space) => {
    setSelectedRoom(room);
    setIsRoomDialogOpen(true);
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{companyName} Virtual Office</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="space-y-4">
            {/* Main Floor Plan */}
            <FloorPlan 
              spaces={spaces}
              companyName={companyName}
              onlineUsers={onlineUsers}
              activeMeetings={activeMeetings}
              pendingMessages={pendingMessages}
            />
          </div>
          
          {/* Sidebar */}
          <div className="space-y-4">
            {/* Minimap */}
            <Minimap 
              spaces={spaces} 
              onRoomSelect={handleRoomSelect} 
            />
            
            {/* Tabs for Announcements and Online Users */}
            <Card>
              <Tabs defaultValue="announcements">
                <CardHeader className="pb-0">
                  <TabsList className="w-full">
                    <TabsTrigger value="announcements" className="flex-1">Announcements</TabsTrigger>
                    <TabsTrigger value="online" className="flex-1">Online Users</TabsTrigger>
                  </TabsList>
                </CardHeader>
                
                <CardContent className="pt-4">
                  <TabsContent value="announcements">
                    <div className="space-y-4">
                      {announcements.map(announcement => (
                        <div key={announcement.id} className="flex items-start space-x-3">
                          <Avatar>
                            <AvatarImage src={announcement.avatar} alt={announcement.author} />
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
                  </TabsContent>
                  
                  <TabsContent value="online">
                    <div className="space-y-2">
                      {spaces.flatMap(space => space.users).map(user => (
                        <div key={user.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={user.avatar} alt={user.name} />
                                <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
                              </Avatar>
                              <span 
                                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white"
                                style={{ 
                                  backgroundColor: user.status === 'active' 
                                    ? '#22C55E' 
                                    : user.status === 'away' 
                                      ? '#F59E0B' 
                                      : user.status === 'presenting' 
                                        ? '#0EA5E9' 
                                        : '#6B7280'
                                }}
                              ></span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-gray-500">{user.activity}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}