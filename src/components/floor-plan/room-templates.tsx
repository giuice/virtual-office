// src/components/floor-plan/room-templates.tsx
'use client';

import { useRef, useState } from 'react';
import { SpaceType } from './types';
import { RoomTemplate } from '@/types/database';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Plus, Save, Copy, Trash2, Edit, Lock, Unlock } from 'lucide-react';
import { RoomTemplateCreateDialog } from './RoomTemplateCreateDialog';
import { CreateFirstTemplatePrompt } from './CreateFirstTemplatePrompt';

const EMPTY_TEMPLATES: RoomTemplate[] = [];

// Sample template data

// Helper function to get feature label from value
const getFeatureLabel = (value: string) => {
  const feature = availableFeatures.find(f => f.value === value);
  return feature ? feature.label : value;
};

// Helper function to get room type label
const getRoomTypeLabel = (type: SpaceType): string => {
  switch (type) {
    case 'workspace':
      return 'Workspace';
    case 'conference':
      return 'Conference Room';
    case 'social':
      return 'Social Space';
    case 'breakout':
      return 'Breakout Room';
    case 'private_office':
      return 'Private Office';
    case 'open_space':
      return 'Open Space';
    case 'lounge':
      return 'Lounge';
    case 'lab':
      return 'Lab';
  }
  const _exhaustiveCheck: never = type;
  return _exhaustiveCheck;
};

// Helper function to get badge variant based on room type
const getBadgeVariant = (type: SpaceType) => {
  switch (type) {
    case 'workspace':
      return 'success';
    case 'conference':
      return 'default';
    case 'social':
      return 'warning';
    case 'breakout':
      return 'secondary';
    case 'private_office':
      return 'destructive';
    case 'open_space':
      return 'outline';
    case 'lounge':
      return 'default';
    case 'lab':
      return 'secondary';
    default:
      return 'outline';
  }
};
const sampleTemplates: RoomTemplate[] = [{
  id: 'template-1',
  name: 'Standard Meeting Room',
  type: 'conference',
  capacity: 8,
  features: ['video', 'screen-sharing', 'whiteboard'],
  description: 'Standard meeting room for team discussions and presentations',
  defaultWidth: 250,
  defaultHeight: 150,
  isPublic: true
}, {
  id: 'template-2',
  name: 'Developer Workspace',
  type: 'workspace',
  capacity: 4,
  features: ['screens', 'whiteboard'],
  description: 'Workspace optimized for development teams',
  defaultWidth: 300,
  defaultHeight: 200,
  isPublic: true
}, {
  id: 'template-3',
  name: 'Break Area',
  type: 'social',
  capacity: 6,
  features: ['coffee', 'snacks'],
  description: 'Relaxation area for breaks and casual conversations',
  defaultWidth: 200,
  defaultHeight: 150,
  isPublic: true
}, {
  id: 'template-4',
  name: 'Private Office',
  type: 'private_office',
  capacity: 1,
  features: ['desk', 'privacy'],
  description: 'Private office space for focused work',
  defaultWidth: 150,
  defaultHeight: 150,
  isPublic: true
}, {
  id: 'template-5',
  name: 'Open Collaboration Space',
  type: 'open_space',
  capacity: 12,
  features: ['whiteboard', 'flexible-seating'],
  description: 'Open area for team collaboration and brainstorming',
  defaultWidth: 350,
  defaultHeight: 250,
  isPublic: true
}];

