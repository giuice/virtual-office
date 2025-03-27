'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
  Users2Icon, 
  HomeIcon, 
  SettingsIcon, 
  MessageSquareIcon, 
  CalendarIcon,
  ArrowRightIcon
} from 'lucide-react';
import { QuickLinksGrid } from '@/app/(dashboard)/dashboard/components/QuickLinksGrid';
import { CompanyOverviewCard } from '@/app/(dashboard)/dashboard/components/CompanyOverviewCard';
import { useMessaging } from '@/contexts/MessagingContext'; // Import useMessaging
import { useState } from 'react'; // Import useState
import { Input } from '@/components/ui/input'; // Import Input
import { MessageType, MessageStatus } from '@/types/messaging'; // Import enums

export default function DashboardPage() {
  const { company, currentUserProfile, companyUsers } = useCompany();
  
  const isAdmin = company?.adminIds?.includes(currentUserProfile?.id || '') || false;

  return (
    <DashboardShell>
      <DashboardHeader
        heading={`Welcome, ${currentUserProfile?.displayName || 'User'}!`}
        description={`${company?.name || 'Your company'} virtual office dashboard`}
      />
      <div className="flex-1">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Virtual Office Floor Plan</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/floor-plan" className="flex items-center gap-2">
                  <span>Open Floor Plan</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>
              View and interact with your company's virtual office space
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] bg-accent rounded-md flex items-center justify-center">
              <div className="text-center">
                <HomeIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click the button above to open the interactive floor plan
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid gap-8">
          <CompanyOverviewCard 
            company={company || undefined}
            companyUsers={companyUsers}
            currentUserProfile={currentUserProfile || undefined}
          />
          
          <QuickLinksGrid isAdmin={isAdmin} />

          {/* Temporary Messaging Test Component */}
          <Card>
            <CardHeader>
              <CardTitle>Messaging Test</CardTitle>
              <CardDescription>
                Test Socket.IO connection and message sending.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MessagingTestComponent />
            </CardContent>
          </Card>
          {/* End Temporary Messaging Test Component */}

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Admin Actions</CardTitle>
                <CardDescription>
                  Special actions available to company administrators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/team">
                      <Users2Icon className="mr-2 h-4 w-4" />
                      Manage Team
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      Company Settings
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

// Temporary Test Component - Remove after verification
const MessagingTestComponent = () => {
  const { isConnected, sendMessage } = useMessaging();
  const [messageContent, setMessageContent] = useState('');

  const handleSendTestMessage = () => {
    if (messageContent.trim()) {
      sendMessage({
        // Provide dummy data matching the Omit<Message, 'id' | 'timestamp'> type
        conversationId: 'test-conversation-123',
        senderId: 'test-user-456', // Replace with actual user ID later
        content: messageContent,
        type: MessageType.TEXT, // Use enum member
        status: MessageStatus.SENDING, // Use enum member
        reactions: [],
        isEdited: false,
        // replyToId and attachments are optional
      });
      setMessageContent(''); // Clear input after sending
    }
  };

  return (
    <div className="space-y-4">
      <p>Socket.IO Connection Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      <div className="flex w-full max-w-sm items-center space-x-2">
        <Input
          type="text"
          placeholder="Enter test message"
          value={messageContent}
          onChange={(e) => setMessageContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendTestMessage()}
        />
        <Button onClick={handleSendTestMessage} disabled={!isConnected || !messageContent.trim()}>
          Send Test Message
        </Button>
      </div>
    </div>
  );
};
