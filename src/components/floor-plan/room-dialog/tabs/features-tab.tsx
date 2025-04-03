// src/components/floor-plan/room-dialog/tabs/features-tab.tsx
'use client'

import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RoomFeatureCheckboxProps } from '../types';

export function FeaturesTab({ features = [], onChange, availableFeatures }: RoomFeatureCheckboxProps) {
  return (
    <div className="space-y-2">
      <Label>Room Features</Label>
      <ScrollArea className="h-[300px] border rounded-md p-4">
        <div className="grid grid-cols-2 gap-2">
          {availableFeatures.map(feature => (
            <div key={feature.value} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`feature-${feature.value}`}
                checked={features.includes(feature.value)}
                onChange={(e) => {
                  const newFeatures = [...features];
                  if (e.target.checked) {
                    newFeatures.push(feature.value);
                  } else {
                    const index = newFeatures.indexOf(feature.value);
                    if (index !== -1) newFeatures.splice(index, 1);
                  }
                  onChange(newFeatures);
                }}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor={`feature-${feature.value}`} className="text-sm">
                {feature.label}
              </Label>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}