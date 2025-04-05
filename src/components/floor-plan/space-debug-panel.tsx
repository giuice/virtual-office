'use client';

import { Space } from '@/types/database';
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useState } from 'react';
import { X } from 'lucide-react';

interface SpaceDebugPanelProps {
  spaces: Space[];
  onHighlightSpace?: (space: Space) => void;
  onHidePanel?: () => void;
}

export function SpaceDebugPanel({ 
  spaces, 
  onHighlightSpace,
  onHidePanel
}: SpaceDebugPanelProps) {
  const [expandedSpaceId, setExpandedSpaceId] = useState<string | null>(null);
  
  const toggleExpand = (spaceId: string) => {
    setExpandedSpaceId(expandedSpaceId === spaceId ? null : spaceId);
  };

  return (
    <Card className="w-full max-w-lg fixed right-4 top-4 z-50 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-md">Space Debug Panel</CardTitle>
          <CardDescription>
            {spaces.length} spaces loaded
          </CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0" 
          onClick={onHidePanel}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="max-h-[70vh] overflow-y-auto">
        {spaces.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No spaces found
          </div>
        ) : (
          <div className="space-y-2">
            {spaces.map(space => (
              <Card 
                key={space.id} 
                className="p-3 cursor-pointer hover:bg-accent/50"
                onClick={() => onHighlightSpace?.(space)}
                onDoubleClick={() => toggleExpand(space.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <div className="font-medium">{space.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {space.id.substring(0, 8)}...
                    </div>
                  </div>
                  <Badge 
                    variant={expandedSpaceId === space.id ? "default" : "outline"}
                    className="ml-2" 
                  >
                    {space.type}
                  </Badge>
                </div>
                
                {expandedSpaceId === space.id && (
                  <div className="mt-2 text-xs border-t pt-2">
                    <div className="grid grid-cols-2 gap-1">
                      <div className="font-medium">Position:</div>
                      <div>x:{space.position?.x || 'undefined'}, y:{space.position?.y || 'undefined'}</div>
                      
                      <div className="font-medium">Size:</div>
                      <div>w:{space.position?.width || 'undefined'}, h:{space.position?.height || 'undefined'}</div>
                      
                      <div className="font-medium">Status:</div>
                      <div>{space.status}</div>
                      
                      <div className="font-medium">Users:</div>
                      <div>{space.userIds?.length || 0}</div>
                    </div>
                    
                    <pre className="mt-2 p-2 bg-muted rounded-sm text-[10px] overflow-x-auto">
                      {JSON.stringify(space, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-1 pb-3 flex justify-between text-xs text-muted-foreground">
        <span>Click to highlight • Double-click to expand</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </CardFooter>
    </Card>
  );
}
