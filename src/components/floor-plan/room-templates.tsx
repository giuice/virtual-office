// src/components/floor-plan/room-templates.tsx
'use client'

import { useState } from 'react'
import { RoomTemplate, SpaceType } from './types'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Plus, Save, Copy, Trash2, Edit, Lock, Unlock } from 'lucide-react'

// Sample template data
const sampleTemplates: RoomTemplate[] = [
  {
    id: 'template-1',
    name: 'Standard Meeting Room',
    type: 'conference',
    capacity: 8,
    features: ['video', 'screen-sharing', 'whiteboard'],
    description: 'Standard meeting room for team discussions and presentations',
    defaultWidth: 250,
    defaultHeight: 150,
    isPublic: true
  },
  {
    id: 'template-2',
    name: 'Developer Workspace',
    type: 'workspace',
    capacity: 4,
    features: ['screens', 'whiteboard'],
    description: 'Workspace optimized for development teams',
    defaultWidth: 300,
    defaultHeight: 200,
    isPublic: true
  },
  {
    id: 'template-3',
    name: 'Break Area',
    type: 'social',
    capacity: 6,
    features: ['coffee', 'snacks'],
    description: 'Relaxation area for breaks and casual conversations',
    defaultWidth: 200,
    defaultHeight: 150,
    isPublic: true
  },
  {
    id: 'template-4',
    name: 'Private Office',
    type: 'private_office',
    capacity: 1,
    features: ['desk', 'privacy'],
    description: 'Private office space for focused work',
    defaultWidth: 150,
    defaultHeight: 150,
    isPublic: true
  },
  {
    id: 'template-5',
    name: 'Open Collaboration Space',
    type: 'open_space',
    capacity: 12,
    features: ['whiteboard', 'flexible-seating'],
    description: 'Open area for team collaboration and brainstorming',
    defaultWidth: 350,
    defaultHeight: 250,
    isPublic: true
  }
];

