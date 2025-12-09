// components/floor-plan/floor-plan.tsx
'use client'

import { useState, useEffect, useCallback } from 'react';
import { Space, User, RoomTemplate } from '@/types/database';
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Users, Video, MessageSquare, Plus, Settings, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button'
import { RoomDialog } from './room-dialog/index'
import { RoomManagement } from './room-management'
import { RoomTemplateSelector } from './room-template-selector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSpace } from '@/hooks/mutations/useSpaceMutations';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useLastSpace } from '@/hooks/useLastSpace'; // Import the new hook
import { debugLogger } from '@/utils/debug-logger'; // Import debugLogger
import { SpaceDebugPanel } from './space-debug-panel'; // Import debug panel
import { usePresence } from '@/contexts/PresenceContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationType } from '@/types/messaging';
import { useAuth } from '@/contexts/AuthContext';

// Import the RoomTemplates component
import { RoomTemplates } from './room-templates';
import { ModernFloorPlan, NowBoard, type FloorPlanPerspective } from './modern';
import { NeighborhoodManager } from './neighborhoods';
import { useNeighborhoods } from '@/hooks/queries/useNeighborhoods';
import { useNeighborhoodFilters } from '@/hooks/useNeighborhoodFilters';
import { useBeaconAggregator } from '@/hooks/useBeaconAggregator';
import { Grid2X2, LayoutGrid, Monitor as MonitorIcon, FolderOpen, Mic } from 'lucide-react';
import { SpaceAudioControls } from './SpaceAudioControls';
import { AudioProvider } from '@/contexts/AudioContext';



