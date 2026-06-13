// components/floor-plan/floor-plan.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useCallback } from 'react';
import { Space, User, RoomTemplate } from '@/types/database';
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoomDialog } from './room-dialog/index';
import { RoomManagement } from './room-management';
import { useCompany } from '@/contexts/CompanyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSpace } from '@/hooks/mutations/useSpaceMutations';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation'; // Import useRouter
import { getReconnectionContext, useLastSpace } from '@/hooks/useLastSpace'; // Import the new hook
import { debugLogger } from '@/utils/debug-logger'; // Import debugLogger
import { SpaceDebugPanel } from './space-debug-panel'; // Import debug panel
import { usePresence } from '@/contexts/PresenceContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationType } from '@/types/messaging';
import { useAuth } from '@/contexts/AuthContext';

// Import the RoomTemplates component
import { RoomTemplates } from './room-templates';
import ModernFloorPlan, { type FloorPlanPerspective } from './modern/ModernFloorPlan';
import { NowBoard } from './modern/NowBoard';
import { NeighborhoodManager } from './neighborhoods/NeighborhoodManager';
import { useNeighborhoods } from '@/hooks/queries/useNeighborhoods';
import { useNeighborhoodFilters } from '@/hooks/useNeighborhoodFilters';
import { useBeaconAggregator } from '@/hooks/useBeaconAggregator';
import { AudioProvider } from '@/contexts/AudioContext';
import { FloorPlanToolbar } from './FloorPlanToolbar';
const handleDuplicateRoom = (room: Space) => {
  console.warn("handleDuplicateRoom needs API integration");
};
export function FloorPlan() {
  // === ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN (Rules of Hooks) ===

  // Context hooks
  const {
    company,
    spaces,
    companyUsers,
    isLoading: isCompanyLoading,
    currentUserProfile
  } = useCompany();
  const router = useRouter();
  const {
    usersInSpaces,
    users
  } = usePresence();
  const {
    getOrCreateRoomConversation,
    setActiveConversation,
    activeConversation,
    setActiveView
  } = useMessaging();
  const {
    isAuthReady
  } = useAuth();

  // State hooks
  const [selectedSpace, setSelectedSpace] = useReducerState<Space | null>(null);
  const [hoveredUser, setHoveredUser] = useReducerState<User | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useReducerState<boolean>(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useReducerState<boolean>(false);
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useReducerState<boolean>(false);
  const [userTemplates, setUserTemplates] = useReducerState<RoomTemplate[]>([]);
  const [filterType, setFilterType] = useReducerState<string>('all');
  const [searchQuery, setSearchQuery] = useReducerState<string>('');
  const [isEditingRoom, setIsEditingRoom] = useReducerState<boolean>(false);
  const [showDebugPanel, setShowDebugPanel] = useReducerState<boolean>(false);
  const [highlightedSpaceId, setHighlightedSpaceId] = useReducerState<string | null>(null);
  const [useModernUI, setUseModernUI] = useReducerState(false);
  const [perspective, setPerspective] = useReducerState<FloorPlanPerspective>('orbit');
  const [isNeighborhoodManagerOpen, setIsNeighborhoodManagerOpen] = useReducerState(false);
  // Custom hooks
  const {
    data: neighborhoods = []
  } = useNeighborhoods();
  const neighborhoodFilters = useNeighborhoodFilters(neighborhoods);
  const beaconAggregation = useBeaconAggregator(spaces, usersInSpaces);
  const deleteSpaceMutation = useDeleteSpace();
  const {
    toast
  } = useToast();
  // Derived values needed by hooks below
  const currentUserPresence = users?.find(u => u.id === currentUserProfile?.id);
  const currentSpaceId = currentUserPresence?.currentSpaceId || undefined;
  const {
    lastSpaceId,
    saveLastSpace,
    clearLastSpace
  } = useLastSpace(currentUserPresence ?? null, spaces, company);

  // Effect: Log spaces for debugging
  useEffect(() => {
    debugLogger.log('FloorPlan', `Loaded ${spaces.length} spaces`, spaces);
    if (spaces.length > 0) {
      const spacesWithInvalidPosition = spaces.filter(space => !space.position || typeof space.position.x !== 'number' || typeof space.position.y !== 'number' || typeof space.position.width !== 'number' || typeof space.position.height !== 'number');
      if (spacesWithInvalidPosition.length > 0) {
        debugLogger.warn('FloorPlan', 'Found spaces with invalid position data:', spacesWithInvalidPosition);
      }
    }
  }, [spaces]);

  // Effect: Hydrate visual selection on load -- useLastSpace handles the actual API placement
  useEffect(() => {
    if (!currentUserProfile || spaces.length === 0) {
      return;
    }
    const targetSpaceId = currentSpaceId || getReconnectionContext(currentUserProfile, spaces, company, lastSpaceId).spaceId;
    if (!targetSpaceId) {
      return;
    }
    const space = spaces.find(candidate => candidate.id === targetSpaceId);
    if (space) {
      setSelectedSpace(space);
      setHighlightedSpaceId(space.id);
      // Keep visual hydration aligned with localStorage so grace rejoin uses
      // the same lastSpaceId whether placement came from UI or auto-placement.
      saveLastSpace(targetSpaceId, {
        markManualChange: false
      });
    }
  }, [company, currentSpaceId, currentUserProfile, lastSpaceId, saveLastSpace, spaces, setSelectedSpace, setHighlightedSpaceId]);

  // Callback: Handle opening chat for a room via unified messaging drawer
  const handleOpenChat = useCallback(async (room: Space) => {
    if (!room?.id) {
      toast({
        title: 'Error',
        description: 'Cannot open chat: invalid room data.',
        variant: 'destructive'
      });
      return;
    }
    setSelectedSpace(room);
    setHighlightedSpaceId(room.id);
    if (activeConversation?.type === ConversationType.ROOM && activeConversation.roomId === room.id) {
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
        variant: 'destructive'
      });
    }
  }, [activeConversation?.roomId, activeConversation?.type, getOrCreateRoomConversation, setActiveConversation, setActiveView, toast, setSelectedSpace, setHighlightedSpaceId]);

  // Callback: Scroll to space when beacon is clicked (Story 3.10)
  const scrollToSpace = useCallback((spaceId: string) => {
    const element = document.querySelector(`[data-space-id="${spaceId}"]`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      setHighlightedSpaceId(spaceId);
      const space = spaces.find(s => s.id === spaceId);
      if (space) {
        setSelectedSpace(space);
      }
    }
  }, [spaces, setHighlightedSpaceId, setSelectedSpace]);

  // === EARLY RETURN — all hooks have been called above ===
  if (!isAuthReady || isCompanyLoading) {
    return <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Preparing your floor plan…
        </p>
      </div>;
  }

  // === NON-HOOK CODE BELOW (handlers, derived values, render) ===
  const isAdmin = currentUserProfile?.role === 'admin';

  // Filter spaces from context based on type, search query, and neighborhood filters
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) || (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Apply neighborhood filters (Story 3.9)
  const neighborhoodFilteredSpaces = neighborhoodFilters.filterSpaces(filteredSpaces);
  const handleSpaceSelect = (space: Space) => {
    setSelectedSpace(space);
    setHighlightedSpaceId(space.id);
    // Only persist to localStorage for reconnection recovery.
    // The actual API call (updateLocation) is already handled by
    // ModernFloorPlan.handleEnterSpace BEFORE this callback fires.
    saveLastSpace(space.id);
  };
  const handleEditSpace = (space: Space) => {
    setSelectedSpace(space);
    setIsEditingRoom(true);
  };
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
  return <AudioProvider spaceId={currentSpaceId || selectedSpace?.id} userId={currentUserProfile?.id}>
      <div className="space-y-4 w-full">
        {/* Add debug button and panel */}
        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={() => setShowDebugPanel(!showDebugPanel)} className="text-xs">
            {showDebugPanel ? 'Hide' : 'Show'} Debug Panel
          </Button>
        </div>

        {showDebugPanel && <SpaceDebugPanel spaces={spaces} onHighlightSpace={space => setHighlightedSpaceId(space.id)} onHidePanel={() => setShowDebugPanel(false)} />}

        {/* NowBoard - Office Pulse Summary (Story 3.10) */}
        <NowBoard spaces={spaces} users={users} usersInSpaces={usersInSpaces} neighborhoods={neighborhoods} activeFilters={neighborhoodFilters.activeFilters} onFilterToggle={neighborhoodFilters.toggleFilter} onShowAll={neighborhoodFilters.showAll} isShowingAll={neighborhoodFilters.isShowingAll} searchQuery={searchQuery} onSearchChange={setSearchQuery} beacons={beaconAggregation.activeBeacons} onBeaconClick={scrollToSpace} />

        <FloorPlanToolbar
          filterType={filterType}
          perspective={perspective}
          selectedSpace={selectedSpace}
          isAdmin={isAdmin}
          onFilterTypeChange={setFilterType}
          onPerspectiveChange={setPerspective}
          onOpenRoomManagement={() => setIsRoomManagementOpen(true)}
          onOpenTemplateDialog={() => setIsTemplateDialogOpen(true)}
          onCreateRoom={() => setIsRoomDialogOpen(true)}
          onOpenNeighborhoodManager={() => setIsNeighborhoodManagerOpen(true)}
          onOpenSelectedChat={() => {
            if (selectedSpace) void handleOpenChat(selectedSpace);
          }}
        />


        {/* Main Floor Plan Card */}
        <Card className="w-full">
          <div className="p-4 min-h-[600px]"> {/* Added min-height */}
            {isCompanyLoading ? <Skeleton className="w-full h-[600px]" /> // Show skeleton while loading
          : <ModernFloorPlan spaces={neighborhoodFilteredSpaces || []} neighborhoods={neighborhoods} enableNeighborhoodGrouping={neighborhoodFilters.activeFilters.size === 0} onSpaceSelect={handleSpaceSelect} onOpenChat={handleOpenChat} onSpaceDoubleClick={space => void handleOpenChat(space)} onEditSpace={isAdmin ? handleEditSpace : undefined} highlightedSpaceId={highlightedSpaceId} perspective={perspective} isAdmin={isAdmin} />}
          </div>
        </Card>

        {/* Room Dialog for Creating/Editing - Needs update to handle global Space */}
        <RoomDialog room={isEditingRoom ? selectedSpace : null} // Pass global Space or null
      open={isRoomDialogOpen || isEditingRoom} onOpenChange={open => {
        if (!open) {
          setIsRoomDialogOpen(false);
          setIsEditingRoom(false);
          setSelectedSpace(null);
        }
      }} isCreating={!isEditingRoom} companyId={currentUserProfile?.companyId || ''} // Add required companyId prop
      isAdmin={isAdmin} // Pass admin status for edit controls
      />

        {/* Room Management Dialog - Pass global Space[] */}
        <RoomManagement spaces={spaces} // Pass global Space[]
      onCreateRoom={() => {
        setIsRoomDialogOpen(true); // Open the standard create/edit dialog
        setIsEditingRoom(false); // Ensure it's in create mode
        setIsRoomManagementOpen(false);
      }} onEditRoom={(room: Space) => {
        // Expect global Space
        setSelectedSpace(room);
        setIsEditingRoom(true); // Open the standard create/edit dialog in edit mode
        setIsRoomManagementOpen(false);
      }} onDeleteRoom={handleDeleteRoom} // Pass updated handler
      onDuplicateRoom={handleDuplicateRoom} // Pass updated handler
      onOpenChat={(room: Space) => {
        // Expect global Space
        void handleOpenChat(room);
        setIsRoomManagementOpen(false);
      }} open={isRoomManagementOpen} onOpenChange={setIsRoomManagementOpen} isAdmin={isAdmin} />

        {/* Template Selection Dialog */}
        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <RoomTemplates onSelectTemplate={template => {
            setIsTemplateDialogOpen(false);
          }} onSaveTemplate={template => {
            setUserTemplates(prev => [...prev, template]);
          }} onDeleteTemplate={templateId => {
            setUserTemplates(prev => prev.filter(t => t.id !== templateId));
          }} userTemplates={userTemplates} />
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
    </AudioProvider>;
}
