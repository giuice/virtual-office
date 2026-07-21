// components/floor-plan/floor-plan.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useCallback } from 'react';
import { Space, RoomTemplate } from '@/types/database';
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoomDialog } from './room-dialog/index';
import { RoomManagement } from './room-management';
import { useCompany } from '@/contexts/CompanyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteSpace } from '@/hooks/mutations/useSpaceMutations';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { debugLogger } from '@/utils/debug-logger';
import { SpaceDebugPanel } from './space-debug-panel';
import { usePresence } from '@/contexts/PresenceContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationType } from '@/types/messaging';
import { useAuth } from '@/contexts/AuthContext';

import { RoomTemplates } from './room-templates';
import ModernFloorPlan, { type FloorPlanDensity } from './modern/ModernFloorPlan';
import { NowBoard } from './modern/NowBoard';
import { YouAreHereChip } from './modern/YouAreHereChip';
import { NeighborhoodManager } from './neighborhoods/NeighborhoodManager';
import { useNeighborhoods } from '@/hooks/queries/useNeighborhoods';
import { useNeighborhoodFilters } from '@/hooks/useNeighborhoodFilters';
import { AudioProvider } from '@/contexts/AudioContext';
import { FloorPlanToolbar } from './FloorPlanToolbar';
const handleDuplicateRoom = (_room: Space) => {
  console.warn("handleDuplicateRoom needs API integration");
};
export function FloorPlan() {
  const {
    spaces,
    isLoading: isCompanyLoading,
    currentUserProfile,
    bootstrapError,
    refreshCompanyData
  } = useCompany();
  const router = useRouter();
  const {
    usersInSpaces,
    users,
    saveLastSpace,
    realtimeConnectionStatus,
    error: presenceError,
    retryPresence,
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

  const [selectedSpace, setSelectedSpace] = useReducerState<Space | null>(null);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useReducerState<boolean>(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useReducerState<boolean>(false);
  const [isRoomManagementOpen, setIsRoomManagementOpen] = useReducerState<boolean>(false);
  const [userTemplates, setUserTemplates] = useReducerState<RoomTemplate[]>([]);
  const [filterType, setFilterType] = useReducerState<string>('all');
  const [searchQuery, setSearchQuery] = useReducerState<string>('');
  const [isEditingRoom, setIsEditingRoom] = useReducerState<boolean>(false);
  const [showDebugPanel, setShowDebugPanel] = useReducerState<boolean>(false);
  const [highlightedSpaceId, setHighlightedSpaceId] = useReducerState<string | null>(null);
  const [density, setDensity] = useReducerState<FloorPlanDensity>('comfortable');
  const [collapsedNeighborhoodIds, setCollapsedNeighborhoodIds] = useReducerState<Set<string>>(
    () => new Set()
  );
  const [isNeighborhoodManagerOpen, setIsNeighborhoodManagerOpen] = useReducerState(false);
  const {
    data: neighborhoods = []
  } = useNeighborhoods();
  const neighborhoodFilters = useNeighborhoodFilters(neighborhoods);
  const showAllNeighborhoods = neighborhoodFilters.showAll;
  const deleteSpaceMutation = useDeleteSpace();
  const {
    toast
  } = useToast();
  const currentUserPresence = users?.find(u => u.id === currentUserProfile?.id);
  const currentSpaceId = currentUserPresence?.isOccupyingCurrentSpace
    ? currentUserPresence.currentSpaceId ?? undefined
    : undefined;

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
    const targetSpaceId = currentSpaceId;
    if (!targetSpaceId) {
      setSelectedSpace(null);
      setHighlightedSpaceId(null);
      return;
    }
    const space = spaces.find(candidate => candidate.id === targetSpaceId);
    if (space) {
      setSelectedSpace(space);
      setHighlightedSpaceId(space.id);
      saveLastSpace(targetSpaceId);
    }
  }, [currentSpaceId, currentUserProfile, saveLastSpace, spaces, setSelectedSpace, setHighlightedSpaceId]);

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

  const scrollToSpace = useCallback((spaceId: string) => {
    const element = document.querySelector(`[data-space-id="${spaceId}"]`);
    if (element) {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center'
      });
      element.classList.remove('vo-card-flash');
      void (element as HTMLElement).offsetWidth;
      element.classList.add('vo-card-flash');
      setHighlightedSpaceId(spaceId);
      const space = spaces.find(s => s.id === spaceId);
      if (space) {
        setSelectedSpace(space);
      }
    }
  }, [spaces, setHighlightedSpaceId, setSelectedSpace]);
  const handleToggleNeighborhood = useCallback((neighborhoodId: string) => {
    setCollapsedNeighborhoodIds((previous) => {
      const next = new Set(previous);
      if (next.has(neighborhoodId)) {
        next.delete(neighborhoodId);
      } else {
        next.add(neighborhoodId);
      }
      return next;
    });
  }, [setCollapsedNeighborhoodIds]);
  const handleExpandNeighborhood = useCallback((neighborhoodId: string) => {
    setCollapsedNeighborhoodIds((previous) => {
      if (!previous.has(neighborhoodId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(neighborhoodId);
      return next;
    });
  }, [setCollapsedNeighborhoodIds]);
  const handleLocateCurrentSpace = useCallback(() => {
    if (!currentSpaceId) {
      return;
    }

    const currentSpace = spaces.find((space) => space.id === currentSpaceId);
    setFilterType('all');
    setSearchQuery('');
    showAllNeighborhoods();
    if (currentSpace?.neighborhoodId) {
      handleExpandNeighborhood(currentSpace.neighborhoodId);
    } else {
      handleExpandNeighborhood('ungrouped');
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSpace(currentSpaceId));
    });
  }, [
    currentSpaceId,
    handleExpandNeighborhood,
    showAllNeighborhoods,
    scrollToSpace,
    setFilterType,
    setSearchQuery,
    spaces,
  ]);
  const handleSpaceLeave = useCallback(() => {
    setSelectedSpace(null);
    setHighlightedSpaceId(null);
  }, [setHighlightedSpaceId, setSelectedSpace]);

  // === EARLY RETURN — all hooks have been called above ===
  if (!isAuthReady || isCompanyLoading) {
    return <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Preparing your floor plan…
        </p>
      </div>;
  }

  if (bootstrapError && spaces.length === 0) {
    const isUnauthenticated = bootstrapError.kind === 'unauthenticated';
    const isRateLimited = bootstrapError.kind === 'rate-limited';
    const title = isUnauthenticated
      ? 'Your session has expired'
      : isRateLimited
        ? 'Your office is temporarily busy'
        : "We couldn't load your office";
    const description = isUnauthenticated
      ? 'Sign in again to reconnect to your office.'
      : isRateLimited
        ? 'Please wait a moment, then try again.'
        : bootstrapError.message;

    return <div
      className="flex min-h-[420px] w-full flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
      role="alert"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <div className="max-w-lg space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {bootstrapError.kind === 'server' && bootstrapError.correlationId ? <p className="text-xs text-muted-foreground">
          Reference: {bootstrapError.correlationId}
        </p> : null}
      </div>
      {isUnauthenticated ? <Button onClick={() => router.push('/login')}>Sign in</Button> : <Button
        onClick={() => void refreshCompanyData()}
      >
        Retry
      </Button>}
    </div>;
  }

  if (presenceError && users === undefined) {
    return <div
      className="flex min-h-[420px] w-full flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
      role="alert"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <div className="max-w-lg space-y-2">
        <h2 className="text-lg font-semibold">We couldn&apos;t load live presence</h2>
        <p className="text-sm text-muted-foreground">
          The office loaded, but its live occupants did not. Retry before using the floor plan.
        </p>
      </div>
      <Button onClick={retryPresence}>Retry live presence</Button>
    </div>;
  }

  // === NON-HOOK CODE BELOW (handlers, derived values, render) ===
  const isAdmin = currentUserProfile?.role === 'admin';

  // Filter spaces from context based on type, search query, and neighborhood filters
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = normalizedSearchQuery.length === 0
      || space.name.toLowerCase().includes(normalizedSearchQuery)
      || (space.description || '').toLowerCase().includes(normalizedSearchQuery)
      || (usersInSpaces.get(space.id) ?? []).some((user) => (
        user.displayName.toLowerCase().includes(normalizedSearchQuery)
      ));
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
  return <AudioProvider spaceId={currentSpaceId} userId={currentUserProfile?.id}>
      <div
        className="space-y-4 w-full"
        data-density={density}
        data-presence-realtime-status={realtimeConnectionStatus}
      >
        {bootstrapError && bootstrapError.kind !== 'unauthenticated' ? <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          role="alert"
        >
          <div>
            <p className="font-medium">Showing saved office data</p>
            <p className="text-muted-foreground">
              {bootstrapError.kind === 'rate-limited'
                ? 'Updates are temporarily rate limited.'
                : bootstrapError.message}
              {bootstrapError.kind === 'server' && bootstrapError.correlationId
                ? ` Reference: ${bootstrapError.correlationId}`
                : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshCompanyData()}>
            Retry
          </Button>
        </div> : null}

        {/* Add debug button and panel */}
        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={() => setShowDebugPanel(!showDebugPanel)} className="text-xs">
            {showDebugPanel ? 'Hide' : 'Show'} Debug Panel
          </Button>
        </div>

        {showDebugPanel && <SpaceDebugPanel spaces={spaces} onHighlightSpace={space => setHighlightedSpaceId(space.id)} onHidePanel={() => setShowDebugPanel(false)} />}

        {/* NowBoard - Office Pulse Summary (Story 3.10) */}
        <NowBoard
          spaces={spaces}
          users={users}
          usersInSpaces={usersInSpaces}
          neighborhoods={neighborhoods}
          activeFilters={neighborhoodFilters.activeFilters}
          onFilterToggle={neighborhoodFilters.toggleFilter}
          onShowAll={showAllNeighborhoods}
          isShowingAll={neighborhoodFilters.isShowingAll}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          density={density}
          onDensityToggle={() => setDensity((current) => (
            current === 'comfortable' ? 'compact' : 'comfortable'
          ))}
        />

        {realtimeConnectionStatus === 'degraded' ? (
          <div className="vo-stale-banner" role="status">
            Reconnecting — presence may be out of date
          </div>
        ) : null}

        <FloorPlanToolbar
          filterType={filterType}
          selectedSpace={selectedSpace}
          isAdmin={isAdmin}
          onFilterTypeChange={setFilterType}
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
          : <ModernFloorPlan
              spaces={neighborhoodFilteredSpaces || []}
              neighborhoods={neighborhoods}
              enableNeighborhoodGrouping={neighborhoodFilters.activeFilters.size === 0}
              collapsedNeighborhoodIds={collapsedNeighborhoodIds}
              onToggleNeighborhood={handleToggleNeighborhood}
              onExpandNeighborhood={handleExpandNeighborhood}
              onShowAll={showAllNeighborhoods}
              isShowingAll={neighborhoodFilters.isShowingAll}
              onSpaceSelect={handleSpaceSelect}
              onSpaceLeave={handleSpaceLeave}
              onOpenChat={space => void handleOpenChat(space)}
              onSpaceDoubleClick={space => void handleOpenChat(space)}
              onEditSpace={isAdmin ? handleEditSpace : undefined}
              highlightedSpaceId={highlightedSpaceId}
              density={density}
              isAdmin={isAdmin}
            />}
          </div>
        </Card>

        <YouAreHereChip
          spaceName={spaces.find((space) => space.id === currentSpaceId)?.name}
          onLocate={handleLocateCurrentSpace}
        />

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
            <RoomTemplates onSelectTemplate={_template => {
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
