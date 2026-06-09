'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, MessageSquare, Plus, Settings, FolderOpen, Grid2X2, LayoutGrid, Monitor as MonitorIcon } from 'lucide-react';
import { SpaceAudioControls } from './SpaceAudioControls';
import type { Space } from '@/types/database';
import type { FloorPlanPerspective } from './modern/ModernFloorPlan';

interface FloorPlanToolbarProps {
  filterType: string;
  perspective: FloorPlanPerspective;
  selectedSpace: Space | null;
  isAdmin: boolean;
  onFilterTypeChange: (value: string) => void;
  onPerspectiveChange: (value: FloorPlanPerspective) => void;
  onOpenRoomManagement: () => void;
  onOpenTemplateDialog: () => void;
  onCreateRoom: () => void;
  onOpenNeighborhoodManager: () => void;
  onOpenSelectedChat: () => void;
}

export function FloorPlanToolbar({
  filterType,
  perspective,
  selectedSpace,
  isAdmin,
  onFilterTypeChange,
  onPerspectiveChange,
  onOpenRoomManagement,
  onOpenTemplateDialog,
  onCreateRoom,
  onOpenNeighborhoodManager,
  onOpenSelectedChat,
}: FloorPlanToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={onOpenRoomManagement}>
          <Settings className="size-4" />
          Manage Rooms
        </Button>

        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={onOpenTemplateDialog}>
          <Copy className="size-4" />
          Use Template
        </Button>

        <Select value={filterType} onValueChange={onFilterTypeChange}>
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
        <div
          className="flex items-center gap-1 border rounded-lg p-1"
          style={{
            backgroundColor: 'var(--vo-glass-bg)',
            borderColor: 'var(--vo-glass-border)',
          }}
        >
          <span className="text-xs text-muted-foreground px-2 font-medium uppercase tracking-wide">View</span>
          <Button variant={perspective === 'orbit' ? 'default' : 'ghost'} size="sm" onClick={() => onPerspectiveChange('orbit')} className="h-7 px-2" title="Orbit View - Standard layout">
            <LayoutGrid className="size-4" />
          </Button>
          <Button variant={perspective === 'analyst' ? 'default' : 'ghost'} size="sm" onClick={() => onPerspectiveChange('analyst')} className="h-7 px-2" title="Analyst View - Dense layout with sparklines">
            <Grid2X2 className="size-4" />
          </Button>
          <Button variant={perspective === 'cinema' ? 'default' : 'ghost'} size="sm" onClick={() => onPerspectiveChange('cinema')} className="h-7 px-2" title="Cinema View - Large cards">
            <MonitorIcon className="size-4" />
          </Button>
        </div>

        {isAdmin && (
          <Button variant="default" size="sm" className="flex items-center gap-2" onClick={onCreateRoom}>
            <Plus className="size-4" />
            Create Room
          </Button>
        )}

        {isAdmin && (
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={onOpenNeighborhoodManager}>
            <FolderOpen className="size-4" />
            Neighborhoods
          </Button>
        )}

        {selectedSpace && (
          <>
            <SpaceAudioControls />
            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={onOpenSelectedChat}>
              <MessageSquare className="size-4" />
              Chat in Room
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
