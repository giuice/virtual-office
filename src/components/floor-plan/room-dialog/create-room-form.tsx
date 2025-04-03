// src/components/floor-plan/room-dialog/create-room-form.tsx
'use client'

import { useState } from 'react';
import { Space, SpaceType, SpaceStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DialogFooter } from '@/components/ui/dialog';
import { availableFeatures } from './types';
import { GeneralTab } from './tabs/general-tab';
import { FeaturesTab } from './tabs/features-tab';
import { AccessControlTab } from './tabs/access-control-tab';

interface CreateRoomFormProps {
  roomData: Partial<Space>;
  setRoomData: React.Dispatch<React.SetStateAction<Partial<Space>>>;
  errors: Record<string, string>;
  formValid: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function CreateRoomForm({ 
  roomData, 
  setRoomData, 
  errors, 
  formValid, 
  onSave, 
  onCancel 
}: CreateRoomFormProps) {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="mt-4">
      <Tabs defaultValue="general" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="access">Access Control</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4 mt-4">
          <GeneralTab 
            roomData={roomData}
            setRoomData={setRoomData}
            errors={errors}
          />
        </TabsContent>
        
        <TabsContent value="features" className="space-y-4 mt-4">
          <FeaturesTab
            features={roomData.features}
            onChange={(features) => setRoomData({...roomData, features})}
            availableFeatures={availableFeatures}
          />
        </TabsContent>
        
        <TabsContent value="access" className="space-y-4 mt-4">
          <AccessControlTab 
            accessControl={roomData.accessControl}
            onChange={(accessControl) => setRoomData({...roomData, accessControl})}
          />
        </TabsContent>
      </Tabs>
      
      <DialogFooter className="mt-6">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!formValid}>
          Create Room
        </Button>
      </DialogFooter>
    </div>
  );
}