'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NO_SPACE_VALUE = '__none__';

export function CompanySettings() {
  const { company, currentUserProfile, spaces, companyUsers, updateCompanyDetails, isLoading } = useCompany();
  const { showSuccess, showError } = useNotification();

  // Check if the current user is an admin
  const isAdmin = company?.adminIds.includes(currentUserProfile?.id || '') || false;

  // Company Name
  const [companyName, setCompanyName] = useState(company?.name || '');
  
  // Company Settings
  const [allowGuestAccess, setAllowGuestAccess] = useState(
    company?.settings?.allowGuestAccess || false
  );
  const [maxRooms, setMaxRooms] = useState(
    company?.settings?.maxRooms?.toString() || '10'
  );
  const [theme, setTheme] = useState(company?.settings?.theme || 'light');
  const [defaultSpaceId, setDefaultSpaceId] = useState(company?.settings?.defaultSpaceId || '');
  const [homeSpaces, setHomeSpaces] = useState<Record<string, string>>(company?.settings?.homeSpaces || {});

  useEffect(() => {
    setCompanyName(company?.name || '');
    setAllowGuestAccess(company?.settings?.allowGuestAccess || false);
    setMaxRooms(company?.settings?.maxRooms?.toString() || '10');
    setTheme(company?.settings?.theme || 'light');
    setDefaultSpaceId(company?.settings?.defaultSpaceId || '');
    setHomeSpaces(company?.settings?.homeSpaces || {});
  }, [company]);

  const activeSpaces = useMemo(
    () => spaces.filter((space) => space.status === 'active'),
    [spaces]
  );

  const spacesByType = useMemo(
    () =>
      activeSpaces.reduce<Record<string, typeof activeSpaces>>((acc, space) => {
        const type = space.type || 'workspace';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(space);
        return acc;
      }, {}),
    [activeSpaces]
  );

  const currentDefaultSpaceName = useMemo(
    () => activeSpaces.find((space) => space.id === defaultSpaceId)?.name,
    [activeSpaces, defaultSpaceId]
  );

  const handleSaveGeneral = async () => {
    if (!company || !isAdmin) return;

    try {
      await updateCompanyDetails({
        name: companyName,
      });
      showSuccess({ description: 'Company general settings updated successfully' });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to update company settings',
      });
    }
  };

  const handleSaveFeatures = async () => {
    if (!company || !isAdmin) return;

    try {
      await updateCompanyDetails({
        settings: {
          ...company.settings,
          allowGuestAccess,
          maxRooms: parseInt(maxRooms, 10),
          theme,
        },
      });
      showSuccess({ description: 'Company feature settings updated successfully' });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to update company settings',
      });
    }
  };

  const handleSaveSpaces = async () => {
    if (!company || !isAdmin) return;

    try {
      await updateCompanyDetails({
        settings: {
          ...company.settings,
          defaultSpaceId: defaultSpaceId || undefined,
          homeSpaces: Object.fromEntries(
            Object.entries(homeSpaces).filter(([, spaceId]) => Boolean(spaceId))
          ),
        },
      });
      showSuccess({ description: 'Home space assignments saved' });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Failed to save settings',
      });
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Settings</CardTitle>
          <CardDescription>
            You need administrator privileges to access company settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Settings</CardTitle>
        <CardDescription>
          Manage your virtual office workspace settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general">
          <TabsList className="mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="spaces" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Spaces
            </TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
          <TabsContent value="general">
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="companyName" className="text-sm font-medium">
                  Company Name
                </label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter company name"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed throughout the virtual office
                </p>
              </div>
              
              <div className="pt-4">
                <Button onClick={handleSaveGeneral} disabled={isLoading || !companyName}>
                  {isLoading ? 'Saving...' : 'Save General Settings'}
                </Button>
              </div>
            </div>
          </TabsContent>
          
          {/* Features Tab */}
          <TabsContent value="features">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Guest Access</h3>
                  <p className="text-xs text-muted-foreground">
                    Allow users without accounts to join rooms with a link
                  </p>
                </div>
                <Switch
                  checked={allowGuestAccess}
                  onCheckedChange={setAllowGuestAccess}
                  disabled={isLoading}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <label htmlFor="maxRooms" className="text-sm font-medium">
                  Maximum Number of Rooms
                </label>
                <Input
                  id="maxRooms"
                  type="number"
                  min="1"
                  max="50"
                  value={maxRooms}
                  onChange={(e) => setMaxRooms(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Limit the number of rooms that can be created in your office (1-50)
                </p>
              </div>
              
              <div className="pt-4">
                <Button 
                  onClick={handleSaveFeatures} 
                  disabled={isLoading || parseInt(maxRooms, 10) < 1 || parseInt(maxRooms, 10) > 50}
                >
                  {isLoading ? 'Saving...' : 'Save Feature Settings'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="spaces" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Company Default Space</CardTitle>
                <CardDescription className="text-sm font-normal">
                  Where new team members land on their first login
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={defaultSpaceId || NO_SPACE_VALUE}
                  onValueChange={(value) => setDefaultSpaceId(value === NO_SPACE_VALUE ? '' : value)}
                  disabled={isLoading || activeSpaces.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a space..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SPACE_VALUE}>No default space</SelectItem>
                    {Object.entries(spacesByType).map(([type, typeSpaces]) => (
                      <SelectGroup key={type}>
                        <SelectLabel className="capitalize">{type.replace(/_/g, ' ')}</SelectLabel>
                        {typeSpaces.map((space) => (
                          <SelectItem key={space.id} value={space.id}>
                            {space.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {currentDefaultSpaceName ? (
                  <p className="text-xs font-normal text-muted-foreground">
                    Currently: {currentDefaultSpaceName}
                  </p>
                ) : (
                  <p className="text-xs font-normal italic text-muted-foreground">
                    No default space selected. New members will join the first available workspace.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Home Space Assignments</CardTitle>
                <CardDescription className="text-sm font-normal">
                  Assign each team member their home room (like a desk)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {companyUsers.length === 0 ? (
                  <p className="text-sm font-normal italic text-muted-foreground">No team members found</p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto">
                    {companyUsers.map((user, index) => (
                      <div
                        key={user.id}
                        className={cn(
                          'flex items-center gap-3 py-3',
                          index < companyUsers.length - 1 && 'border-b border-border'
                        )}
                      >
                        <EnhancedAvatarV2 user={user} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-normal text-foreground">
                          {user.displayName}
                        </span>
                        <Select
                          value={homeSpaces[user.id] || NO_SPACE_VALUE}
                          onValueChange={(value) => {
                            setHomeSpaces((prev) => ({
                              ...prev,
                              [user.id]: value === NO_SPACE_VALUE ? '' : value,
                            }));
                          }}
                          disabled={isLoading || activeSpaces.length === 0}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Not assigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SPACE_VALUE}>Not assigned</SelectItem>
                            {activeSpaces.map((space) => (
                              <SelectItem key={space.id} value={space.id}>
                                {space.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSaveSpaces} disabled={isLoading}>
                Save Changes
              </Button>
            </div>
          </TabsContent>
          
          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="theme" className="text-sm font-medium">
                  Default Theme
                </label>
                <div className="flex space-x-4">
                  <div 
                    className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                      theme === 'light' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setTheme('light')}
                    style={{ width: '48%' }}
                  >
                    <div className="h-24 w-full bg-white border border-gray-200 rounded-md mb-2 shadow-sm">
                      <div className="h-4 w-full bg-primary/10 rounded-t-md"></div>
                    </div>
                    <p className="text-sm text-center font-medium">Light</p>
                  </div>
                  
                  <div 
                    className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                      theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setTheme('dark')}
                    style={{ width: '48%' }}
                  >
                    <div className="h-24 w-full bg-gray-900 border border-gray-700 rounded-md mb-2 shadow-sm">
                      <div className="h-4 w-full bg-primary/30 rounded-t-md"></div>
                    </div>
                    <p className="text-sm text-center font-medium">Dark</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Set the default theme for all users. Users can override this in their personal settings.
                </p>
              </div>
              
              <div className="pt-4">
                <Button onClick={handleSaveFeatures} disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Appearance Settings'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="border-t pt-6 bg-muted/20">
        <p className="text-xs text-muted-foreground">
          These settings apply to all members of your virtual office. Individual users may override some settings in their personal preferences.
        </p>
      </CardFooter>
    </Card>
  );
}