// Available room features for selection
const availableFeatures = [
  { value: 'video', label: 'Video Conferencing' },
  { value: 'screen-sharing', label: 'Screen Sharing' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'screens', label: 'Multiple Screens' },
  { value: 'coffee', label: 'Coffee Machine' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'desk', label: 'Desk' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'flexible-seating', label: 'Flexible Seating' },
  { value: 'projector', label: 'Projector' },
  { value: 'phone', label: 'Conference Phone' },
  { value: 'natural-light', label: 'Natural Light' },
  { value: 'quiet', label: 'Quiet Zone' },
  { value: 'accessible', label: 'Accessibility Features' }
];

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
  userTemplates = []
}: RoomTemplatesProps) {
  const [templates, setTemplates] = useState<RoomTemplate[]>([...sampleTemplates, ...userTemplates]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoomTemplate | null>(null);
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
    setSelectedTemplate(template);
    setNewTemplate({...template});
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
      description: newTemplate.description,
      defaultWidth: newTemplate.defaultWidth || 200,
      defaultHeight: newTemplate.defaultHeight || 150,
      isPublic: newTemplate.isPublic !== undefined ? newTemplate.isPublic : true,
      createdBy: 1 // Mock user ID
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
    if (!selectedTemplate || !newTemplate.name) return;
    
    const updatedTemplate: RoomTemplate = {
      ...selectedTemplate,
      name: newTemplate.name || selectedTemplate.name,
      type: newTemplate.type as SpaceType || selectedTemplate.type,
      capacity: newTemplate.capacity || selectedTemplate.capacity,
      features: newTemplate.features || selectedTemplate.features,
      description: newTemplate.description,
      defaultWidth: newTemplate.defaultWidth || selectedTemplate.defaultWidth,
      defaultHeight: newTemplate.defaultHeight || selectedTemplate.defaultHeight,
      isPublic: newTemplate.isPublic !== undefined ? newTemplate.isPublic : selectedTemplate.isPublic
    };
    
    setTemplates(templates.map(t => t.id === selectedTemplate.id ? updatedTemplate : t));
    onSaveTemplate(updatedTemplate);
    setIsEditDialogOpen(false);
    setSelectedTemplate(null);
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
      createdBy: 1 // Mock user ID
    };
    
    setTemplates([...templates, duplicatedTemplate]);
    onSaveTemplate(duplicatedTemplate);
  };
  
  // Helper function to get feature label from value
  const getFeatureLabel = (value: string) => {
    const feature = availableFeatures.find(f => f.value === value);
    return feature ? feature.label : value;
  };
  
  // Helper function to get room type label
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
      default: return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Room Templates</h2>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
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
              {templates.map(template => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onSelect={handleSelectTemplate}
                  onEdit={handleEditTemplate}
                  onDuplicate={handleDuplicateTemplate}
                  onDelete={handleDeleteTemplate}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="public" className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.filter(t => t.isPublic).map(template => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onSelect={handleSelectTemplate}
                  onEdit={handleEditTemplate}
                  onDuplicate={handleDuplicateTemplate}
                  onDelete={handleDeleteTemplate}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="my" className="mt-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.filter(t => t.createdBy === 1).map(template => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onSelect={handleSelectTemplate}
                  onEdit={handleEditTemplate}
                  onDuplicate={handleDuplicateTemplate}
                  onDelete={handleDeleteTemplate}
                />
              ))}
              {templates.filter(t => t.createdBy === 1).length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-muted-foreground mb-4">You haven't created any templates yet</p>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Your First Template
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      
      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Room Template</DialogTitle>
            <DialogDescription>
              Create a reusable room template for quick room creation
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input 
                  id="name" 
                  value={newTemplate.name || ''} 
                  onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                  placeholder="e.g., Standard Meeting Room"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Room Type</Label>
                <Select 
                  value={newTemplate.type || 'workspace'} 
                  onValueChange={(value) => setNewTemplate({...newTemplate, type: value as SpaceType})}
                >
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
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                value={newTemplate.description || ''} 
                onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                placeholder="Describe the purpose and features of this room template"
                className="min-h-[80px]"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity</Label>
                <div className="flex items-center gap-4">
                  <Slider 
                    id="capacity"
                    min={1}
                    max={20}
                    step={1}
                    value={[newTemplate.capacity || 4]}
                    onValueChange={(value) => setNewTemplate({...newTemplate, capacity: value[0]})}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{newTemplate.capacity || 4}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="public">Visibility</Label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {newTemplate.isPublic ? (
                      <Unlock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{newTemplate.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                  <Switch 
                    id="public"
                    checked={newTemplate.isPublic}
                    onCheckedChange={(checked) => setNewTemplate({...newTemplate, isPublic: checked})}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Default Size</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="width" className="text-xs">Width (px)</Label>
                  <Input 
                    id="width" 
                    type="number"
                    min={100}
                    max={500}
                    value={newTemplate.defaultWidth || 200} 
                    onChange={(e) => setNewTemplate({...newTemplate, defaultWidth: parseInt(e.target.value) || 200})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height" className="text-xs">Height (px)</Label>
                  <Input 
                    id="height" 
                    type="number"
                    min={100}
                    max={500}
                    value={newTemplate.defaultHeight || 150} 
                    onChange={(e) => setNewTemplate({...newTemplate, defaultHeight: parseInt(e.target.value) || 150})}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Features</Label>
              <ScrollArea className="h-[150px] border rounded-md p-4">
                <div className="grid grid-cols-2 gap-2">
                  {availableFeatures.map(feature => (
                    <div key={feature.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`feature-${feature.value}`}
                        checked={(newTemplate.features || []).includes(feature.value)}
                        onChange={(e) => {
                          const features = [...(newTemplate.features || [])];
                          if (e.target.checked) {
                            features.push(feature.value);
                          } else {
                            const index = features.indexOf(feature.value);
                            if (index !== -1) features.splice(index, 1);
                          }
                          setNewTemplate({...newTemplate, features});
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
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNewTemplate} disabled={!newTemplate.name}>
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
              <div className="space-y-2">
                <Label htmlFor="edit-name">Template Name</Label>
                <Input 
                  id="edit-name" 
                  value={newTemplate.name || ''} 
                  onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-type">Room Type</Label>
                <Select 
                  value={newTemplate.type || 'workspace'} 
                  onValueChange={(value) => setNewTemplate({...newTemplate, type: value as SpaceType})}
                >
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
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea 
                id="edit-description" 
                value={newTemplate.description || ''} 
                onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                className="min-h-[80px]"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-capacity">Capacity</Label>
                <div className="flex items-center gap-4">
                  <Slider 
                    id="edit-capacity"
                    min={1}
                    max={20}
                    step={1}
                    value={[newTemplate.capacity || 4]}
                    onValueChange={(value) => setNewTemplate({...newTemplate, capacity: value[0]})}
                    className="flex-1"
                  />
                  <span className="w-12 text-center">{newTemplate.capacity || 4}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-public">Visibility</Label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {newTemplate.isPublic ? (
                      <Unlock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{newTemplate.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                  <Switch 
                    id="edit-public"
                    checked={newTemplate.isPublic}
                    onCheckedChange={(checked) => setNewTemplate({...newTemplate, isPublic: checked})}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Default Size</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-width" className="text-xs">Width (px)</Label>
                  <Input 
                    id="edit-width" 
                    type="number"
                    min={100}
                    max={500}
                    value={newTemplate.defaultWidth || 200} 
                    onChange={(e) => setNewTemplate({...newTemplate, defaultWidth: parseInt(e.target.value) || 200})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-height" className="text-xs">Height (px)</Label>
                  <Input 
                    id="edit-height" 
                    type="number"
                    min={100}
                    max={500}
                    value={newTemplate.defaultHeight || 150} 
                    onChange={(e) => setNewTemplate({...newTemplate, defaultHeight: parseInt(e.target.value) || 150})}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Features</Label>
              <ScrollArea className="h-[150px] border rounded-md p-4">
                <div className="grid grid-cols-2 gap-2">
                  {availableFeatures.map(feature => (
                    <div key={feature.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`edit-feature-${feature.value}`}
                        checked={(newTemplate.features || []).includes(feature.value)}
                        onChange={(e) => {
                          const features = [...(newTemplate.features || [])];
                          if (e.target.checked) {
                            features.push(feature.value);
                          } else {
                            const index = features.indexOf(feature.value);
                            if (index !== -1) features.splice(index, 1);
                          }
                          setNewTemplate({...newTemplate, features});
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`edit-feature-${feature.value}`} className="text-sm">
                        {feature.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTemplate} disabled={!newTemplate.name}>
              <Save className="h-4 w-4 mr-2" />
              Update Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: RoomTemplate;
  onSelect: (template: RoomTemplate) => void;
  onEdit: (template: RoomTemplate) => void;
  onDuplicate: (template: RoomTemplate) => void;
  onDelete: (templateId: string) => void;
}

function TemplateCard({ template, onSelect, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  // Helper function to get room type label
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
      default: return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
    }
  };
  
  // Helper function to get badge variant based on room type
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
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant={getBadgeVariant(template.type) as any}>
            {getRoomTypeLabel(template.type)}
          </Badge>
          {!template.isPublic && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Private
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg">{template.name}</CardTitle>
        {template.description && (
          <CardDescription className="line-clamp-2">{template.description}</CardDescription>
        )}
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
      <CardFooter className="flex justify-between pt-2">
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onEdit(template)}
            title="Edit template"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onDuplicate(template)}
            title="Duplicate template"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onDelete(template.id)}
            title="Delete template"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => onSelect(template)}>
          Use Template
        </Button>
      </CardFooter>
    </Card>
  );
}
