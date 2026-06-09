'use client';

import { RoomTemplate } from '@/types/database';
import { SpaceType } from './types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Lock, Save, Unlock } from 'lucide-react';

interface FeatureOption {
  value: string;
  label: string;
}

interface RoomTemplateCreateDialogProps {
  open: boolean;
  template: Partial<RoomTemplate>;
  availableFeatures: FeatureOption[];
  onOpenChange: (open: boolean) => void;
  onTemplateChange: (template: Partial<RoomTemplate>) => void;
  onSave: () => void;
}

export function RoomTemplateCreateDialog({
  open,
  template,
  availableFeatures,
  onOpenChange,
  onTemplateChange,
  onSave,
}: RoomTemplateCreateDialogProps) {
  const updateTemplate = (patch: Partial<RoomTemplate>) => {
    onTemplateChange({ ...template, ...patch });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Room Template</DialogTitle>
          <DialogDescription>Create a reusable room template for quick room creation</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="gap-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input id="name" value={template.name || ''} onChange={e => updateTemplate({ name: e.target.value })} placeholder="e.g., Standard Meeting Room" />
            </div>

            <div className="gap-y-2">
              <Label htmlFor="type">Room Type</Label>
              <Select value={template.type || 'workspace'} onValueChange={value => updateTemplate({ type: value as SpaceType })}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="conference">Conference Room</SelectItem>
                  <SelectItem value="social">Social Space</SelectItem>
                  <SelectItem value="breakout">Breakout Room</SelectItem>
                  <SelectItem value="private_office">Private Office</SelectItem>
                  <SelectItem value="open_space">Open Space</SelectItem>
                  <SelectItem value="lounge">Lounge</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="gap-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={template.description || ''} onChange={e => updateTemplate({ description: e.target.value })} placeholder="Describe the purpose and features of this room template" className="min-h-[80px]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="gap-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <div className="flex items-center gap-4">
                <Slider id="capacity" min={1} max={20} step={1} value={[template.capacity || 4]} onValueChange={value => updateTemplate({ capacity: value[0] })} className="flex-1" />
                <span className="w-12 text-center">{template.capacity || 4}</span>
              </div>
            </div>

            <div className="gap-y-2">
              <Label htmlFor="public">Visibility</Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {template.isPublic ? <Unlock className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-muted-foreground" />}
                  <span>{template.isPublic ? 'Public' : 'Private'}</span>
                </div>
                <Switch id="public" checked={template.isPublic} onCheckedChange={checked => updateTemplate({ isPublic: checked })} />
              </div>
            </div>
          </div>

          <div className="gap-y-2">
            <Label>Default Size</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="gap-y-2">
                <Label htmlFor="width" className="text-xs">Width (px)</Label>
                <Input id="width" type="number" min={100} max={500} value={template.defaultWidth || 200} onChange={e => updateTemplate({ defaultWidth: parseInt(e.target.value) || 200 })} />
              </div>
              <div className="gap-y-2">
                <Label htmlFor="height" className="text-xs">Height (px)</Label>
                <Input id="height" type="number" min={100} max={500} value={template.defaultHeight || 150} onChange={e => updateTemplate({ defaultHeight: parseInt(e.target.value) || 150 })} />
              </div>
            </div>
          </div>

          <div className="gap-y-2">
            <Label>Features</Label>
            <ScrollArea className="h-[150px] border rounded-md p-4">
              <div className="grid grid-cols-2 gap-2">
                {availableFeatures.map(feature => (
                  <div key={feature.value} className="flex items-center gap-x-2">
                    <input
                      type="checkbox"
                      id={`feature-${feature.value}`}
                      aria-label={feature.label}
                      checked={(template.features || []).includes(feature.value)}
                      onChange={e => {
                        const features = [...(template.features || [])];
                        if (e.target.checked) {
                          features.push(feature.value);
                        } else {
                          const index = features.indexOf(feature.value);
                          if (index !== -1) features.splice(index, 1);
                        }
                        updateTemplate({ features });
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!template.name}>
            <Save className="size-4 mr-2" />
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
