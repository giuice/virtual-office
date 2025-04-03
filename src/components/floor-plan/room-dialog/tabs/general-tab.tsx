// src/components/floor-plan/room-dialog/tabs/general-tab.tsx
'use client'

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Space, SpaceStatus, SpaceType } from '@/types/database';

interface GeneralTabProps {
  roomData: Partial<Space>;
  setRoomData: React.Dispatch<React.SetStateAction<Partial<Space>>>;
  errors: Record<string, string>;
}

export function GeneralTab({ roomData, setRoomData, errors }: GeneralTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">
          Room Name <span className="text-destructive">*</span>
        </Label>
        <Input 
          id="name" 
          value={roomData.name || ''} 
          onChange={(e) => setRoomData({...roomData, name: e.target.value})}
          placeholder="e.g., Main Conference Room"
          className={errors.name ? "border-destructive" : ""}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">Room Type</Label>
          <Select 
            value={roomData.type || 'workspace'} 
            onValueChange={(value) => setRoomData({...roomData, type: value as SpaceType})}
          >
            <SelectTrigger id="type">
              <SelectValue placeholder="Select room type" />
            </SelectTrigger>
            <SelectContent>
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
        
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select 
            value={roomData.status || 'available'} 
            onValueChange={(value) => setRoomData({...roomData, status: value as SpaceStatus})}
          >
            <SelectTrigger id="status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="capacity">Capacity</Label>
        <div className="flex items-center gap-4">
          <Slider 
            id="capacity"
            min={1}
            max={50}
            step={1}
            value={[roomData.capacity || 4]}
            onValueChange={(value) => setRoomData({...roomData, capacity: value[0]})}
            className="flex-1"
          />
          <span className="w-12 text-center">{roomData.capacity || 4}</span>
        </div>
        {errors.capacity && (
          <p className="text-xs text-destructive">{errors.capacity}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea 
          id="description" 
          value={roomData.description || ''} 
          onChange={(e) => setRoomData({...roomData, description: e.target.value})}
          placeholder="Describe the purpose and features of this room"
          className={`min-h-[80px] ${errors.description ? "border-destructive" : ""}`}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>
    </div>
  );
}