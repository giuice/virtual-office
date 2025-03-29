// src/components/floor-plan/room-dialog.tsx
// src/components/floor-plan/room-dialog.tsx
'use client'

import { useState, useEffect } from 'react';
// Import global Space and related types
import { Space, SpaceType, SpaceStatus, AccessControl, Reservation, User as GlobalUser } from '@/types/database'; 
// Keep local types if needed for UI elements or until refactored
import { User as LocalUser, RoomTemplate, spaceColors } from './types'; 
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Mic, 
  MicOff, 
  Monitor, 
  MessageSquare, 
  Users, 
  Lock, 
  Unlock, 
  Calendar, 
  Settings, 
  Trash2
} from 'lucide-react'
import { MessageDialog } from './message-dialog';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';
import { StatusAvatar } from '@/components/ui/status-avatar';
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany to get user details

interface RoomDialogProps {
  room: Space | null; // Expect global Space
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (newRoomData: Partial<Space>) => void; // Expect partial global Space data
  onUpdate?: (updatedRoom: Space) => void; // Expect global Space
  isCreating?: boolean
}

export function RoomDialog({ 
  room, 
  open, 
  onOpenChange, 
  onCreate, 
  onUpdate,
  isCreating = false 
}: RoomDialogProps) {
  // Get companyUsers from context to resolve user details
  const { companyUsers } = useCompany();

  // Room state - Use global Space type
  const [roomData, setRoomData] = useState<Partial<Space>>({
    id: '',
    name: '',
    type: 'workspace',
    status: 'available',
    capacity: 4,
    features: [],
    position: { x: 100, y: 100, width: 200, height: 150 },
    userIds: [], // Changed from users to userIds
    description: '',
    accessControl: { isPublic: true },
    reservations: []
  });
  
  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formValid, setFormValid] = useState(false)
  
  // UI state
  const [activeTab, setActiveTab] = useState('general')
  const [isMicActive, setIsMicActive] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRoomLocked, setIsRoomLocked] = useState(false)
  
  // For direct messaging - Keep using LocalUser for now if MessageDialog expects it
  const [messageUser, setMessageUser] = useState<LocalUser | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);

  // Initialize form with room data if editing
  useEffect(() => {
    if (room && !isCreating) {
      setRoomData({
        ...room,
        userIds: room.userIds || [], // Ensure userIds is initialized
        accessControl: room.accessControl || { isPublic: true },
        reservations: room.reservations || []
      });
      setIsRoomLocked(room.status === 'locked');
    } else {
      // Reset form for new room
      setRoomData({
        id: `room-${Date.now()}`, // Generate ID client-side for now, API might override
        name: '',
        type: 'workspace',
        status: 'available',
        capacity: 4,
        features: [],
        position: { x: 100, y: 100, width: 200, height: 150 },
        userIds: [], // Initialize userIds
        description: '',
        accessControl: { isPublic: true },
        reservations: []
      });
      setIsRoomLocked(false)
    }
  }, [room, isCreating])
  
  // Validate form
  useEffect(() => {
    const newErrors: Record<string, string> = {}
    
    if (!roomData.name?.trim()) {
      newErrors.name = 'Room name is required'
    } else if (roomData.name.length > 30) {
      newErrors.name = 'Room name must be 30 characters or less'
    }
    
    if (roomData.capacity && (roomData.capacity < 1 || roomData.capacity > 50)) {
      newErrors.capacity = 'Capacity must be between 1 and 50'
    }
    
    if (roomData.description && roomData.description.length > 200) {
      newErrors.description = 'Description must be 200 characters or less'
    }
    
    setErrors(newErrors)
    setFormValid(Object.keys(newErrors).length === 0);
  }, [roomData]);

  // TODO: Update handleMessageUser if MessageDialog is updated to use GlobalUser
  const handleMessageUser = (user: LocalUser) => { // Still uses LocalUser
    setMessageUser(user);
    setIsMessageDialogOpen(true);
  };
  
  // Helper function to get room color
  const getRoomColor = (type: SpaceType = 'workspace') => {
    return spaceColors[type] || spaceColors.default;
  }
  
  // Helper function to get type label
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
  }
  
  // Join room function (mock implementation)
  const handleJoinRoom = () => {
    console.log(`Joining room: ${roomData.id}`);
    // Here you would implement actual room joining logic with Socket.io
    onOpenChange(false);
  }
  
  // Save room function - Prepare data for API
  const handleSaveRoom = () => {
    if (!formValid) return;

    // Update room status based on lock state
    const finalStatus = isRoomLocked ? 'locked' : (roomData.status || 'available');

    // Construct the data object based on the global Space type
    const roomPayload: Partial<Space> = {
      // id is handled by API or set in useEffect for creation
      name: roomData.name || 'Untitled Room',
      type: roomData.type || 'workspace',
      status: finalStatus,
      capacity: roomData.capacity || 4,
      features: roomData.features || [],
      position: roomData.position || { x: 100, y: 100, width: 200, height: 150 },
      userIds: roomData.userIds || [], // Use userIds
      description: roomData.description,
      accessControl: roomData.accessControl || { isPublic: true },
      reservations: roomData.reservations || [],
      // createdBy, createdAt, updatedAt are handled by API/context
    };

    if (isCreating) {
      // Pass partial data for creation
      onCreate(roomPayload);
    } else if (onUpdate && roomData.id) {
      // Pass full object (including ID) for update
      onUpdate({ ...roomPayload, id: roomData.id } as Space);
    }

    onOpenChange(false);
  };
  
  // Available features for selection
  const availableFeatures = [
    { value: 'video', label: 'Video Conferencing' },
    { value: 'screen-sharing', label: 'Screen Sharing' },
    { value: 'whiteboard', label: 'Whiteboard' },
    { value: 'screens', label: 'Multiple Screens' },
    { value: 'coffee', label: 'Coffee Machine' },
    { value: 'snacks', label: 'Snacks' },
    { value: 'desk', label: 'Desk' },
    { value: 'privacy', label: 'Privacy' },
    { value: 'flexible-seating', label: 'Flexible Seating' },
    { value: 'projector', label: 'Projector' },
    { value: 'phone', label: 'Conference Phone' },
    { value: 'natural-light', label: 'Natural Light' },
    { value: 'quiet', label: 'Quiet Zone' },
    { value: 'accessible', label: 'Accessibility Features' }
  ];
  
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{isCreating ? 'Create New Room' : roomData.name}</DialogTitle>
              {!isCreating && roomData.type && (
                <Badge 
                  className={`border ${
                    roomData.type === 'workspace' ? 'bg-success/15 text-success border-success' :
                    roomData.type === 'conference' ? 'bg-primary/15 text-primary border-primary' :
                    roomData.type === 'social' ? 'bg-warning/15 text-warning border-warning' :
                    roomData.type === 'breakout' ? 'bg-secondary/15 text-secondary border-secondary' :
                    roomData.type === 'private_office' ? 'bg-destructive/15 text-destructive border-destructive' :
                    'bg-muted/15 text-muted-foreground border-muted-foreground'
                  }`}
                >
                  {getRoomTypeLabel(roomData.type)}
                </Badge>
              )}
            </div>
            {!isCreating && roomData.features && (
              <DialogDescription>
                {roomData.features.join(' • ')}
              </DialogDescription>
            )}
          </DialogHeader>

          {isCreating ? (
            // Create Room Form
            <div className="mt-4">
              <Tabs defaultValue="general" onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="access">Access Control</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="space-y-4 mt-4">
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
                </TabsContent>
                
                <TabsContent value="features" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Room Features</Label>
                    <ScrollArea className="h-[300px] border rounded-md p-4">
                      <div className="grid grid-cols-2 gap-2">
                        {availableFeatures.map(feature => (
                          <div key={feature.value} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`feature-${feature.value}`}
                              checked={(roomData.features || []).includes(feature.value)}
                              onChange={(e) => {
                                const features = [...(roomData.features || [])];
                                if (e.target.checked) {
                                  features.push(feature.value);
                                } else {
                                  const index = features.indexOf(feature.value);
                                  if (index !== -1) features.splice(index, 1);
                                }
                                setRoomData({...roomData, features});
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <Label htmlFor={`feature-${feature.value}`} className="text-sm">
                              {feature.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>
                
                <TabsContent value="access" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="public">Public Access</Label>
                        <Switch 
                          id="public"
                          checked={roomData.accessControl?.isPublic !== false}
                          onCheckedChange={(checked) => setRoomData({
                            ...roomData, 
                            accessControl: {
                              ...(roomData.accessControl || { isPublic: true }),
                              isPublic: checked
                            }
                          })}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {roomData.accessControl?.isPublic !== false 
                          ? "Anyone can join this room" 
                          : "Only specific users or roles can join this room"}
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveRoom} disabled={!formValid}>
                  Create Room
                </Button>
              </DialogFooter>
            </div>
          ) : (
            // View/Edit Room
            <div className="mt-4">
              <Tabs defaultValue="people">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="people">People ({roomData.userIds?.length || 0})</TabsTrigger> {/* Changed users to userIds */}
                  <TabsTrigger value="controls">Room Controls</TabsTrigger>
                  <TabsTrigger value="info">Room Info</TabsTrigger>
                </TabsList>
                
                <TabsContent value="people" className="mt-4">
                  <ScrollArea className="h-[200px] rounded-md border p-4">
                    <div className="space-y-4">
                      {/* Map over userIds and find user details in companyUsers */}
                      {roomData.userIds && roomData.userIds.length > 0 ? (
                        roomData.userIds.map(userId => {
                          const user = companyUsers.find(u => u.id === userId);
                          if (!user) return null; // Skip if user not found in context yet

                          // Adapt LocalUser structure for StatusAvatar/MessageDialog if needed
                          const localUser: LocalUser = {
                            id: 0, // LocalUser expects number ID, use placeholder or refactor components
                            name: user.displayName,
                            avatar: user.avatarUrl || '',
                            status: 'active', // LocalUser has different status types, map or use placeholder
                            activity: user.statusMessage || user.status || ''
                          };

                          return (
                            <div key={user.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {/* StatusAvatar might need update if it expects LocalUser */}
                                <StatusAvatar user={localUser} size="sm" />
                                <div>
                                  <p className="font-medium">{user.displayName}</p>
                                  <p className="text-xs text-muted-foreground">{user.statusMessage || user.status}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* TODO: Add presenting status check if needed */}
                                {/* {user.status === 'presenting' && ( ... )} */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Message user"
                                  onClick={() => handleMessageUser(localUser)} // Pass adapted LocalUser
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                          <Users className="h-10 w-10 mb-2 opacity-20" />
                          <p>No one is in this room yet</p>
                          <p className="text-sm">Be the first to join!</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="controls" className="mt-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isMicActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                        <span>Microphone</span>
                      </div>
                      <Button 
                        variant={isMicActive ? "default" : "outline"}
                        onClick={() => setIsMicActive(!isMicActive)}
                      >
                        {isMicActive ? "Active" : "Muted"}
                      </Button>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        <span>Screen Sharing</span>
                      </div>
                      <Button 
                        variant={isScreenSharing ? "default" : "outline"}
                        onClick={() => setIsScreenSharing(!isScreenSharing)}
                      >
                        {isScreenSharing ? "Sharing" : "Share Screen"}
                      </Button>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isRoomLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        <span>Room Access</span>
                      </div>
                      <Button 
                        variant={isRoomLocked ? "destructive" : "outline"}
                        onClick={() => setIsRoomLocked(!isRoomLocked)}
                      >
                        {isRoomLocked ? "Locked" : "Unlocked"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="info" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium">Room Type</h3>
                      <p className="text-sm text-muted-foreground">{getRoomTypeLabel(roomData.type || 'workspace')}</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium">Capacity</h3>
                      <p className="text-sm text-muted-foreground">{roomData.capacity} people</p>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium">Features</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {roomData.features && roomData.features.length > 0 ? (
                          roomData.features.map((feature, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No features specified</p>
                        )}
                      </div>
                    </div>
                    
                    {roomData.description && (
                      <div>
                        <h3 className="text-sm font-medium">Description</h3>
                        <p className="text-sm text-muted-foreground">{roomData.description}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter className="mt-6">
                <div className="text-sm text-muted-foreground">
                  {/* Use userIds.length */}
                  <span>{roomData.userIds?.length || 0}/{roomData.capacity || 4} people</span>
                </div>
                <Button type="submit" onClick={handleJoinRoom}>
                  Join Room {/* TODO: Implement actual join logic */}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Message Dialog */}
      <MessageDialog
        user={messageUser}
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
      />
    </>
  )
}