// Available room features for selection
const availableFeatures = [{
  value: 'video',
  label: 'Video Conferencing'
}, {
  value: 'screen-sharing',
  label: 'Screen Sharing'
}, {
  value: 'whiteboard',
  label: 'Whiteboard'
}, {
  value: 'screens',
  label: 'Multiple Screens'
}, {
  value: 'coffee',
  label: 'Coffee Machine'
}, {
  value: 'snacks',
  label: 'Snacks'
}, {
  value: 'desk',
  label: 'Desk'
}, {
  value: 'privacy',
  label: 'Privacy'
}, {
  value: 'flexible-seating',
  label: 'Flexible Seating'
}, {
  value: 'projector',
  label: 'Projector'
}, {
  value: 'phone',
  label: 'Conference Phone'
}, {
  value: 'natural-light',
  label: 'Natural Light'
}, {
  value: 'quiet',
  label: 'Quiet Zone'
}, {
  value: 'accessible',
  label: 'Accessibility Features'
}];
interface RoomTemplatesProps {
  onSelectTemplate: (template: RoomTemplate) => void;
  onSaveTemplate: (template: RoomTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  userTemplates?: RoomTemplate[];
}
export function RoomTemplates({
  onSelectTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  userTemplates = EMPTY_TEMPLATES
}: RoomTemplatesProps) {
  const [templates, setTemplates] = useState<RoomTemplate[]>([...sampleTemplates, ...userTemplates]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const selectedTemplate = useRef<RoomTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState<Partial<RoomTemplate>>({
    name: '',
    type: 'workspace',
    capacity: 4,
    features: [],
    description: '',
    defaultWidth: 200,
    defaultHeight: 150,
    isPublic: true
  });

  // Function to handle template selection
  const handleSelectTemplate = (template: RoomTemplate) => {
    onSelectTemplate(template);
  };

  // Function to open edit dialog with selected template
  const handleEditTemplate = (template: RoomTemplate) => {
    selectedTemplate.current = template;
    setNewTemplate({
      ...template
    });
    setIsEditDialogOpen(true);
  };

  // Function to save a new template
  const handleSaveNewTemplate = () => {
    if (!newTemplate.name) return;
    const template: RoomTemplate = {
      id: `template-${Date.now()}`,
      name: newTemplate.name || 'Untitled Template',
      type: newTemplate.type as SpaceType || 'workspace',
      capacity: newTemplate.capacity || 4,
      features: newTemplate.features || [],
      description: newTemplate.description || '',
      defaultWidth: newTemplate.defaultWidth || 200,
      defaultHeight: newTemplate.defaultHeight || 150,
      isPublic: newTemplate.isPublic !== undefined ? newTemplate.isPublic : true,
      createdBy: '1' // Mock user ID
    };
    setTemplates([...templates, template]);
    onSaveTemplate(template);
    setIsCreateDialogOpen(false);

    // Reset form
    setNewTemplate({
      name: '',
      type: 'workspace',
      capacity: 4,
      features: [],
      description: '',
      defaultWidth: 200,
      defaultHeight: 150,
      isPublic: true
    });
  };

  // Function to update an existing template
  const handleUpdateTemplate = () => {
    const templateToUpdate = selectedTemplate.current;
    if (!templateToUpdate || !newTemplate.name) return;
    const updatedTemplate: RoomTemplate = {
      ...templateToUpdate,
      name: newTemplate.name || templateToUpdate.name,
      type: newTemplate.type as SpaceType || templateToUpdate.type,
      capacity: newTemplate.capacity || templateToUpdate.capacity,
      features: newTemplate.features || templateToUpdate.features,
      description: newTemplate.description || '',
      defaultWidth: newTemplate.defaultWidth || templateToUpdate.defaultWidth,
      defaultHeight: newTemplate.defaultHeight || templateToUpdate.defaultHeight,
      isPublic: newTemplate.isPublic !== undefined ? newTemplate.isPublic : templateToUpdate.isPublic,
      createdBy: templateToUpdate.createdBy
    };
    setTemplates(templates.map(t => t.id === templateToUpdate.id ? updatedTemplate : t));
    onSaveTemplate(updatedTemplate);
    setIsEditDialogOpen(false);
    selectedTemplate.current = null;
  };

  // Function to delete a template
  const handleDeleteTemplate = (templateId: string) => {
    setTemplates(templates.filter(t => t.id !== templateId));
    onDeleteTemplate(templateId);
  };

  // Function to duplicate a template
  const handleDuplicateTemplate = (template: RoomTemplate) => {
    const duplicatedTemplate: RoomTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      name: `${template.name} (Copy)`,
      createdBy: '1' // Mock user ID
    };
    setTemplates([...templates, duplicatedTemplate]);
    onSaveTemplate(duplicatedTemplate);
  };

  // Helper function to get feature label from value

  return <div className="gap-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Room Templates</h2>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="size-4" />
          Create Template
        </Button>
      </div>
      
      <Tabs defaultValue="all">
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="all">All Templates</TabsTrigger>
          <TabsTrigger value="public">Public</TabsTrigger>
          <TabsTrigger value="my">My Templates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => <TemplateCard key={template.id} template={template} onSelect={handleSelectTemplate} onEdit={handleEditTemplate} onDuplicate={handleDuplicateTemplate} onDelete={handleDeleteTemplate} />)}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="public" className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.flatMap(template => template.isPublic ? [<TemplateCard key={template.id} template={template} onSelect={handleSelectTemplate} onEdit={handleEditTemplate} onDuplicate={handleDuplicateTemplate} onDelete={handleDeleteTemplate} />] : [])}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="my" className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.flatMap(template => template.createdBy === '1' ? [<TemplateCard key={template.id} template={template} onSelect={handleSelectTemplate} onEdit={handleEditTemplate} onDuplicate={handleDuplicateTemplate} onDelete={handleDeleteTemplate} />] : [])}
              {templates.filter(t => t.createdBy === '1').length === 0 && (
                <CreateFirstTemplatePrompt onCreate={() => setIsCreateDialogOpen(true)} />
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      
      <RoomTemplateCreateDialog
        open={isCreateDialogOpen}
        template={newTemplate}
        availableFeatures={availableFeatures}
        onOpenChange={setIsCreateDialogOpen}
        onTemplateChange={setNewTemplate}
        onSave={handleSaveNewTemplate}
      />
      
      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Room Template</DialogTitle>
            <DialogDescription>
              Update the properties of this room template
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="gap-y-2">
                <Label htmlFor="edit-name">Template Name</Label>
                <Input id="edit-name" value={newTemplate.name || ''} onChange={e => setNewTemplate({
                ...newTemplate,
                name: e.target.value
              })} />
              </div>
              
              <div className="gap-y-2">
                <Label htmlFor="edit-type">Room Type</Label>
                <Select value={newTemplate.type || 'workspace'} onValueChange={value => setNewTemplate({
                ...newTemplate,
                type: value as SpaceType
              })}>
                  <SelectTrigger id="edit-type">
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
              <Label htmlFor="edit-description">Description</Label>
              <Textarea id="edit-description" value={newTemplate.description || ''} onChange={e => setNewTemplate({
              ...newTemplate,
              description: e.target.value
            })} className="min-h-[80px]" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="gap-y-2">
                <Label htmlFor="edit-capacity">Capacity</Label>
                <div className="flex items-center gap-4">
                  <Slider id="edit-capacity" min={1} max={20} step={1} value={[newTemplate.capacity || 4]} onValueChange={value => setNewTemplate({
                  ...newTemplate,
                  capacity: value[0]
                })} className="flex-1" />
                  <span className="w-12 text-center">{newTemplate.capacity || 4}</span>
                </div>
              </div>
              
              <div className="gap-y-2">
                <Label htmlFor="edit-public">Visibility</Label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {newTemplate.isPublic ? <Unlock className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-muted-foreground" />}
                    <span>{newTemplate.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                  <Switch id="edit-public" checked={newTemplate.isPublic} onCheckedChange={checked => setNewTemplate({
                  ...newTemplate,
                  isPublic: checked
                })} />
                </div>
              </div>
            </div>
            
            <div className="gap-y-2">
              <Label>Default Size</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="gap-y-2">
                  <Label htmlFor="edit-width" className="text-xs">Width (px)</Label>
                  <Input id="edit-width" type="number" min={100} max={500} value={newTemplate.defaultWidth || 200} onChange={e => setNewTemplate({
                  ...newTemplate,
                  defaultWidth: parseInt(e.target.value) || 200
                })} />
                </div>
                <div className="gap-y-2">
                  <Label htmlFor="edit-height" className="text-xs">Height (px)</Label>
                  <Input id="edit-height" type="number" min={100} max={500} value={newTemplate.defaultHeight || 150} onChange={e => setNewTemplate({
                  ...newTemplate,
                  defaultHeight: parseInt(e.target.value) || 150
                })} />
                </div>
              </div>
            </div>
            
            <div className="gap-y-2">
              <Label>Features</Label>
              <ScrollArea className="h-[150px] border rounded-md p-4">
                <div className="grid grid-cols-2 gap-2">
                  {availableFeatures.map(feature => <div key={feature.value} className="flex items-center gap-x-2">
                      <input type="checkbox" id={`edit-feature-${feature.value}`} aria-label={feature.label} checked={(newTemplate.features || []).includes(feature.value)} onChange={e => {
                    const features = [...(newTemplate.features || [])];
                    if (e.target.checked) {
                      features.push(feature.value);
                    } else {
                      const index = features.indexOf(feature.value);
                      if (index !== -1) features.splice(index, 1);
                    }
                    setNewTemplate({
                      ...newTemplate,
                      features
                    });
                  }} className="rounded border-gray-300 text-primary focus:ring-primary" />
                      <Label htmlFor={`edit-feature-${feature.value}`} className="text-sm">
                        {feature.label}
                      </Label>
                    </div>)}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTemplate} disabled={!newTemplate.name}>
              <Save className="size-4 mr-2" />
              Update Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
}

// Template Card Component
interface TemplateCardProps {
  template: RoomTemplate;
  onSelect: (template: RoomTemplate) => void;
  onEdit: (template: RoomTemplate) => void;
  onDuplicate: (template: RoomTemplate) => void;
  onDelete: (templateId: string) => void;
}
function TemplateCard({
  template,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete
}: TemplateCardProps) {
  // Helper function to get badge variant based on room type

  return <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant={getBadgeVariant(template.type) as any}>
            {getRoomTypeLabel(template.type)}
          </Badge>
          {!template.isPublic && <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="size-3" />
              Private
            </Badge>}
        </div>
        <CardTitle className="text-lg">{template.name}</CardTitle>
        {template.description && <CardDescription className="line-clamp-2">{template.description}</CardDescription>}
      </CardHeader>
      <CardContent className="pb-2">
        <div className="gap-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Capacity:</span>
            <span>{template.capacity} people</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Size:</span>
            <span>{template.defaultWidth}×{template.defaultHeight}</span>
          </div>
          {template.features.length > 0 && <div className="flex flex-wrap gap-1 mt-2">
              {template.features.slice(0, 3).map((feature) => <Badge key={feature} variant="secondary" className="text-xs">
                  {feature}
                </Badge>)}
              {template.features.length > 3 && <Badge variant="secondary" className="text-xs">
                  +{template.features.length - 3} more
                </Badge>}
            </div>}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between pt-2">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(template)} title="Edit template">
            <Edit className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDuplicate(template)} title="Duplicate template">
            <Copy className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(template.id)} title="Delete template">
            <Trash2 className="size-4" />
          </Button>
        </div>
        <Button onClick={() => onSelect(template)}>
          Use Template
        </Button>
      </CardFooter>
    </Card>;
}
