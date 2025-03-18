// components/floor-plan/floor-plan.tsx
'use client'

import { useState } from 'react'
import { Space, User, SpaceType, RoomTemplate } from './types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Monitor, Video, MessageSquare, Plus, Settings, Copy, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoomDialog } from './room-dialog'
import { UserHoverCard } from './user-hover-card'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { RoomManagement } from './room-management'
import { RoomTemplateSelector } from './room-template-selector'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  },
  {
    id: 'private-office-1',
    name: 'CEO Office',
    type: 'private_office',
    status: 'locked',
    position: { x: 450, y: 350, width: 150, height: 150 },
    capacity: 1,
    features: ['desk', 'privacy', 'whiteboard'],
    users: [],
    accessControl: {
      isPublic: false,
      allowedUsers: [1, 3]
    }
  },
  {
    id: 'open-space-1',
    name: 'Innovation Hub',
    type: 'open_space',
    status: 'available',
    position: { x: 650, y: 100, width: 300, height: 300 },
    capacity: 20,
    features: ['whiteboard', 'flexible-seating', 'screens'],
    users: []
  }
]

// Sample room templates
const roomTemplates: RoomTemplate[] = [
  {
    id: 'template-1',
    name: 'Standard Meeting Room',
    type: 'conference',
    capacity: 8,
    features: ['video', 'screen-sharing', 'whiteboard'],
    description: 'Standard meeting room for team discussions and presentations',
    defaultWidth: 250,
    defaultHeight: 150,
    isPublic: true
  },
  {
    id: 'template-2',
    name: 'Developer Workspace',
    type: 'workspace',
    capacity: 4,
    features: ['screens', 'whiteboard'],
    description: 'Workspace optimized for development teams',
    defaultWidth: 300,
    defaultHeight: 200,
    isPublic: true
  },
  {
    id: 'template-3',
    name: 'Break Area',
    type: 'social',
    capacity: 6,
    features: ['coffee', 'snacks'],
    description: 'Relaxation area for breaks and casual conversations',
    defaultWidth: 200,
    defaultHeight: 150,
    isPublic: true
  }
]

export function FloorPlan() {
  // State for rooms and UI
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [hoveredUser, setHoveredUser] = useState<User | null>(null)
  const [spaces, setSpaces] = useState<Space[]>(demoSpaces)
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState<boolean>(false)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState<boolean>(false)
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useState<boolean>(false)
  const [templates, setTemplates] = useState<RoomTemplate[]>(roomTemplates)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isEditingRoom, setIsEditingRoom] = useState<boolean>(false)
  
  // Filter spaces based on type and search query
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  
  // Handle room creation
  const handleCreateRoom = (newRoom: Space) => {
    setSpaces(prev => [...prev, newRoom]);
    setIsRoomDialogOpen(false);
  };
  
  // Handle room update
  const handleUpdateRoom = (updatedRoom: Space) => {
    setSpaces(prev => 
      prev.map(space => space.id === updatedRoom.id ? updatedRoom : space)
    );
    setSelectedSpace(null);
    setIsEditingRoom(false);
  };
  
  // Handle room deletion
  const handleDeleteRoom = (roomId: string) => {
    setSpaces(prev => prev.filter(space => space.id !== roomId));
    setSelectedSpace(null);
  };
  
  // Handle room duplication
  const handleDuplicateRoom = (room: Space) => {
    const newRoom: Space = {
      ...room,
      id: `${room.id}-copy-${Date.now()}`,
      name: `${room.name} (Copy)`,
      position: {
        ...room.position,
        x: room.position.x + 50,
        y: room.position.y + 50
      },
      users: []
    };
    
    setSpaces(prev => [...prev, newRoom]);
  };
  
  // Handle template selection
  const handleSelectTemplate = (template: RoomTemplate) => {
    // Create a new room from the template
    const newRoom: Space = {
      id: `room-${Date.now()}`,
      name: template.name,
      type: template.type,
      status: 'available',
      capacity: template.capacity,
      features: template.features,
      position: {
        x: 100,
        y: 100,
        width: template.defaultWidth,
        height: template.defaultHeight
      },
      users: [],
      description: template.description,
      accessControl: { isPublic: true },
      createdBy: 1, // Mock user ID
      createdAt: new Date(),
      updatedAt: new Date(),
      isTemplate: false,
      templateName: template.name
    };
    
    setSpaces(prev => [...prev, newRoom]);
  };

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

      {/* Room Management Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setIsRoomManagementOpen(true)}
          >
            <Settings className="h-4 w-4" />
            Manage Rooms
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setIsTemplateDialogOpen(true)}
          >
            <Copy className="h-4 w-4" />
            Use Template
          </Button>
          
          <div className="flex items-center gap-2">
            <Select 
              value={filterType} 
              onValueChange={setFilterType}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="conference">Conference Room</SelectItem>
                <SelectItem value="social">Social Space</SelectItem>
                <SelectItem value="breakout">Breakout Room</SelectItem>
                <SelectItem value="private_office">Private Office</SelectItem>
                <SelectItem value="open_space">Open Space</SelectItem>
                <SelectItem value="lounge">Lounge</SelectItem>
                <SelectItem value="lab">Lab</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[200px] h-9"
            />
          </div>
        </div>
        
        <Button 
          variant="default" 
          size="sm"
          className="flex items-center gap-2"
          onClick={() => setIsRoomDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create Room
        </Button>
      </div>

      {/* Main Floor Plan Card */}
      <Card className="w-full">
        <div className="p-4">
          <FloorPlanCanvas 
            spaces={filteredSpaces} 
            onSpaceSelect={(space) => {
              setSelectedSpace(space);
              setIsEditingRoom(true);
            }}
            onSpaceUpdate={handleUpdateRoom}
            isEditable={true}
          />
        </div>
      </Card>

      {/* Room Dialog for Creating/Editing */}
      <RoomDialog 
        room={isEditingRoom ? selectedSpace : null}
        open={isRoomDialogOpen || isEditingRoom}
        onOpenChange={(open) => {
          if (!open) {
            setIsRoomDialogOpen(false);
            setIsEditingRoom(false);
            setSelectedSpace(null);
          }
        }}
        onCreate={handleCreateRoom}
        onUpdate={handleUpdateRoom}
        isCreating={!isEditingRoom}
      />

      {/* Room Management Dialog */}
      <RoomManagement
        spaces={spaces}
        onCreateRoom={() => {
          setIsRoomDialogOpen(true);
          setIsRoomManagementOpen(false);
        }}
        onEditRoom={(room) => {
          setSelectedSpace(room);
          setIsEditingRoom(true);
          setIsRoomManagementOpen(false);
        }}
        onDeleteRoom={handleDeleteRoom}
        onDuplicateRoom={handleDuplicateRoom}
        open={isRoomManagementOpen}
        onOpenChange={setIsRoomManagementOpen}
      />
      
      {/* Template Selection Dialog */}
      <RoomTemplateSelector
        templates={templates}
        onSelectTemplate={handleSelectTemplate}
        open={isTemplateDialogOpen}
        onOpenChange={setIsTemplateDialogOpen}
      />

      {/* User Info Bar */}
      <Card className="w-full">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {hoveredUser ? (
                <>
                  <UserHoverCard user={hoveredUser} />
                  <span className="text-sm text-muted-foreground">{hoveredUser.activity}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Hover over a user to see details</span>
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
