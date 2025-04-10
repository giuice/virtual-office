// components/floor-plan/floor-plan.tsx
'use client'

import { useState, useEffect } from 'react';
import { Space, User } from '@/types/database';
import { RoomTemplate } from './types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Monitor, Video, MessageSquare, Plus, Settings, Copy, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button'
import { RoomDialog } from './room-dialog/index'
import { RoomManagement } from './room-management'
import { RoomTemplateSelector } from './room-template-selector';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RoomChatIntegration } from './room-chat-integration';
import { useCompany } from '@/contexts/CompanyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSpace, useUpdateSpace } from '@/hooks/mutations/useSpaceMutations';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useLastSpace } from '@/hooks/useLastSpace'; // Import the new hook
import { debugLogger } from '@/utils/debug-logger'; // Import debugLogger
import { SpaceDebugPanel } from './space-debug-panel'; // Import debug panel

// Import the RoomTemplates component
import { RoomTemplates } from './room-templates';
import DomFloorPlan  from './dom-floor-plan';

export function FloorPlan() {
  // Get data from context
  const { spaces, companyUsers, isLoading: isCompanyLoading, currentUserProfile } = useCompany(); // Added currentUserProfile
  const router = useRouter(); // Add router for navigation

  // State for UI interactions
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [hoveredUser, setHoveredUser] = useState<User | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState<boolean>(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState<boolean>(false);
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useState<boolean>(false);
  const [userTemplates, setUserTemplates] = useState<RoomTemplate[]>([])
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isEditingRoom, setIsEditingRoom] = useState<boolean>(false)
  const [chatRoom, setChatRoom] = useState<Space | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [highlightedSpaceId, setHighlightedSpaceId] = useState<string | null>(null);
  
  // Filter spaces from context based on type and search query
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Log spaces for debugging
  useEffect(() => {
    debugLogger.log('FloorPlan', `Loaded ${spaces.length} spaces`, spaces);
    // Check for unusual space data
    if (spaces.length > 0) {
      const spacesWithInvalidPosition = spaces.filter(
        space => !space.position || 
          typeof space.position.x !== 'number' || 
          typeof space.position.y !== 'number' ||
          typeof space.position.width !== 'number' ||
          typeof space.position.height !== 'number'
      );
      
      if (spacesWithInvalidPosition.length > 0) {
        debugLogger.warn('FloorPlan', 'Found spaces with invalid position data:', spacesWithInvalidPosition);
      }
    }
  }, [spaces]);
  
  // TODO: Refactor room management functions (create, update, delete, duplicate)
  // to interact with the backend API via context or direct API calls,
  // instead of modifying local state directly.
  // For now, these functions will not work correctly as they modify the old local state.

  // Room creation is now handled by the mutation hooks in the RoomDialog component

  // Room updates are now handled by the mutation hooks in the RoomDialog component
const deleteSpaceMutation = useDeleteSpace();
const updateSpaceMutation = useUpdateSpace();
const { toast } = useToast();

const handleDeleteRoom = (roomId: string) => {
  if (!roomId) {
    toast({
      title: "Error",
      description: "Cannot delete room: Missing room ID.",
      variant: "destructive"
    });
    return;
  }

  deleteSpaceMutation.mutate(roomId, {
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Room deleted successfully"
      });
      // Clear selection and chat if the deleted room was selected/active
      setSelectedSpace(null);
      if (chatRoom && chatRoom.id === roomId) {
        setChatRoom(null);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete room",
        variant: "destructive"
      });
    }
  });
};

  const handleDuplicateRoom = (room: Space) => { // Expect global Space
    console.warn("handleDuplicateRoom needs API integration");
    // Example API call structure (needs implementation in context/API):
    // duplicateSpaceInContext(room);
  };

  // Template position handling
  const [templatePosition, setTemplatePosition] = useState<{ x: number; y: number; width?: number; height?: number } | undefined>(undefined);

  // Use the last space hook to persist space selection
  const { lastSpaceId, saveLastSpace, clearLastSpace } = useLastSpace(currentUserProfile, spaces);

  // Handle entering a space (new function)
  const handleEnterSpace = (space: Space) => {
    if (!space || !space.id) {
      toast({
        title: "Error",
        description: "Cannot enter space: Invalid space data.",
        variant: "destructive"
      });
      return;
    }

    // Save this space as the last selected space for the user
    saveLastSpace(space.id);
    
    // Highlight the selected space
    setHighlightedSpaceId(space.id);
    
    // Just select the space without automatically adding the user to it
    setSelectedSpace(space);
    
    console.log(`User viewing space: ${space.name} (${space.id})`);
    
    // NOTE: We've removed the automatic user assignment to spaces
    // Users should now be explicitly added to spaces through a dedicated UI action
  };

  // Add a new explicit function for users to join a space
  const handleJoinSpace = (space: Space) => {
    if (!space || !space.id || !currentUserProfile?.id) {
      toast({
        title: "Error",
        description: "Cannot join space: Missing data.",
        variant: "destructive"
      });
      return;
    }

    // Only add the user if they're not already in the space
    const updatedUserIds = [...(space.userIds || [])];
    if (!updatedUserIds.includes(currentUserProfile.id)) {
      updatedUserIds.push(currentUserProfile.id);
      
      // Update the space with the new userIds using the mutation hook
      updateSpaceMutation.mutate({ 
        id: space.id,
        updates: { userIds: updatedUserIds }
      }, {
        onSuccess: () => {
          toast({
            title: "Success",
            description: `You joined ${space.name}`
          });
          setSelectedSpace(prev => prev?.id === space.id ? 
            {...prev, userIds: updatedUserIds} : prev);
        },
        onError: (error: Error) => {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to join space",
            variant: "destructive"
          });
        }
      });
    } else {
      toast({
        description: `You are already in ${space.name}`
      });
    }
  };

  // Handle leaving a space
  const handleLeaveSpace = (space: Space) => {
    if (!space || !space.id || !currentUserProfile) {
      return;
    }
    
    // Remove the user from the space's userIds
    const updatedUserIds = (space.userIds || []).filter(id => id !== currentUserProfile.id);
    
    updateSpaceMutation.mutate({
      id: space.id,
      updates: { userIds: updatedUserIds }
    }, {
      onSuccess: () => {
        toast({
          title: "Left Space",
          description: `You have left ${space.name}`
        });
        
        // Clear the saved space if it's the one we're leaving
        if (lastSpaceId === space.id) {
          clearLastSpace();
        }
        
        // If this was the selected space, deselect it
        if (selectedSpace?.id === space.id) {
          setSelectedSpace(null);
          setChatRoom(null);
        }
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: `Failed to leave space: ${error.message}`,
          variant: "destructive"
        });
      }
    });
  };

  // Handle opening chat for a room
  const handleOpenChat = (room: Space) => {
    setChatRoom(room);
  };
  
  // Handle closing chat
  const handleCloseChat = () => {
    setChatRoom(null);
  };

  useEffect(() => {
    // If there's a last space ID, try to select it
    if (lastSpaceId) {
      const space = spaces.find(space => space.id === lastSpaceId);
      if (space) {
        setSelectedSpace(space);
        handleEnterSpace(space);
      }
    }
  }, [lastSpaceId, spaces]);

  return (
    <div className="space-y-4 w-full">
      {/* Add debug button and panel */}
      <div className="flex justify-end mb-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="text-xs"
        >
          {showDebugPanel ? 'Hide' : 'Show'} Debug Panel
        </Button>
      </div>
      
      {showDebugPanel && (
        <SpaceDebugPanel 
          spaces={spaces} 
          onHighlightSpace={(space) => setHighlightedSpaceId(space.id)}
          onHidePanel={() => setShowDebugPanel(false)}
        />
      )}

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
            // <FloorPlanCanvas 
            //   spaces={filteredSpaces} // Pass global Space[]
            //   onSpaceSelect={(space: Space) => { // Ensure type is global Space
            //     setSelectedSpace(space);
            //     // Enter the space when clicked
            //     handleEnterSpace(space);
            //   }}
            //   onSpaceDoubleClick={(space) => {
            //     // Open chat panel on double-click
            //     handleOpenChat(space);
            //   }}
            //   isEditable={true} // TODO: Make this dependent on user role (admin)
            //   highlightedSpaceId={highlightedSpaceId} // Pass highlighted space ID
            // />

            <DomFloorPlan 
              spaces={filteredSpaces} // Pass global Space[]
              onSpaceSelect={(space: Space) => { // Ensure type is global Space
                setSelectedSpace(space);
                setHighlightedSpaceId(space.id);
                // Enter the space when clicked
                handleEnterSpace(space);
              }}
              onSpaceDoubleClick={(space) => {
                // Open chat panel on double-click
                handleOpenChat(space);
              }}
              isEditable={true} // TODO: Make this dependent on user role (admin)
              highlightedSpaceId={highlightedSpaceId} // Pass highlighted space ID
            />
            )}
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
        isCreating={!isEditingRoom}
        companyId={currentUserProfile?.companyId || ''} // Add required companyId prop
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
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <RoomTemplates
            onSelectTemplate={(template) => {
              // Pass template to create room with template position
              setTemplatePosition(prevPos => ({
                x: prevPos?.x || 100,
                y: prevPos?.y || 100,
                width: template.defaultWidth,
                height: template.defaultHeight
              }));
              setIsTemplateDialogOpen(false);
            }}
            onSaveTemplate={(template) => {
              setUserTemplates(prev => [...prev, template]);
            }}
            onDeleteTemplate={(templateId) => {
              setUserTemplates(prev => prev.filter(t => t.id !== templateId));
            }}
            userTemplates={userTemplates}
          />
        </DialogContent>
      </Dialog>
      
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
