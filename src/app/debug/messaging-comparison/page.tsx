'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationType, MessageType } from '@/types/messaging';
import { 
  MessageSquare, 
  Users, 
  TestTube,
  User,
  ArrowLeftRight,
  Zap,
  FileText,
  Image as ImageIcon
} from 'lucide-react';

// Import all messaging components for comparison
import { ChatWindow } from '@/components/messaging/ChatWindow';
import { MessageFeed } from '@/components/messaging/message-feed';
import { EnhancedMessageFeed } from '@/components/messaging/EnhancedMessageFeed';
import { MessageInput } from '@/components/messaging/MessageInput';
import { MessageComposer } from '@/components/messaging/message-composer';
import { EnhancedMessageComposer } from '@/components/messaging/EnhancedMessageComposer';
import { MessageList } from '@/components/messaging/MessageList';

export default function MessagingComparisonPage() {
  const { user } = useAuth();
  const { 
    sendMessage, 
    getOrCreateUserConversation, 
    setActiveConversation,
    activeConversation,
    uploadAttachment,
    messages,
    addReaction 
  } = useMessaging();
  
  const [testConversationId, setTestConversationId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [testUserId, setTestUserId] = useState<string>('a8dfbf32-4c5f-4283-8187-9c568eb6db46');

  // Create a test conversation for comparison
  const createTestConversation = async () => {
    if (!user) return;

    setIsCreatingConversation(true);
    try {
      // Create a conversation with the test user
      const conversation = await getOrCreateUserConversation(testUserId);
      setActiveConversation(conversation);
      setTestConversationId(conversation.id);
    } catch (error) {
      console.error('Failed to create test conversation:', error);
      // Show error to user
      alert(`Failed to create conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  // Component comparison data
  const componentComparisons = [
    {
      name: 'ChatWindow',
      description: 'Complete chat interface with realtime updates',
      features: ['Infinite scroll', 'Realtime subscription', 'Connection status', 'Error handling'],
      component: 'ChatWindow',
      pros: ['Complete solution', 'Built-in realtime', 'Windowed loading', 'Error states'],
      cons: ['Less customizable', 'Basic input only']
    },
    {
      name: 'MessageFeed',
      description: 'Message display with basic composer',
      features: ['Message display', 'Basic input', 'Room integration', 'Scroll to bottom'],
      component: 'MessageFeed',
      pros: ['Simple to use', 'Room-focused', 'Clean UI'],
      cons: ['No realtime', 'Limited features', 'Basic input only']
    },
    {
      name: 'EnhancedMessageFeed',
      description: 'Advanced message feed with enhanced features',
      features: ['Enhanced UI', 'Better styling', 'Improved UX', 'Advanced interactions'],
      component: 'EnhancedMessageFeed',
      pros: ['Better UX', 'Enhanced styling', 'Advanced features'],
      cons: ['More complex', 'Potentially over-engineered']
    }
  ];

  const inputComparisons = [
    {
      name: 'MessageInput',
      description: 'Basic text input with reply support',
      features: ['Text input', 'Reply preview', 'Enter to send', 'Escape to cancel'],
      component: 'MessageInput',
      pros: ['Simple', 'Lightweight', 'Fast'],
      cons: ['No attachments', 'No typing indicators', 'Basic UI']
    },
    {
      name: 'MessageComposer',
      description: 'Enhanced input with attachment support',
      features: ['Text input', 'File attachments', 'Reply support', 'Better UX'],
      component: 'MessageComposer',
      pros: ['File uploads', 'Better UX', 'More features'],
      cons: ['More complex', 'Larger bundle']
    },
    {
      name: 'EnhancedMessageComposer',
      description: 'Full-featured input with all enhancements',
      features: ['File uploads', 'Typing indicators', 'Auto-resize', 'Preview attachments', 'Loading states'],
      component: 'EnhancedMessageComposer',
      pros: ['All features', 'Best UX', 'Typing indicators', 'File previews'],
      cons: ['Most complex', 'Largest bundle', 'More dependencies']
    }
  ];

  // Handlers for different message inputs
  const handleBasicSend = async (content: string, replyToId?: string) => {
    if (!content.trim()) return;
    await sendMessage(content, { type: MessageType.TEXT, replyToId });
  };

  const handleEnhancedSend = async (content: string, options?: any) => {
    if (!content.trim() && (!options?.attachments || options.attachments.length === 0)) return;
    await sendMessage(content, {
      type: MessageType.TEXT,
      replyToId: options?.replyToId,
      attachments: options?.attachments
    });
  };

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Messaging Components Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please log in to test the messaging components.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Messaging Components Comparison
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Compare different messaging components side by side. Open this page in multiple browsers 
            with different users to test real-time functionality.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Test User Configuration */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label htmlFor="testUserId" className="text-sm font-medium">
                  Test User ID (to create conversation with)
                </Label>
                <Input
                  id="testUserId"
                  value={testUserId}
                  onChange={(e) => setTestUserId(e.target.value)}
                  placeholder="Enter user ID to chat with"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default: giuice@yahoo.com user ID (log in with this user in another window)
                </p>
              </div>
              <Button 
                onClick={createTestConversation}
                disabled={isCreatingConversation || !testUserId.trim()}
                className="flex items-center gap-2"
              >
                {isCreatingConversation ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    Create Test Conversation
                  </>
                )}
              </Button>
            </div>
            
            {/* Current Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">
                <User className="h-3 w-3 mr-1" />
                Current User: {user?.email?.split('@')[0] || 'Unknown'}
              </Badge>
              
              {testUserId && (
                <Badge variant="secondary">
                  <ArrowLeftRight className="h-3 w-3 mr-1" />
                  Chat Partner: {testUserId.slice(0, 8)}...
                </Badge>
              )}
              
              {testConversationId && (
                <Badge variant="default">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Active: {testConversationId.slice(0, 8)}...
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!testConversationId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">Create a test conversation to start comparing components</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="feeds" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="feeds">Message Feeds</TabsTrigger>
            <TabsTrigger value="inputs">Input Components</TabsTrigger>
            <TabsTrigger value="features">Feature Comparison</TabsTrigger>
          </TabsList>

          {/* Message Feeds Comparison */}
          <TabsContent value="feeds" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ChatWindow */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    ChatWindow
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Complete chat interface with realtime updates
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">Realtime</Badge>
                    <Badge variant="secondary">Infinite Scroll</Badge>
                    <Badge variant="outline">Error Handling</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px]">
                    <ChatWindow
                      conversationId={testConversationId}
                      onSendMessage={handleBasicSend}
                      title="ChatWindow Test"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* MessageFeed */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    MessageFeed
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Basic message display with simple composer
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">Basic</Badge>
                    <Badge variant="outline">Simple</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px]">
                    <MessageFeed
                      conversationId={testConversationId}
                      className="h-full"
                      maxHeight="400px"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* EnhancedMessageFeed */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4" />
                    EnhancedMessageFeed
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enhanced message feed with better UX
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">Enhanced</Badge>
                    <Badge variant="secondary">Better UX</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px]">
                    <EnhancedMessageFeed
                      messages={messages}
                      conversationId={testConversationId}
                      onReply={(message) => console.log('Reply to:', message)}
                      onReaction={addReaction}
                      className="h-full"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Input Components Comparison */}
          <TabsContent value="inputs" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* MessageInput */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    MessageInput
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Basic text input with reply support
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">Basic</Badge>
                    <Badge variant="secondary">Text Only</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <MessageInput
                    onSendMessage={handleBasicSend}
                    replyingToMessage={null}
                    onCancelReply={() => {}}
                    isLoading={false}
                  />
                </CardContent>
              </Card>

              {/* MessageComposer */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    MessageComposer
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enhanced input with file attachment support
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">Files</Badge>
                    <Badge variant="secondary">Enhanced</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <MessageComposer
                    onSendMessage={handleEnhancedSend}
                    placeholder="Type with MessageComposer..."
                  />
                </CardContent>
              </Card>

              {/* EnhancedMessageComposer */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    EnhancedMessageComposer
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Full-featured input with all enhancements
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">Typing Indicators</Badge>
                    <Badge variant="default">File Previews</Badge>
                    <Badge variant="secondary">Auto-resize</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <EnhancedMessageComposer
                    conversationId={testConversationId}
                    onSendMessage={handleEnhancedSend}
                    onUploadAttachment={uploadAttachment}
                    placeholder="Type with EnhancedComposer..."
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Feature Comparison Table */}
          <TabsContent value="features" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Message Display Components */}
              <Card>
                <CardHeader>
                  <CardTitle>Message Display Components</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {componentComparisons.map((comp) => (
                      <div key={comp.name} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{comp.name}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {comp.description}
                        </p>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-green-600 mb-1">Pros:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                              {comp.pros.map((pro) => (
                                <li key={pro}>{pro}</li>
                              ))}
                            </ul>
                          </div>
                          
                          <div>
                            <p className="text-sm font-medium text-red-600 mb-1">Cons:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                              {comp.cons.map((con) => (
                                <li key={con}>{con}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mt-3">
                          {comp.features.map((feature) => (
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

              {/* Input Components */}
              <Card>
                <CardHeader>
                  <CardTitle>Input Components</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {inputComparisons.map((comp) => (
                      <div key={comp.name} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{comp.name}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {comp.description}
                        </p>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-green-600 mb-1">Pros:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                              {comp.pros.map((pro) => (
                                <li key={pro}>{pro}</li>
                              ))}
                            </ul>
                          </div>
                          
                          <div>
                            <p className="text-sm font-medium text-red-600 mb-1">Cons:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                              {comp.cons.map((con) => (
                                <li key={con}>{con}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mt-3">
                          {comp.features.map((feature) => (
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
            </div>

            {/* Testing Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Multi-User Testing Instructions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <p className="text-sm">Open this page in a second browser window (incognito mode)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <p className="text-sm">Log in with a different user account in the second window</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <p className="text-sm">Create conversations in both windows and test real-time messaging</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <p className="text-sm">Compare component behavior, performance, and features side by side</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}