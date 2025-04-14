// src/app/floor-plan-components/page.tsx
'use client';

import { useState } from 'react';
import { ModernSpaceCard, ModernUserAvatar, AvatarGroup, SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from '@/components/floor-plan/modern';
import { SpaceStatus, SpaceType, Space, UserPresenceData } from '@/types/database';
export default function ComponentsTestPage() {
  // Sample data for testing
  const sampleSpace : Space = {
    id: 'test-space-1',
    name: 'Meeting Room A',
    type: 'conference',
    status: 'available' as SpaceStatus,
    capacity: 8,
    companyId: 'company-1',
    position: { x: 0, y: 0, width: 100, height: 100 },
    features: ['video', 'whiteboard'],
    userIds: [],
    accessControl: { isPublic: true },
    description: 'A spacious meeting room for team discussions and presentations.'
  };
  
  const sampleUsers : UserPresenceData[] = [
    { id: 'user-1', displayName: 'John Doe', status: 'online' },
    { id: 'user-2', displayName: 'Jane Smith', status: 'away' },
    { id: 'user-3', displayName: 'Bob Johnson', status: 'busy' },
  ];
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Component Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-4 border rounded">
          <h2 className="text-lg font-medium mb-4">ModernSpaceCard</h2>
          <ModernSpaceCard 
            space={sampleSpace} 
            usersInSpace={sampleUsers}
            onEnterSpace={(id) => console.log('Enter space:', id)}
          />
          
          <div className="mt-4">
            <ModernSpaceCard 
              space={{...sampleSpace, name: 'Compact Card', type: 'social'}}
              usersInSpace={sampleUsers.slice(0, 1)}
              onEnterSpace={(id) => console.log('Enter space:', id)}
              compact={true}
            />
          </div>
        </div>
        
        <div className="p-4 border rounded">
          <h2 className="text-lg font-medium mb-4">Avatar Components</h2>
          
          <div className="flex gap-3 mb-4">
            <ModernUserAvatar user={sampleUsers[0]} size="sm" />
            <ModernUserAvatar user={sampleUsers[1]} size="md" />
            <ModernUserAvatar user={sampleUsers[2]} size="lg" />
          </div>
          
          <div className="mb-4">
            <h3 className="text-md font-medium mb-2">AvatarGroup</h3>
            <AvatarGroup users={sampleUsers} max={5} />
          </div>
        </div>
        
        <div className="p-4 border rounded">
          <h2 className="text-lg font-medium mb-4">Status Indicators</h2>
          
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium mb-1">Space Status Badges</h3>
              <div className="flex flex-wrap gap-2">
                <SpaceStatusBadge status="available" />
                <SpaceStatusBadge status="locked" />
                <SpaceStatusBadge status="maintenance" />
                <SpaceStatusBadge status="in_use" />
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium mb-1">Space Type Indicators</h3>
              <div className="flex flex-wrap gap-3">
                <SpaceTypeIndicator type="workspace" />
                <SpaceTypeIndicator type="conference" />
                <SpaceTypeIndicator type="social" />
                <SpaceTypeIndicator type="breakout" />
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium mb-1">Capacity Indicators</h3>
              <div className="flex flex-wrap gap-4">
                <CapacityIndicator current={2} capacity={10} />
                <CapacityIndicator current={5} capacity={10} />
                <CapacityIndicator current={9} capacity={10} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}