'use client';

import React, { useState, useEffect } from 'react';
import { ChatWindow } from '@/components/messaging/ChatWindow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { messagingApi } from '@/lib/messaging-api';
import { ConversationType, MessageStatus, MessageType } from '@/types/messaging';
import { Loader2, MessageSquare, Users, Upload, Check, X } from 'lucide-react';

export default function MessagingTestPage() {
  const { user } = useAuth();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [testConversationId, setTestConversationId] = useState('');
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'success' | 'error'>>({});
  const [testMessages, setTestMessages] = useState<string[]>([]);

  const addTestMessage = (message: string) => {
    setTestMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runTest = async (testName: string, testFn: () => Promise<void>) => {
    setTestResults(prev => ({ ...prev, [testName]: 'pending' }));
    addTestMessage(`Starting ${testName}...`);
    
    try {
      await testFn();
      setTestResults(prev => ({ ...prev, [testName]: 'success' }));
      addTestMessage(`✅ ${testName} completed successfully`);
    } catch (error) {
      setTestResults(prev => ({ ...prev, [testName]: 'error' }));
      addTestMessage(`❌ ${testName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const createTestConversation = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsCreatingConversation(true);
    try {
      const conversation = await messagingApi.createConversation({
        type: ConversationType.DIRECT,
        participants: [], // Server will add the current user automatically
        name: `Test Conversation - ${new Date().toLocaleTimeString()}`,
        isArchived: false,
        unreadCount: {},
      });
      
      setTestConversationId(conversation.id);
      setActiveConversationId(conversation.id);
      addTestMessage(`Created test conversation: ${conversation.id}`);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const handleSendMessage = async (content: string, replyToId?: string) => {
    if (!user || !activeConversationId) {
      addTestMessage('❌ Cannot send message: No user or active conversation');
      return;
    }

    try {
      addTestMessage(`Sending message: "${content}"`);
      await messagingApi.sendMessage({
        conversationId: activeConversationId,
        senderId: user.id, // This will be validated server-side
        content,
        replyToId,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
      });
      addTestMessage('✅ Message sent successfully');
    } catch (error) {
      addTestMessage(`❌ Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const runMessagingTests = async () => {
    if (!activeConversationId) {
      addTestMessage('❌ No active conversation. Create a test conversation first.');
      return;
    }

    const tests = [
      {
        name: 'Fetch Messages',
        fn: async () => {
          const result = await messagingApi.getMessages(activeConversationId, { limit: 10 });
          if (!Array.isArray(result.messages)) {
            throw new Error('Messages is not an array');
          }
          addTestMessage(`Fetched ${result.messages.length} messages`);
        }
      },
      {
        name: 'Send Test Message',
        fn: async () => {
          await messagingApi.sendMessage({
            conversationId: activeConversationId,
            senderId: user!.id,
            content: `Test message sent at ${new Date().toISOString()}`,
            type: MessageType.TEXT,
            status: MessageStatus.SENT,
          });
        }
      },
      {
        name: 'Test Pagination',
        fn: async () => {
          const firstPage = await messagingApi.getMessages(activeConversationId, { limit: 2 });
          addTestMessage(`First page: ${firstPage.messages.length} messages, hasMore: ${firstPage.hasMore}`);
          
          if (firstPage.hasMore && firstPage.nextCursor) {
            const secondPage = await messagingApi.getMessages(activeConversationId, { 
              limit: 2, 
              cursor: firstPage.nextCursor 
            });
            addTestMessage(`Second page: ${secondPage.messages.length} messages`);
          }
        }
      },
    ];

    for (const test of tests) {
      await runTest(test.name, test.fn);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const testFileUpload = async () => {
    if (!activeConversationId) {
      addTestMessage('❌ No active conversation for file upload test');
      return;
    }

    // Create a simple test file
    const testContent = 'This is a test file for messaging system';
    const blob = new Blob([testContent], { type: 'text/plain' });
    const file = new File([blob], 'test-file.txt', { type: 'text/plain' });

    await runTest('File Upload', async () => {
      const attachment = await messagingApi.uploadMessageAttachment(file, activeConversationId);
      addTestMessage(`Uploaded file: ${attachment.name} (${attachment.size} bytes)`);
      
      if (!attachment.url) {
        throw new Error('No URL returned for uploaded file');
      }
    });
  };

  const TestStatus = ({ testName }: { testName: string }) => {
    const status = testResults[testName];
    if (!status || status === 'pending') return <Badge variant="outline">Pending</Badge>;
    if (status === 'success') return <Badge variant="default" className="bg-green-500">✓ Success</Badge>;
    return <Badge variant="destructive">✗ Failed</Badge>;
  };

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Messaging System Test</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please log in to test the messaging system.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Realtime Messaging System Test
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Test the realtime messaging functionality including windowed loading, 
            realtime updates, and file attachments.
          </p>
          
          <div className="flex items-center gap-4 mb-4">
            <Button 
              onClick={createTestConversation}
              disabled={isCreatingConversation}
              className="flex items-center gap-2"
            >
              {isCreatingConversation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              Create Test Conversation
            </Button>
            
            {testConversationId && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">Active: {testConversationId.slice(0, 8)}...</Badge>
              </div>
            )}
          </div>

          <Tabs defaultValue="chat" className="w-full">
            <TabsList>
              <TabsTrigger value="chat">Chat Test</TabsTrigger>
              <TabsTrigger value="api">API Tests</TabsTrigger>
              <TabsTrigger value="logs">Test Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="space-y-4">
              {activeConversationId ? (
                <div className="h-[500px] border rounded-lg">
                  <ChatWindow
                    conversationId={activeConversationId}
                    onSendMessage={handleSendMessage}
                    title="Test Conversation"
                  />
                </div>
              ) : (
                <div className="h-[500px] border rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Create a test conversation to start chatting</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="api" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Message API Tests</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Fetch Messages</span>
                      <TestStatus testName="Fetch Messages" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Send Test Message</span>
                      <TestStatus testName="Send Test Message" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Test Pagination</span>
                      <TestStatus testName="Test Pagination" />
                    </div>
                    <Button 
                      onClick={runMessagingTests} 
                      disabled={!activeConversationId}
                      className="w-full"
                    >
                      Run Message Tests
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">File Upload Tests</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>File Upload</span>
                      <TestStatus testName="File Upload" />
                    </div>
                    <Button 
                      onClick={testFileUpload}
                      disabled={!activeConversationId}
                      className="w-full flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Test File Upload
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Test Logs
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setTestMessages([])}
                    >
                      Clear
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm">
                    {testMessages.length === 0 ? (
                      <p className="text-muted-foreground">No test messages yet...</p>
                    ) : (
                      testMessages.map((message, index) => (
                        <div key={index} className="mb-1">
                          {message}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p><strong>1.</strong> Create a test conversation to initialize the messaging system</p>
          <p><strong>2.</strong> Use the Chat Test tab to send messages and test realtime functionality</p>
          <p><strong>3.</strong> Open another browser window/tab to test realtime sync between sessions</p>
          <p><strong>4.</strong> Run API tests to verify backend functionality</p>
          <p><strong>5.</strong> Check test logs for detailed information about operations</p>
        </CardContent>
      </Card>
    </div>
  );
}