// src/components/floor-plan/room-management.tsx
// src/components/floor-plan/room-management.tsx
'use client'

import { useState } from 'react';
// Import global Space type and local types if still needed
import { Space, SpaceType } from '@/types/database'; // Use global Space and SpaceType
import { RoomTemplate } from './types'; // Keep local RoomTemplate for now
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Copy, Edit, Plus, Settings, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePresence } from '@/contexts/PresenceContext';

export interface RoomManagementProps {
  spaces: Space[]; // Expect global Space[]
  onCreateRoom: () => void;
  onEditRoom: (room: Space) => void; // Expect global Space
  onDeleteRoom: (roomId: string) => void;
  onDuplicateRoom: (room: Space) => void; // Expect global Space
  onOpenChat?: (room: Space) => void; // Expect global Space
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoomManagement({
  spaces,
  onCreateRoom,
  onEditRoom,
  onDeleteRoom,
  onDuplicateRoom,
  onOpenChat,
  open,
  onOpenChange
}: RoomManagementProps) {
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedRooms, setSelectedRooms] = useState<string[]>([])
  
  const { usersInSpaces } = usePresence();

  // Filter spaces based on type and search query
  const filteredSpaces = spaces.filter(space => {
    const matchesType = filterType === 'all' || space.type === filterType;
    const matchesSearch = space.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (space.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  
  // Handle bulk room deletion
  const handleBulkDelete = () => {
    selectedRooms.forEach(roomId => {
      onDeleteRoom(roomId);
    });
    setSelectedRooms([]);
  };
  
  // Handle room selection toggle for bulk operations
  const handleRoomSelectionToggle = (roomId: string) => {
    if (selectedRooms.includes(roomId)) {
      setSelectedRooms(prev => prev.filter(id => id !== roomId));
    } else {
      setSelectedRooms(prev => [...prev, roomId]);
    }
  };
  
  // Get room type label
  const getRoomTypeLabel = (type: SpaceType) => {
    switch (type) {
      case 'workspace': return 'Workspace';
      case 'conference': return 'Conference Room';
      case 'social': return 'Social Space';
      case 'breakout': return 'Breakout Room';
      case 'private_office': return 'Private Office';
      case 'open_space': return 'Open Space';
      case 'lounge': return 'Lounge';
      case 'lab': return 'Lab';
      default: return 'Room';
    }
  };
  
  // Get room status label
  const getRoomStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'available': return 'Available';
      case 'maintenance': return 'Maintenance';
      case 'locked': return 'Locked';
      case 'reserved': return 'Reserved';
      case 'in_use': return 'In Use';
      default: return status;
    }
  };
  
  // Get badge variant based on room type
  const getBadgeVariant = (type: SpaceType) => {
    switch (type) {
      case 'workspace': return 'success';
      case 'conference': return 'default';
      case 'social': return 'warning';
      case 'breakout': return 'secondary';
      case 'private_office': return 'destructive';
      case 'open_space': return 'outline';
      case 'lounge': return 'default';
      case 'lab': return 'secondary';
      default: return 'outline';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room Management</DialogTitle>
          <DialogDescription>
            Manage all rooms in your virtual office
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[250px]"
              />
              
              <Select 
                value={filterType} 
                onValueChange={setFilterType}
              >
                <SelectTrigger className="w-[180px]">
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
            
            {selectedRooms.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                className="flex items-center gap-2"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedRooms.length})
              </Button>
            )}
          </div>
          
          <ScrollArea className="h-[400px] border rounded-md">
            <div className="p-4 space-y-2">
              {filteredSpaces.length > 0 ? (
                filteredSpaces.map(space => (
                  <div 
                    key={space.id} 
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      selectedRooms.includes(space.id) ? 'bg-muted border-primary' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRooms.includes(space.id)}
                        onChange={() => handleRoomSelectionToggle(space.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{space.name}</h3>
                          <Badge variant={getBadgeVariant(space.type) as any} className="text-xs">
                            {getRoomTypeLabel(space.type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{space.capacity} capacity</span>
                          <span>•</span>
                          <span>{getRoomStatusLabel(space.status)}</span>
                          
                          {usersInSpaces.get(space.id)?.length || 0 > 0 && ( 
                            <>
                              <span>•</span>
                              <span>{usersInSpaces.get(space.id)?.length} users</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => onEditRoom(space)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => onDuplicateRoom(space)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {onOpenChat && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => onOpenChat(space)}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => onDeleteRoom(space.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <p>No rooms found</p>
                  <p className="text-sm">Try adjusting your filters or create a new room</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onCreateRoom}>
            <Plus className="h-4 w-4 mr-2" />
            Create Room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
