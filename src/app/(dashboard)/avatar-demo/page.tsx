'use client';

import { useState } from 'react';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import  ModernUserAvatar  from '@/components/floor-plan/modern/ModernUserAvatar';
import { UploadableAvatar } from '@/components/profile/UploadableAvatar';
import  AvatarGroup  from '@/components/floor-plan/modern/AvatarGroup';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { UserPresenceData } from '@/types/database';
import { AvatarUser } from '@/lib/avatar-utils';

// Sample users for demonstration - compatible with ModernUserAvatar requirements
const sampleUsers: (UserPresenceData & AvatarUser)[] = [
  {
    id: '1',
    displayName: 'Alice Johnson',
    status: 'online',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Alice',
    current_space_id: null,
  },
  {
    id: '2',
    displayName: 'Bob Smith',
    status: 'away',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Bob',
    current_space_id: null,
  },
  {
    id: '3',
    displayName: 'Charlie Davis',
    status: 'busy',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Charlie',
    current_space_id: null,
  },
  {
    id: '4',
    displayName: 'Diana Miller',
    status: 'offline',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Diana',
    current_space_id: null,
  },
  {
    id: '5',
    displayName: 'Edward Wilson',
    status: 'online',
    avatarUrl: undefined,
    current_space_id: null,
    // No avatar URL - will use initials
  },
];

