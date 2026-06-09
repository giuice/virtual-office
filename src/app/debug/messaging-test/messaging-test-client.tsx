'use client';

import { useReducerState } from '@/hooks/useReducerState';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { messagingApi } from '@/lib/messaging-api';
import { ConversationType, MessageStatus, MessageType } from '@/types/messaging';
import { MessagingTestView, type TestResultStatus } from './MessagingTestView';

export default function MessagingTestPage() {
  const { user } = useAuth();
  const { setActiveConversation, sendMessage: sendViaContext } = useMessaging();
  const [activeConversationId, setActiveConversationId] = useReducerState<string | null>(null);
  const [testConversationId, setTestConversationId] = useReducerState('');
  const [joinConversationId, setJoinConversationId] = useReducerState('');
  const [isCreatingConversation, setIsCreatingConversation] = useReducerState(false);
  const [isJoiningConversation, setIsJoiningConversation] = useReducerState(false);
  const [testResults, setTestResults] = useReducerState<Record<string, TestResultStatus>>({});
  const [testMessages, setTestMessages] = useReducerState<string[]>([]);

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
      const targetUserId = window.prompt('Enter the database user id to start a DM with');
      if (!targetUserId) {
        throw new Error('A target user id is required to start a direct message');
      }

      const conversation = await messagingApi.resolveConversation({
        type: ConversationType.DIRECT,
        userId: targetUserId,
      });
      
  setTestConversationId(conversation.id);
  setActiveConversationId(conversation.id);
  // Ensure global active conversation is set for centralized subscription
  setActiveConversation(conversation);
      addTestMessage(`Created test conversation: ${conversation.id}`);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const joinExistingConversation = async () => {
    if (!user) {
      addTestMessage('❌ User not authenticated');
      return;
    }
    if (!joinConversationId.trim()) {
      addTestMessage('❌ Provide a conversation ID to join');
      return;
    }
    setIsJoiningConversation(true);
    try {
  const convo = await messagingApi.joinConversation(joinConversationId.trim());
  setActiveConversationId(convo.id);
  setTestConversationId(convo.id);
  setActiveConversation(convo);
      addTestMessage(`✅ Joined conversation: ${convo.id}`);
    } catch (e) {
      addTestMessage(`❌ Failed to join: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsJoiningConversation(false);
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
          await sendViaContext(`Test message sent at ${new Date().toISOString()}`, { type: MessageType.TEXT });
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

    await Promise.all(
      tests.map(async (test, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 500));
        await runTest(test.name, test.fn);
      })
    );
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
    <MessagingTestView
      activeConversationId={activeConversationId}
      testConversationId={testConversationId}
      joinConversationId={joinConversationId}
      isCreatingConversation={isCreatingConversation}
      isJoiningConversation={isJoiningConversation}
      testResults={testResults}
      testMessages={testMessages}
      onCreateConversation={createTestConversation}
      onJoinConversation={joinExistingConversation}
      onJoinConversationIdChange={setJoinConversationId}
      onSendMessage={handleSendMessage}
      onRunMessagingTests={runMessagingTests}
      onTestFileUpload={testFileUpload}
      onClearMessages={() => setTestMessages([])}
    />
  );
}
