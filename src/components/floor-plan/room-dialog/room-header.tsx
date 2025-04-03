// src/components/floor-plan/room-dialog/room-header.tsx
'use client'

import { Badge } from '@/components/ui/badge';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Space, SpaceType } from '@/types/database';
import { getRoomTypeLabel } from './utils';

interface RoomHeaderProps {
  name: string | undefined;
  type: SpaceType | undefined;
  features: string[] | undefined;
  isCreating: boolean;
}

export function RoomHeader({ name, type, features, isCreating }: RoomHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex items-center justify-between">
        <DialogTitle>{isCreating ? 'Create New Room' : name}</DialogTitle>
        {!isCreating && type && (
          <Badge 
            className={`border ${
              type === 'workspace' ? 'bg-success/15 text-success border-success' :
              type === 'conference' ? 'bg-primary/15 text-primary border-primary' :
              type === 'social' ? 'bg-warning/15 text-warning border-warning' :
              type === 'breakout' ? 'bg-secondary/15 text-secondary border-secondary' :
              type === 'private_office' ? 'bg-destructive/15 text-destructive border-destructive' :
              'bg-muted/15 text-muted-foreground border-muted-foreground'
            }`}
          >
            {getRoomTypeLabel(type)}
          </Badge>
        )}
      </div>
      {!isCreating && features && (
        <DialogDescription>
          {features.join(' • ')}
        </DialogDescription>
      )}
    </DialogHeader>
  );
}