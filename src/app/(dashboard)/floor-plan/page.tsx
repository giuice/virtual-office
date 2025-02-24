'use client'

import { DashboardShell } from '@/components/shell'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { FloorPlan } from '@/components/floor-plan'
import { Space, Announcement } from '@/components/floor-plan/types'

export default function FloorPlanPage() {
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

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">{companyName} Virtual Office</h1>
          
          {/* Use our improved FloorPlan component */}
          <FloorPlan 
            spaces={spaces}
            companyName={companyName}
            onlineUsers={onlineUsers}
            activeMeetings={activeMeetings}
            pendingMessages={pendingMessages}
          />
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
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}