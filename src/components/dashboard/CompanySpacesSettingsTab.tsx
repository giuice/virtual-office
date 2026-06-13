'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { cn } from '@/lib/utils';
import type { Space, User } from '@/types/database';

const NO_SPACE_VALUE = '__none__';

interface CompanySpacesSettingsTabProps {
  activeSpaces: Space[];
  spacesByType: Record<string, Space[]>;
  companyUsers: User[];
  defaultSpaceId: string;
  currentDefaultSpaceName?: string;
  homeSpaces: Record<string, string>;
  loading: boolean;
  onDefaultSpaceChange: (spaceId: string) => void;
  onHomeSpaceChange: (userId: string, spaceId: string) => void;
  onSave: () => void;
}

export function CompanySpacesSettingsTab({
  activeSpaces,
  spacesByType,
  companyUsers,
  defaultSpaceId,
  currentDefaultSpaceName,
  homeSpaces,
  loading,
  onDefaultSpaceChange,
  onHomeSpaceChange,
  onSave,
}: CompanySpacesSettingsTabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Company Default Space</CardTitle>
          <CardDescription className="text-sm font-normal">
            Where new team members land on their first login
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-y-3">
          <Select
            value={defaultSpaceId || NO_SPACE_VALUE}
            onValueChange={(value) => onDefaultSpaceChange(value === NO_SPACE_VALUE ? '' : value)}
            disabled={loading || activeSpaces.length === 0}
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
                    onValueChange={(value) => onHomeSpaceChange(user.id, value === NO_SPACE_VALUE ? '' : value)}
                    disabled={loading || activeSpaces.length === 0}
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
        <Button onClick={onSave} disabled={loading}>
          Save Changes
        </Button>
      </div>
    </>
  );
}
