// src/components/floor-plan/room-template-selector.tsx
'use client'

import { useState } from 'react'
import { RoomTemplate, SpaceType } from './types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCompany } from '@/contexts/CompanyContext'
import { useCreateSpaceFromTemplate } from '@/hooks/mutations/useSpaceMutations'

interface RoomTemplateSelectorProps {
  templates: RoomTemplate[]
  open: boolean
  onOpenChange: (open: boolean) => void
  position?: { x: number; y: number; width?: number; height?: number }
}

export function RoomTemplateSelector({
  templates,
  open,
  onOpenChange,
  position // Optional position for the new room
}: RoomTemplateSelectorProps) {
  const { toast } = useToast()
  const { currentUserProfile } = useCompany()
  const createFromTemplate = useCreateSpaceFromTemplate()
  // Get room type label
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
  };
  
  // Get badge variant based on room type
  const getBadgeVariant = (type: SpaceType) => {
    switch (type) {
      case 'workspace': return 'success';
      case 'conference': return 'default';
      case 'social': return 'warning';
      case 'breakout': return 'secondary';
      case 'private_office': return 'destructive';
      case 'open_space': return 'outline';
      case 'lounge': return 'default';
      case 'lab': return 'secondary';
      default: return 'outline';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room Templates</DialogTitle>
          <DialogDescription>
            Choose a template to quickly create a new room
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => (
                <Card key={template.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <Badge variant={getBadgeVariant(template.type) as any}>
                      {getRoomTypeLabel(template.type)}
                    </Badge>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Capacity:</span>
                        <span>{template.capacity} people</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Size:</span>
                        <span>{template.defaultWidth}×{template.defaultHeight}</span>
                      </div>
                      {template.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.features.slice(0, 3).map((feature, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                          {template.features.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{template.features.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <div className="p-2 border-t">
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (!currentUserProfile?.companyId) {
                          toast({
                            title: "Error",
                            description: "Company ID not found. Please try again.",
                            variant: "destructive"
                          });
                          return;
                        }

                        const templatePosition = position ? {
                          ...position,
                          width: position.width || template.defaultWidth,
                          height: position.height || template.defaultHeight
                        } : undefined;

                        createFromTemplate.mutate(
                          {
                            template,
                            companyId: currentUserProfile.companyId,
                            position: templatePosition
                          },
                          {
                            onSuccess: () => {
                              toast({
                                title: "Success",
                                description: `Room "${template.name}" created successfully.`
                              });
                              onOpenChange(false);
                            },
                            onError: (error) => {
                              toast({
                                title: "Error",
                                description: error instanceof Error ? error.message : "Failed to create room from template",
                                variant: "destructive"
                              });
                            }
                          }
                        );
                      }}
                      disabled={createFromTemplate.isPending}
                    >
                      {createFromTemplate.isPending ? "Creating..." : "Use Template"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

