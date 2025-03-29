// components/floor-plan/floor-plan.tsx
'use client'

import { useState, useEffect } from 'react';
// Import global Space type and local types separately
import { Space, User as GlobalUser } from '@/types/database'; // Use global Space and User
import { User as LocalUser, SpaceType as LocalSpaceType, RoomTemplate } from './types'; // Keep local types if needed elsewhere
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Monitor, Video, MessageSquare, Plus, Settings, Copy, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button'
import { RoomDialog } from './room-dialog'
import { UserHoverCard } from './user-hover-card'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { RoomManagement } from './room-management'
import { RoomTemplateSelector } from './room-template-selector';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RoomChatIntegration } from './room-chat-integration';
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for loading state

// Sample room templates (Keep for now, might move later)
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
  // Get data from context
  const { spaces, companyUsers, isLoading: isCompanyLoading, currentUserProfile } = useCompany(); // Added currentUserProfile

  // State for UI interactions
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null); // Use global Space type
  const [hoveredUser, setHoveredUser] = useState<LocalUser | null>(null); // Keep LocalUser for hover card if its structure differs
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState<boolean>(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState<boolean>(false);
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useState<boolean>(false);
  const [templates, setTemplates] = useState<RoomTemplate[]>(roomTemplates)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isEditingRoom, setIsEditingRoom] = useState<boolean>(false)
  
  // State for room messaging
  const [chatRoom, setChatRoom] = useState<Space | null>(null)
  
  // Filter spaces from context based on type and search query
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  
  // TODO: Refactor room management functions (create, update, delete, duplicate)
  // to interact with the backend API via context or direct API calls,
  // instead of modifying local state directly.
  // For now, these functions will not work correctly as they modify the old local state.

  // TODO: Refactor room management functions (create, update, delete, duplicate)
  // to interact with the backend API via context or direct API calls.
  // These functions now expect the global Space type.

  const handleCreateRoom = (newRoomData: Partial<Space>) => { // Expect partial data for creation
    console.warn("handleCreateRoom needs API integration");
    // Example API call structure (needs implementation in context/API):
    // createSpaceInContext({ ...newRoomData, companyId: company?.id, createdBy: currentUserProfile?.id });
    setIsRoomDialogOpen(false);
  };

  const handleUpdateRoom = (updatedRoom: Space) => { // Expect full Space object for update
    console.warn("handleUpdateRoom needs API integration");
    // Example API call structure (needs implementation in context/API):
    // updateSpaceInContext(updatedRoom.id, updatedRoom);
    setSelectedSpace(null);
    setIsEditingRoom(false);
  };

  const handleDeleteRoom = (roomId: string) => {
    console.warn("handleDeleteRoom needs API integration");
    // Example API call structure (needs implementation in context/API):
    // deleteSpaceInContext(roomId);
    setSelectedSpace(null);
    if (chatRoom && chatRoom.id === roomId) {
      setChatRoom(null);
    }
  };

  const handleDuplicateRoom = (room: Space) => { // Expect global Space
    console.warn("handleDuplicateRoom needs API integration");
    // Example API call structure (needs implementation in context/API):
    // duplicateSpaceInContext(room);
  };

  // Handle template selection (Needs API integration)
  const handleSelectTemplate = (template: RoomTemplate) => {
    console.warn("handleSelectTemplate needs API integration");
    // Example API call structure (needs implementation in context/API):
    // createSpaceFromTemplateInContext(template);
  };

  // Handle opening chat for a room (Expects global Space)
  const handleOpenChat = (room: Space) => {
    setChatRoom(room);
  };
  
  // Handle closing chat
  const handleCloseChat = () => {
    setChatRoom(null);
  };

  return (
    <div className="space-y-4 relative">
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
        
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setIsRoomDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Room
          </Button>
          
          {selectedSpace && (
            <Button 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
              onClick={() => handleOpenChat(selectedSpace)}
            >
              <MessageSquare className="h-4 w-4" />
              Chat in Room
            </Button>
          )}
        </div>
      </div>

      {/* Main Floor Plan Card */}
      <Card className="w-full">
        <div className="p-4 min-h-[600px]"> {/* Added min-height */}
          {isCompanyLoading ? (
            <Skeleton className="w-full h-[600px]" /> // Show skeleton while loading
          ) : (
            <FloorPlanCanvas
              spaces={filteredSpaces} // Pass global Space[]
              onSpaceSelect={(space: Space) => { // Ensure type is global Space
                setSelectedSpace(space);
              // We don't automatically open the edit dialog, 
              // so users can select a room for other actions like chat
            }}
            onSpaceDoubleClick={(space) => {
              // Open chat panel on double-click
              handleOpenChat(space);
            }}
            onSpaceUpdate={handleUpdateRoom} // Pass updated handler
            isEditable={true} // TODO: Make this dependent on user role (admin)
          />)}
        </div>
      </Card>

      {/* Room Dialog for Creating/Editing - Needs update to handle global Space */}
      <RoomDialog
        room={isEditingRoom ? selectedSpace : null} // Pass global Space or null
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

      {/* Room Management Dialog - Pass global Space[] */}
      <RoomManagement
        spaces={spaces} // Pass global Space[]
        onCreateRoom={() => {
          setIsRoomDialogOpen(true); // Open the standard create/edit dialog
          setIsEditingRoom(false); // Ensure it's in create mode
          setIsRoomManagementOpen(false);
        }}
        onEditRoom={(room: Space) => { // Expect global Space
          setSelectedSpace(room);
          setIsEditingRoom(true); // Open the standard create/edit dialog in edit mode
          setIsRoomManagementOpen(false);
        }}
        onDeleteRoom={handleDeleteRoom} // Pass updated handler
        onDuplicateRoom={handleDuplicateRoom} // Pass updated handler
        onOpenChat={(room: Space) => { // Expect global Space
          handleOpenChat(room);
          setIsRoomManagementOpen(false);
        }}
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
      
      {/* Room Chat Integration */}
      <RoomChatIntegration 
        selectedRoom={chatRoom} 
        onCloseChat={handleCloseChat}
        position="right"
      />

      {/* User Info Bar - Correctly commented out */}
      {/*
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
              {companyUsers.filter(u => u.status === 'online').length} Online
            </Badge>
          </div>
        </CardContent>
      </Card>
      */}
    </div>
  )
}
