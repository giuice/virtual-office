// src/components/floor-plan/room-dialog/tabs/access-control-tab.tsx
'use client'

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AccessControl } from '@/types/database';

interface AccessControlTabProps {
  accessControl: AccessControl | undefined;
  onChange: (accessControl: AccessControl) => void;
}

export function AccessControlTab({ accessControl = { isPublic: true }, onChange }: AccessControlTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="public">Public Access</Label>
          <Switch 
            id="public"
            checked={accessControl.isPublic !== false}
            onCheckedChange={(checked) => onChange({
              ...accessControl,
              isPublic: checked
            })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {accessControl.isPublic !== false 
            ? "Anyone can join this room" 
            : "Only specific users or roles can join this room"}
        </p>
      </div>
    </div>
  );
}