'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import { CompanySpacesSettingsTab } from './CompanySpacesSettingsTab';

const NO_SPACE_VALUE = '__none__';

export function CompanySettings() {
  const { company, currentUserProfile, spaces, companyUsers, updateCompanyDetails, isLoading } = useCompany();
  const { showSuccess, showError } = useNotification();

  // Check if the current user is an admin
  const isAdmin = company?.adminIds.includes(currentUserProfile?.id || '') || false;

  const [companyNameDraft, setCompanyNameDraft] = useReducerState<string | null>(null);
  const [allowGuestAccessDraft, setAllowGuestAccessDraft] = useReducerState<boolean | null>(null);
  const [maxRoomsDraft, setMaxRoomsDraft] = useReducerState<string | null>(null);
  const [themeDraft, setThemeDraft] = useReducerState<string | null>(null);
  const [defaultSpaceIdDraft, setDefaultSpaceIdDraft] = useReducerState<string | null>(null);
  const [homeSpacesDraft, setHomeSpacesDraft] = useReducerState<Record<string, string> | null>(null);

  const companyName = companyNameDraft ?? company?.name ?? '';
  const allowGuestAccess = allowGuestAccessDraft ?? company?.settings?.allowGuestAccess ?? false;
  const maxRooms = maxRoomsDraft ?? company?.settings?.maxRooms?.toString() ?? '10';
  const theme = themeDraft ?? company?.settings?.theme ?? 'light';
  const defaultSpaceId = defaultSpaceIdDraft ?? company?.settings?.defaultSpaceId ?? '';
  const homeSpaces = homeSpacesDraft ?? company?.settings?.homeSpaces ?? {};

  const activeSpaces = useMemo(
    () => spaces.filter((space) => space.status === 'active' || space.status === 'available' || space.status === 'in_use'),
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

  const handleHomeSpaceChange = (userId: string, spaceId: string) => {
    setHomeSpacesDraft((prev) => ({
      ...(prev ?? homeSpaces),
      [userId]: spaceId,
    }));
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
              <Building2 className="size-4" />
              Spaces
            </TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
          <TabsContent value="general">
            <div className="gap-y-4">
              <div className="gap-y-2">
                <label htmlFor="companyName" className="text-sm font-medium">
                  Company Name
                </label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyNameDraft(e.target.value)}
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
            <div className="gap-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Guest Access</h3>
                  <p className="text-xs text-muted-foreground">
                    Allow users without accounts to join rooms with a link
                  </p>
                </div>
                <Switch
                  checked={allowGuestAccess}
                  onCheckedChange={setAllowGuestAccessDraft}
                  disabled={isLoading}
                />
              </div>
              
              <Separator />
              
              <div className="gap-y-2">
                <label htmlFor="maxRooms" className="text-sm font-medium">
                  Maximum Number of Rooms
                </label>
                <Input
                  id="maxRooms"
                  type="number"
                  min="1"
                  max="50"
                  value={maxRooms}
                  onChange={(e) => setMaxRoomsDraft(e.target.value)}
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

          <TabsContent value="spaces" className="gap-y-6">
            <CompanySpacesSettingsTab
              activeSpaces={activeSpaces}
              spacesByType={spacesByType}
              companyUsers={companyUsers}
              defaultSpaceId={defaultSpaceId}
              currentDefaultSpaceName={currentDefaultSpaceName}
              homeSpaces={homeSpaces}
              loading={isLoading}
              onDefaultSpaceChange={setDefaultSpaceIdDraft}
              onHomeSpaceChange={handleHomeSpaceChange}
              onSave={handleSaveSpaces}
            />
          </TabsContent>
          
          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="gap-y-4">
              <div className="gap-y-2">
                <label htmlFor="theme" className="text-sm font-medium">
                  Default Theme
                </label>
                <div className="flex gap-x-4">
                  <button
                    type="button"
                    className={`flex w-[48%] flex-col items-center p-4 border rounded-md cursor-pointer ${
                      theme === 'light' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setThemeDraft('light')}
                  >
                    <div className="h-24 w-full bg-white border border-gray-200 rounded-md mb-2 shadow-sm">
                      <div className="h-4 w-full bg-primary/10 rounded-t-md"></div>
                    </div>
                    <p className="text-sm text-center font-medium">Light</p>
                  </button>
                  
                  <button
                    type="button"
                    className={`flex w-[48%] flex-col items-center p-4 border rounded-md cursor-pointer ${
                      theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setThemeDraft('dark')}
                  >
                    <div className="h-24 w-full bg-gray-900 border border-gray-700 rounded-md mb-2 shadow-sm">
                      <div className="h-4 w-full bg-primary/30 rounded-t-md"></div>
                    </div>
                    <p className="text-sm text-center font-medium">Dark</p>
                  </button>
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