export function FloorPlan() {
  // Get data from context
  const { spaces, companyUsers, isLoading: isCompanyLoading, currentUserProfile } = useCompany(); // Added currentUserProfile
  const router = useRouter(); // Add router for navigation
  const { usersInSpaces, updateLocation, users } = usePresence(); // Presence context for real-time user data
  const {
    getOrCreateRoomConversation,
    setActiveConversation,
    activeConversation,
    setActiveView,
  } = useMessaging();
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
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [highlightedSpaceId, setHighlightedSpaceId] = useState<string | null>(null);
  const [useModernUI, setUseModernUI] = useState(false);
  const [perspective, setPerspective] = useState<FloorPlanPerspective>('orbit');
  const [isNeighborhoodManagerOpen, setIsNeighborhoodManagerOpen] = useState(false);

  // Neighborhood data and filters (Story 3.9)
  const { data: neighborhoods = [] } = useNeighborhoods();
  const neighborhoodFilters = useNeighborhoodFilters(neighborhoods);

  // Beacon aggregation (Story 3.10)
  const beaconAggregation = useBeaconAggregator(spaces, usersInSpaces);

  const { isAuthReady } = useAuth();

  // Check if current user is admin (for showing/hiding admin controls)
  const isAdmin = currentUserProfile?.role === 'admin';

  if (!isAuthReady || isCompanyLoading) {
    return (
      <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Preparing your floor plan...
        </p>
      </div>
    );
  }

  // Filter spaces from context based on type, search query, and neighborhood filters
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Apply neighborhood filters (Story 3.9)
  const neighborhoodFilteredSpaces = neighborhoodFilters.filterSpaces(filteredSpaces);

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

  const handleSpaceSelect = (space: Space) => {
    setSelectedSpace(space);
    setHighlightedSpaceId(space.id);
    handleEnterSpace(space);
    // Other handlers...
  };

  // Handler for editing a space (opens RoomDialog in edit mode)
  const handleEditSpace = (space: Space) => {
    setSelectedSpace(space);
    setIsEditingRoom(true);
  };

  // TODO: Refactor room management functions (create, update, delete, duplicate)
  // to interact with the backend API via context or direct API calls,
  // instead of modifying local state directly.
  // For now, these functions will not work correctly as they modify the old local state.

  // Room creation is now handled by the mutation hooks in the RoomDialog component
  // Room updates are now handled by the mutation hooks in the RoomDialog component
  const deleteSpaceMutation = useDeleteSpace();
  // Note: updateSpaceMutation removed - now using presence system via updateLocation()

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
        // Clear selection if the deleted room was selected/active
        setSelectedSpace(null);
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


  // Handle opening chat for a room via unified messaging drawer
  const handleOpenChat = useCallback(async (room: Space) => {
    if (!room?.id) {
      toast({
        title: 'Error',
        description: 'Cannot open chat: invalid room data.',
        variant: 'destructive',
      });
      return;
    }

    // Keep UI context aware of the selected space
    setSelectedSpace(room);
    setHighlightedSpaceId(room.id);

    if (
      activeConversation?.type === ConversationType.ROOM &&
      activeConversation.roomId === room.id
    ) {
      setActiveView('conversation');
      return;
    }

    try {
      const conversation = await getOrCreateRoomConversation(room.id, room.name);
      setActiveConversation(conversation);
      setActiveView('conversation');
    } catch (error) {
      console.error('[FloorPlan] Failed to open room conversation:', error);
      toast({
        title: 'Unable to open chat',
        description: 'We could not join the room conversation. Please try again.',
        variant: 'destructive',
      });
    }
  }, [
    activeConversation?.roomId,
    activeConversation?.type,
    getOrCreateRoomConversation,
    setActiveConversation,
    setActiveView,
    toast,
    setSelectedSpace,
    setHighlightedSpaceId,
  ]);

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

  // Story 3.10: Scroll to space when beacon is clicked
  const scrollToSpace = useCallback((spaceId: string) => {
    const element = document.querySelector(`[data-space-id="${spaceId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedSpaceId(spaceId);
      // Find the space and select it
      const space = spaces.find(s => s.id === spaceId);
      if (space) {
        setSelectedSpace(space);
      }
    }
  }, [spaces]);

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

      {/* NowBoard - Office Pulse Summary (Story 3.10) */}
      <NowBoard
        spaces={spaces}
        users={users}
        usersInSpaces={usersInSpaces}
        neighborhoods={neighborhoods}
        activeFilters={neighborhoodFilters.activeFilters}
        onFilterToggle={neighborhoodFilters.toggleFilter}
        onShowAll={neighborhoodFilters.showAll}
        isShowingAll={neighborhoodFilters.isShowingAll}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        beacons={beaconAggregation.activeBeacons}
        onBeaconClick={scrollToSpace}
      />

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

          {/* Filter by Type */}
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
        </div>

        <div className="flex items-center gap-2">
          {/* Perspective Switcher */}
          <div className="flex items-center gap-1 border rounded-lg p-1" style={{ backgroundColor: 'var(--vo-glass-bg)', borderColor: 'var(--vo-glass-border)' }}>
            <span className="text-xs text-muted-foreground px-2 font-medium uppercase tracking-wide">View</span>
            <Button
              variant={perspective === 'orbit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPerspective('orbit')}
              className="h-7 px-2"
              title="Orbit View - Standard layout"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={perspective === 'analyst' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPerspective('analyst')}
              className="h-7 px-2"
              title="Analyst View - Dense layout with sparklines"
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button
              variant={perspective === 'cinema' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPerspective('cinema')}
              className="h-7 px-2"
              title="Cinema View - Large cards"
            >
              <MonitorIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Admin-only: Create Room */}
          {isAdmin && (
            <Button
              variant="default"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => setIsRoomDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Room
            </Button>
          )}

          {/* Admin-only: Manage Neighborhoods Button (Story 3.9) */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => setIsNeighborhoodManagerOpen(true)}
            >
              <FolderOpen className="h-4 w-4" />
              Neighborhoods
            </Button>
          )}

          {selectedSpace && (
            <>
              {/* Story 8A: Audio Controls - wrapped with AudioProvider for spaceId */}
              <AudioProvider spaceId={selectedSpace.id}>
                <SpaceAudioControls />
              </AudioProvider>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => void handleOpenChat(selectedSpace)}
              >
                <MessageSquare className="h-4 w-4" />
                Chat in Room
              </Button>
            </>
          )}
        </div>
      </div>


      {/* Main Floor Plan Card */}
      <Card className="w-full">
        <div className="p-4 min-h-[600px]"> {/* Added min-height */}
          {isCompanyLoading ? (
            <Skeleton className="w-full h-[600px]" /> // Show skeleton while loading
          ) : (

            <ModernFloorPlan
              spaces={neighborhoodFilteredSpaces || []}
              neighborhoods={neighborhoods}
              enableNeighborhoodGrouping={neighborhoodFilters.activeFilters.size === 0}
              onSpaceSelect={handleSpaceSelect}
              onOpenChat={handleOpenChat}
              onSpaceDoubleClick={(space) => void handleOpenChat(space)}
              onEditSpace={isAdmin ? handleEditSpace : undefined}
              highlightedSpaceId={highlightedSpaceId}
              perspective={perspective}
              isAdmin={isAdmin}
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
        isAdmin={isAdmin} // Pass admin status for edit controls
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
          void handleOpenChat(room);
          setIsRoomManagementOpen(false);
        }}
        open={isRoomManagementOpen}
        onOpenChange={setIsRoomManagementOpen}
        isAdmin={isAdmin}
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

      {/* Neighborhood Manager Dialog (Story 3.9) */}
      <Dialog open={isNeighborhoodManagerOpen} onOpenChange={setIsNeighborhoodManagerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <NeighborhoodManager />
        </DialogContent>
      </Dialog>

      {/* Room Chat Integration */}
    </div>
  )
}
