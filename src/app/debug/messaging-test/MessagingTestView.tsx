'use client';

import { ChatWindow } from '@/components/messaging/ChatWindow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Users, Upload } from 'lucide-react';

export type TestResultStatus = 'pending' | 'success' | 'error';

interface TestStatusProps {
  status?: TestResultStatus;
}

const TestStatus: React.FC<TestStatusProps> = ({ status }) => {
  if (!status || status === 'pending') return <Badge variant="outline">Pending</Badge>;
  if (status === 'success') return <Badge variant="default" className="bg-green-500">Success</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
};

interface MessagingTestViewProps {
  activeConversationId: string | null;
  testConversationId: string;
  joinConversationId: string;
  isCreatingConversation: boolean;
  isJoiningConversation: boolean;
  testResults: Record<string, TestResultStatus>;
  testMessages: string[];
  onCreateConversation: () => void;
  onJoinConversation: () => void;
  onJoinConversationIdChange: (value: string) => void;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
  onRunMessagingTests: () => void;
  onTestFileUpload: () => void;
  onClearMessages: () => void;
}

export function MessagingTestView({
  activeConversationId,
  testConversationId,
  joinConversationId,
  isCreatingConversation,
  isJoiningConversation,
  testResults,
  testMessages,
  onCreateConversation,
  onJoinConversation,
  onJoinConversationIdChange,
  onSendMessage,
  onRunMessagingTests,
  onTestFileUpload,
  onClearMessages,
}: MessagingTestViewProps) {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
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
              onClick={onCreateConversation}
              disabled={isCreatingConversation}
              className="flex items-center gap-2"
            >
              {isCreatingConversation ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Users className="size-4" />
              )}
              Create Test Conversation
            </Button>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Paste conversation ID"
                value={joinConversationId}
                onChange={(e) => onJoinConversationIdChange(e.target.value)}
                className="w-64"
              />
              <Button onClick={onJoinConversation} disabled={isJoiningConversation} variant="secondary">
                {isJoiningConversation ? <Loader2 className="size-4 animate-spin" /> : 'Join Conversation'}
              </Button>
            </div>

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
                    onSendMessage={onSendMessage}
                    title="Test Conversation"
                  />
                </div>
              ) : (
                <div className="h-[500px] border rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="size-12 mx-auto mb-4 text-muted-foreground" />
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
                      <TestStatus status={testResults['Fetch Messages']} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Send Test Message</span>
                      <TestStatus status={testResults['Send Test Message']} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Test Pagination</span>
                      <TestStatus status={testResults['Test Pagination']} />
                    </div>
                    <Button onClick={onRunMessagingTests} disabled={!activeConversationId} className="w-full">
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
                      <TestStatus status={testResults['File Upload']} />
                    </div>
                    <Button
                      onClick={onTestFileUpload}
                      disabled={!activeConversationId}
                      className="w-full flex items-center gap-2"
                    >
                      <Upload className="size-4" />
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
                    <Button variant="outline" size="sm" onClick={onClearMessages}>
                      Clear
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm">
                    {testMessages.length === 0 ? (
                      <p className="text-muted-foreground">No test messages yet…</p>
                    ) : (
                      testMessages.map((message) => (
                        <div key={message} className="mb-1">
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
