'use client';

import { useState } from 'react';
import { Space } from '@/types/database';
import { ModernFloorPlan } from '@/components/floor-plan/modern';
import { useSpaces } from '@/hooks/queries/useSpaces';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DomFloorPlan from '@/components/floor-plan/dom-floor-plan';
import { DashboardShell } from '@/components/shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';

export default function FloorPlanTestPage() {
  const { data: spaces, isLoading, error } = useSpaces('760a1331-93b7-4073-8f48-43794168afcd');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [layout, setLayout] = useState<'default' | 'compact' | 'spaced'>('default');
  const [useModernUI, setUseModernUI] = useState(true);
  const [compactCards, setCompactCards] = useState(false);

  const handleSpaceSelect = (space: Space) => {
    console.log('Selected space:', space);
    setSelectedSpaceId(space.id);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Error loading spaces: {error.message}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Avatar Components Demo"
        description="Explore and test various avatar components"
      />
      <div className="container mx-auto py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Floor Plan UI Test</CardTitle>
            <CardDescription>
              Compare the original and modern floor plan implementations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span>Modern UI</span>
                <Switch checked={useModernUI} onCheckedChange={setUseModernUI} />
              </div>

              {useModernUI && (
                <>
                  <div className="flex items-center gap-2">
                    <span>Compact Cards</span>
                    <Switch checked={compactCards} onCheckedChange={setCompactCards} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span>Layout:</span>
                    <Select value={layout} onValueChange={(value) => setLayout(value as any)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="compact">Compact</SelectItem>
                        <SelectItem value="spaced">Spaced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedSpaceId}
                  onClick={() => setSelectedSpaceId(null)}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-8">
          <Tabs defaultValue="fullView">
            <TabsList className="mb-4">
              <TabsTrigger value="fullView">Full View</TabsTrigger>
              <TabsTrigger value="sideBySide">Side by Side</TabsTrigger>
            </TabsList>

            <TabsContent value="fullView">
              {useModernUI ? (
                <ModernFloorPlan
                  spaces={spaces || []}
                  onSpaceSelect={handleSpaceSelect}
                  highlightedSpaceId={selectedSpaceId}
                  layout={layout}
                  compactCards={compactCards}
                  onUserClick={(userId) => console.log('Clicked user:', userId)}
                />
              ) : (
                <DomFloorPlan
                  spaces={spaces || []}
                  onSpaceSelect={handleSpaceSelect}
                  highlightedSpaceId={selectedSpaceId}
                />
              )}
            </TabsContent>

            <TabsContent value="sideBySide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-3">Original Floor Plan</h3>
                  <DomFloorPlan
                    spaces={spaces || []}
                    highlightedSpaceId={selectedSpaceId}
                  />
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-3">Modern Floor Plan</h3>
                  <ModernFloorPlan
                    spaces={spaces || []}
                    highlightedSpaceId={selectedSpaceId}
                    layout={layout}
                    compactCards={compactCards}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Space Properties</CardTitle>
            <CardDescription>
              Displays details of the selected space for debugging
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSpaceId ? (
              <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                {JSON.stringify(spaces?.find(s => s.id === selectedSpaceId), null, 2)}
              </pre>
            ) : (
              <p className="text-muted-foreground">Select a space to see its properties</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