export default function AvatarDemoPage() {
  const { user } = useAuth();
  const { currentUserProfile } = useCompany();
  const [uploadingDemo, setUploadingDemo] = useState(false);

  // Simulate avatar upload
  const handleDemoAvatarChange = async (file: File) => {
    setUploadingDemo(true);
    // Simulate network request
    console.log('Uploading avatar:', file.name, 'Size:', file.size);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setUploadingDemo(false);
    // In a real implementation, this would call the actual API
    return Promise.resolve();
  };

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Avatar Components Demo"
        description="Explore and test various avatar components"
      />
      
      <Tabs defaultValue="showcase" className="w-full">
        <TabsList>
          <TabsTrigger value="showcase">Component Showcase</TabsTrigger>
          <TabsTrigger value="examples">Usage Examples</TabsTrigger>
          <TabsTrigger value="upload">Upload Demo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="showcase" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Avatar Variants</CardTitle>
              <CardDescription>
                Different avatar sizes and states
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Avatar sizes */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Sizes</h3>
                  <div className="flex items-end gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={sampleUsers[0]} 
                        size="sm" 
                      />
                      <span className="text-xs text-muted-foreground">xs</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={sampleUsers[0]} 
                        size="sm" 
                      />
                      <span className="text-xs text-muted-foreground">sm</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={sampleUsers[0]} 
                        size="md" 
                      />
                      <span className="text-xs text-muted-foreground">md</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={sampleUsers[0]} 
                        size="lg" 
                      />
                      <span className="text-xs text-muted-foreground">lg</span>
                    </div>
                  </div>
                </div>
                
                {/* Status indicators */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Status Indicators</h3>
                  <div className="flex gap-4">
                    {sampleUsers.slice(0, 4).map(user => (
                      <div key={user.id} className="flex flex-col items-center gap-2">
                        <ModernUserAvatar 
                          user={user} 
                          size="md" 
                        />
                        <span className="text-xs text-muted-foreground capitalize">
                          {user.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Fallback cases */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Fallback Behavior</h3>
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={{
                          id: 'f1',
                          displayName: 'With Avatar',
                          avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=WithAvatar'
                        }} 
                        size="md" 
                      />
                      <span className="text-xs text-muted-foreground">With Avatar</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={{
                          id: 'f2',
                          displayName: 'No Avatar',
                        }} 
                        size="md" 
                      />
                      <span className="text-xs text-muted-foreground">No Avatar</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2">
                      <ModernUserAvatar 
                        user={{
                          id: 'f3',
                          displayName: 'John Doe',
                          avatarUrl: 'https://invalid-url-that-will-fail.com/avatar.png'
                        }} 
                        size="md" 
                      />
                      <span className="text-xs text-muted-foreground">Invalid URL</span>
                    </div>
                  </div>
                </div>
                
                {/* Avatar Groups */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Avatar Groups</h3>
                  <div className="space-y-4">
                    <div>
                      <AvatarGroup users={sampleUsers.slice(0, 3)} size="sm" />
                      <div className="mt-2 text-xs text-muted-foreground">3 users</div>
                    </div>
                    
                    <div>
                      <AvatarGroup users={sampleUsers} max={3} size="md" />
                      <div className="mt-2 text-xs text-muted-foreground">5 users with max=3</div>
                    </div>
                    
                    <div>
                      <AvatarGroup users={[]} showEmpty size="sm" />
                      <div className="mt-2 text-xs text-muted-foreground">Empty state</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="examples" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Examples</CardTitle>
              <CardDescription>
                How avatars are used in different contexts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {/* Chat example */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">In Chat</h3>
                  <div className="border rounded-lg p-4 max-w-2xl">
                    <div className="flex items-start gap-2 mb-4">
                      <ModernUserAvatar 
                        user={sampleUsers[0]} 
                        size="sm" 
                      />
                      <div className="bg-primary/10 rounded-lg p-3 max-w-[80%]">
                        <p className="text-sm">Hi everyone! Just checking in on the project progress.</p>
                        <span className="text-xs text-muted-foreground mt-1 block">10:30 AM</span>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2 mb-4">
                      <ModernUserAvatar 
                        user={sampleUsers[1]} 
                        size="sm" 
                      />
                      <div className="bg-secondary/10 rounded-lg p-3 max-w-[80%]">
                        <p className="text-sm">Hey Alice! I'm working on the design assets now. Should be done by EOD.</p>
                        <span className="text-xs text-muted-foreground mt-1 block">10:32 AM</span>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <ModernUserAvatar 
                        user={sampleUsers[2]} 
                        size="sm" 
                      />
                      <div className="bg-secondary/10 rounded-lg p-3 max-w-[80%]">
                        <p className="text-sm">I've finished the backend integration. Let's sync up at 2 PM?</p>
                        <span className="text-xs text-muted-foreground mt-1 block">10:35 AM</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* User list example */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">In User List</h3>
                  <div className="border rounded-lg p-4 max-w-md">
                    <div className="space-y-2">
                      {sampleUsers.map(user => (
                        <div key={user.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
                          <ModernUserAvatar 
                            user={user} 
                            size="sm" 
                          />
                          <div>
                            <p className="text-sm font-medium">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Floor plan example */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">In Floor Plan</h3>
                  <div className="border rounded-lg p-6 max-w-md">
                    <div className="flex flex-col items-center bg-primary/5 p-4 rounded-lg border-2 border-primary/20">
                      <h4 className="font-medium mb-3">Conference Room A</h4>
                      <AvatarGroup 
                        users={sampleUsers.slice(0, 3)} 
                        size="md" 
                        className="mb-2"
                      />
                      <span className="text-xs text-muted-foreground">3 participants</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="upload" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Avatar Upload</CardTitle>
              <CardDescription>
                Test the avatar upload functionality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="flex flex-col items-center space-y-4">
                  <UploadableAvatar
                    user={currentUserProfile || {
                      id: 'demo',
                      displayName: 'Demo User',
                      status: 'online',
                      avatarUrl: user?.user_metadata?.avatar_url || '',
                    }}
                    onAvatarChange={handleDemoAvatarChange}
                    size="xl"
                    uploading={uploadingDemo}
                  />
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    This is a demo of the avatar upload functionality. 
                    It simulates a 2-second upload but doesn't actually save anything.
                  </p>
                </div>
                
                <div className="flex-1 space-y-4">
                  <h3 className="text-lg font-medium">How It Works</h3>
                  <ol className="space-y-2 list-decimal pl-5">
                    <li>Hover over the avatar to see the upload controls</li>
                    <li>Click the camera icon to select an image</li>
                    <li>The upload process will be simulated (2 seconds)</li>
                    <li>While uploading, a loading spinner will be displayed</li>
                    <li>In a real implementation, the image would be saved to Supabase storage</li>
                  </ol>
                  
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Implementation Notes</h4>
                    <ul className="text-sm space-y-1 list-disc pl-5">
                      <li>Uses the native file input with a custom UI</li>
                      <li>Provides image preview before upload</li>
                      <li>Handles loading and error states</li>
                      <li>Creates a unique filename based on user ID</li>
                      <li>Updates the user profile after successful upload</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
