// components/floor-plan/floor-plan.tsx
'use client'

import { useState } from 'react'
import { Space, User } from './types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Monitor, Video } from 'lucide-react'
import { RoomDialog } from './room-dialog'
import { RoomTooltip } from './room-tooltip'

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
  const [users] = useState<User[]>([])  // This would later be populated from real-time data

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Virtual Office</CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {users.length} Online
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Video className="h-4 w-4" />
            2 Meetings
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full h-[600px] bg-gray-50 rounded-lg overflow-hidden">
          <svg 
            viewBox="0 0 800 600" 
            className="w-full h-full"
          >
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
            {demoSpaces.map(space => (
              <RoomTooltip key={space.id} room={space}>
                <g
                  onClick={() => setSelectedSpace(space)}
                  className="cursor-pointer transform transition-transform hover:scale-[1.02]"
                >
                  <rect
                    x={space.position.x}
                    y={space.position.y}
                    width={space.position.width}
                    height={space.position.height}
                    fill={
                      space.type === 'conference' ? '#E5F6FD' :
                      space.type === 'workspace' ? '#F0FDF4' :
                      '#FEF3F2'
                    }
                    stroke={
                      space.type === 'conference' ? '#0EA5E9' :
                      space.type === 'workspace' ? '#22C55E' :
                      '#EF4444'
                    }
                    strokeWidth="2"
                    rx="4"
                  />
                  
                  {/* Room Name */}
                  <text
                    x={space.position.x + 20}
                    y={space.position.y + 30}
                    className="text-sm font-medium"
                  >
                    {space.name}
                  </text>

                  {/* User Avatars */}
                  <g transform={`translate(${space.position.x + 20}, ${space.position.y + 50})`}>
                    {space.users.map((user, i) => (
                      <g key={user.id} transform={`translate(${i * 40}, 0)`}>
                        <circle
                          cx="15"
                          cy="15"
                          r="15"
                          fill={
                            user.status === 'presenting' ? '#0EA5E9' :
                            user.status === 'active' ? '#22C55E' :
                            '#6B7280'
                          }
                        />
                        {user.status === 'presenting' && (
                          <Monitor
                            className="w-4 h-4 text-white"
                            x="13"
                            y="13"
                          />
                        )}
                      </g>
                    ))}
                  </g>
                </g>
              </RoomTooltip>
            ))}
          </svg>
        </div>

        {/* Room Dialog */}
        <RoomDialog
          room={selectedSpace}
          onClose={() => setSelectedSpace(null)}
        />
      </CardContent>
    </Card>
  )
}