// components/floor-plan/floor-plan.tsx
'use client'

import { useState } from 'react'
import { Space, User } from './types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Monitor, Video, MessageSquare } from 'lucide-react'
import { RoomDialog } from './room-dialog'
import { RoomTooltip } from './room-tooltip'
import { UserHoverCard } from './user-hover-card' // We'll create this

// Keep your existing demoSpaces data...
// Sample data
const demoSpaces: Space[] = [
  {
    id: 'dev-team-1',
    name: 'Development Team Area',
    type: 'workspace',
    status: 'active',
    position: { x: 100, y: 100, width: 300, height: 200 },
    capacity: 8,
    features: ['screens', 'whiteboard'],
    users: [
      {
        id: 1,
        name: 'John Dev',
        status: 'active',
        avatar: '/api/placeholder/32/32',
        activity: 'Coding'
      },
      {
        id: 2,
        name: 'Sarah Tech',
        status: 'active',
        avatar: '/api/placeholder/32/32',
        activity: 'In meeting'
      }
    ]
  },
  {
    id: 'meeting-room-1',
    name: 'Main Conference Room',
    type: 'conference',
    status: 'active',
    position: { x: 450, y: 100, width: 250, height: 150 },
    capacity: 12,
    features: ['video', 'screen-sharing', 'whiteboard'],
    users: [
      {
        id: 3,
        name: 'Alice Manager',
        status: 'presenting',
        avatar: '/api/placeholder/32/32',
        activity: 'Presenting'
      },
      {
        id: 4,
        name: 'Bob Analyst',
        status: 'viewing',
        avatar: '/api/placeholder/32/32',
        activity: 'Viewing presentation'
      }
    ]
  },
  {
    id: 'break-room',
    name: 'Break Room',
    type: 'social',
    status: 'available',
    position: { x: 100, y: 350, width: 200, height: 150 },
    capacity: 6,
    features: ['coffee', 'snacks'],
    users: []
  }
]

export function FloorPlan() {
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [hoveredUser, setHoveredUser] = useState<User | null>(null)

  return (
    <div className="space-y-4">
      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Online Users</span>
              </div>
              <span className="text-2xl font-bold">24</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Video className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Active Meetings</span>
              </div>
              <span className="text-2xl font-bold">3</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Messages</span>
              </div>
              <span className="text-2xl font-bold">5</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Floor Plan Card */}
      <Card className="w-full">
        {/* Your existing CardHeader and floor plan SVG... */}
      </Card>

      {/* User Info Bar */}
      <Card className="w-full">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {hoveredUser ? (
                <>
                  <UserHoverCard user={hoveredUser} />
                  <span className="text-sm text-gray-500">{hoveredUser.activity}</span>
                </>
              ) : (
                <span className="text-sm text-gray-500">Hover over a user to see details</span>
              )}
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              24 Online
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}