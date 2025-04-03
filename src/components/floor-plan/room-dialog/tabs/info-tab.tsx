// src/components/floor-plan/room-dialog/tabs/info-tab.tsx
'use client'

import { Badge } from '@/components/ui/badge';
import { SpaceType } from '@/types/database';
import { RoomInfoTabProps } from '../types';

export function InfoTab({ 
  type, 
  capacity, 
  features, 
  description, 
  getRoomTypeLabel 
}: RoomInfoTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Room Type</h3>
        <p className="text-sm text-muted-foreground">{getRoomTypeLabel(type || 'workspace')}</p>
      </div>
      
      <div>
        <h3 className="text-sm font-medium">Capacity</h3>
        <p className="text-sm text-muted-foreground">{capacity} people</p>
      </div>
      
      <div>
        <h3 className="text-sm font-medium">Features</h3>
        <div className="flex flex-wrap gap-1 mt-1">
          {features && features.length > 0 ? (
            features.map((feature, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {feature}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No features specified</p>
          )}
        </div>
      </div>
      
      {description && (
        <div>
          <h3 className="text-sm font-medium">Description</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}
    </div>
  );
}