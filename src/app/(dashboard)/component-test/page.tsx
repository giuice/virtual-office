'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  ModernSpaceCard, 
  ModernUserAvatar,
  AvatarGroup,
  SpaceStatusBadge,
  SpaceTypeIndicator,
  CapacityIndicator
} from '@/components/floor-plan/modern';
import type { Space } from '@/types/database';

// Sample users for testing avatar groups  
const sampleUsers = [
  {
    id: '1',
    displayName: 'John Doe',
    status: 'online' as const,
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=John',
    currentSpaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '2', 
    displayName: 'Jane Smith',
    status: 'away' as const,
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Jane',
    currentSpaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '3',
    displayName: 'Bob Johnson', 
    status: 'busy' as const,
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Bob',
    currentSpaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '4',
    displayName: 'Alice Williams',
    status: 'offline' as const,
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Alice',
    currentSpaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '5',
    displayName: 'Sam Taylor',
    status: 'online' as const,
    currentSpaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
    // No avatar URL - will use initials
  },
];

// Sample space for testing space card
const sampleSpace: Space = {
  id: 'space-1',
  companyId: 'company-1',
  name: 'Meeting Room A',
  type: 'conference',
  status: 'available',
  capacity: 8,
  features: ['video', 'whiteboard'],
  position: { x: 100, y: 100, width: 200, height: 200 },
  description: 'A spacious meeting room for team discussions and presentations.',
  accessControl: { isPublic: true },
  createdBy: 'user-1',
  isTemplate: false,
  templateName: undefined,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export default function ComponentTestPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        heading="Component Test Page"
        description="Test and debug UI components"
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ModernSpaceCard Test */}
        <Card>
          <CardHeader>
            <CardTitle>ModernSpaceCard</CardTitle>
            <CardDescription>Test the space card component with different configurations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border p-4 rounded-lg">
              <h3 className="text-sm font-medium mb-3">Regular Card</h3>
              <ModernSpaceCard
                space={sampleSpace}
                usersInSpace={sampleUsers.slice(0, 3)}
                onEnterSpace={() => console.log('Enter space')}
                compact={false}
              />
            </div>
            
            <div className="border p-4 rounded-lg">
              <h3 className="text-sm font-medium mb-3">Compact Card</h3>
              <ModernSpaceCard
                space={{...sampleSpace, name: 'Compact Card'}}
                usersInSpace={sampleUsers.slice(0, 1)}
                onEnterSpace={() => console.log('Enter space')}
                compact={true}
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Avatar Components Test */}
        <Card>
          <CardHeader>
            <CardTitle>Avatar Components</CardTitle>
            <CardDescription>Test avatar and avatar group components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Individual avatars */}
            <div>
              <h3 className="text-sm font-medium mb-3">Individual Avatars</h3>
              <div className="flex gap-4">
                {sampleUsers.slice(0, 3).map(user => (
                  <ModernUserAvatar
                    key={user.id}
                    user={user}
                    size="md"
                  />
                ))}
              </div>
            </div>
            
            <Separator />
            
            {/* Avatar groups */}
            <div>
              <h3 className="text-sm font-medium mb-3">Avatar Groups</h3>
              
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">Small (3 avatars)</h4>
                  <AvatarGroup
                    users={sampleUsers.slice(0, 3)}
                    size="sm"
                  />
                </div>
                
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">Medium (4 avatars)</h4>
                  <AvatarGroup
                    users={sampleUsers.slice(0, 4)}
                    size="md"
                  />
                </div>
                
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">Large with max=3 (5 avatars)</h4>
                  <AvatarGroup
                    users={sampleUsers}
                    max={3}
                    size="lg"
                  />
                </div>
                
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">Empty state</h4>
                  <AvatarGroup
                    users={[]}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Status Indicators Test */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Status Indicators</CardTitle>
            <CardDescription>Test status badges and indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Space Status Badges */}
              <div>
                <h3 className="text-sm font-medium mb-3">Space Status Badges</h3>
                <div className="flex flex-wrap gap-2">
                  <SpaceStatusBadge status="available" />
                  <SpaceStatusBadge status="locked" />
                  <SpaceStatusBadge status="maintenance" />
                  <SpaceStatusBadge status="in_use" />
                </div>
              </div>
              
              {/* Space Type Indicators */}
              <div>
                <h3 className="text-sm font-medium mb-3">Space Type Indicators</h3>
                <div className="space-y-2">
                  <SpaceTypeIndicator type="workspace" showLabel />
                  <SpaceTypeIndicator type="conference" showLabel />
                  <SpaceTypeIndicator type="social" showLabel />
                  <SpaceTypeIndicator type="breakout" showLabel />
                </div>
              </div>
              
              {/* Capacity Indicators */}
              <div>
                <h3 className="text-sm font-medium mb-3">Capacity Indicators</h3>
                <div className="space-y-3">
                  <CapacityIndicator current={2} capacity={10} />
                  <CapacityIndicator current={5} capacity={10} />
                  <CapacityIndicator current={9} capacity={10} />
                  <CapacityIndicator current={3} capacity={0} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
