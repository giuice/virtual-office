'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';

const componentComparisons = [{
  name: 'ChatWindow',
  description: 'Complete chat interface with realtime updates',
  features: ['Infinite scroll', 'Realtime subscription', 'Connection status', 'Error handling'],
  pros: ['Complete solution', 'Built-in realtime', 'Windowed loading', 'Error states'],
  cons: ['Less customizable', 'Basic input only']
}, {
  name: 'MessageFeed',
  description: 'Message display with basic composer',
  features: ['Message display', 'Basic input', 'Room integration', 'Scroll to bottom'],
  pros: ['Simple to use', 'Room-focused', 'Clean UI'],
  cons: ['No realtime', 'Limited features', 'Basic input only']
}, {
  name: 'EnhancedMessageFeed',
  description: 'Advanced message feed with enhanced features',
  features: ['Enhanced UI', 'Better styling', 'Improved UX', 'Advanced interactions'],
  pros: ['Better UX', 'Enhanced styling', 'Advanced features'],
  cons: ['More complex', 'Potentially over-engineered']
}];

const inputComparisons = [{
  name: 'MessageInput',
  description: 'Basic text input with reply support',
  features: ['Text input', 'Reply preview', 'Enter to send', 'Escape to cancel'],
  pros: ['Simple', 'Lightweight', 'Fast'],
  cons: ['No attachments', 'No typing indicators', 'Basic UI']
}, {
  name: 'MessageComposer',
  description: 'Enhanced input with attachment support',
  features: ['Text input', 'File attachments', 'Reply support', 'Better UX'],
  pros: ['File uploads', 'Better UX', 'More features'],
  cons: ['More complex', 'Larger bundle']
}, {
  name: 'EnhancedMessageComposer',
  description: 'Full-featured input with all enhancements',
  features: ['File uploads', 'Typing indicators', 'Auto-resize', 'Preview attachments', 'Loading states'],
  pros: ['All features', 'Best UX', 'Typing indicators', 'File previews'],
  cons: ['Most complex', 'Largest bundle', 'More dependencies']
}];

function ComparisonCard({
  title,
  items,
}: {
  title: string;
  items: typeof componentComparisons;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map(comp => (
            <div key={comp.name} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold">{comp.name}</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{comp.description}</p>

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-green-600 mb-1">Pros:</p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {comp.pros.map(pro => <li key={pro}>{pro}</li>)}
                  </ul>
                </div>

                <div>
                  <p className="text-sm font-medium text-red-600 mb-1">Cons:</p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {comp.cons.map(con => <li key={con}>{con}</li>)}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 mt-3">
                {comp.features.map(feature => (
                  <Badge key={feature} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function MessagingFeatureComparison() {
  return (
    <TabsContent value="features" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComparisonCard title="Message Display Components" items={componentComparisons} />
        <ComparisonCard title="Input Components" items={inputComparisons} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Multi-User Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[ 
            'Open this page in a second browser window (incognito mode)',
            'Log in with a different user account in the second window',
            'Create conversations in both windows and test real-time messaging',
            'Compare component behavior, performance, and features side by side',
          ].map((step, index) => (
            <div key={step} className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full size-6 flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              <p className="text-sm">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
