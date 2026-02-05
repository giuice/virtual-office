// src/components/floor-plan/room-dialog/tabs/info-tab.tsx
'use client'

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SpaceType } from '@/types/database';
import { RoomInfoTabProps } from '../types';
import { NeighborhoodSelector } from '../../neighborhoods/NeighborhoodSelector';

export function InfoTab({
  type,
  capacity,
  features,
  description,
  getRoomTypeLabel,
  neighborhoodId,
  onNeighborhoodChange,
  onCapacityChange
}: RoomInfoTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Room Type</h3>
        <p className="text-sm text-muted-foreground">{getRoomTypeLabel(type || 'workspace')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="capacity-edit">Capacity</Label>
        {onCapacityChange ? (
          <div className="flex items-center gap-2">
            <Input
              id="capacity-edit"
              type="number"
              min={1}
              max={50}
              value={capacity ?? 4}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 50) {
                  onCapacityChange(val);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">people</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{capacity} people</p>
        )}
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

      {/* Neighborhood Assignment (Story 3.9) */}
      {onNeighborhoodChange && (
        <div className="space-y-2">
          <Label htmlFor="neighborhood-edit">Neighborhood</Label>
          <NeighborhoodSelector
            value={neighborhoodId}
            onChange={onNeighborhoodChange}
            placeholder="Assign to a neighborhood"
          />
          <p className="text-xs text-muted-foreground">
            Group this room with others for easier navigation
          </p>
        </div>
      )}
    </div>
  );
}