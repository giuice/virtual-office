// src/app/join/page.tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function JoinPage() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || null;
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Generate a proper UUID for testing
  const generateTestUuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handleAcceptInvitation = async () => {
    if (!token) {
      setError('Invalid invitation link');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('Accepting invitation with token:', token);
      
      // Generate a test UUID for demonstration
      const testUuid = generateTestUuid();
      console.log('Using test UUID:', testUuid);
      
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          firebaseUid: testUuid  // Use a proper UUID format for testing
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      toast.success('Successfully joined the company!');
      setJoined(true);
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to join');
      toast.error(error instanceof Error ? error.message : 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="container mx-auto py-10 flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>No invitation token was provided</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Please check your invitation link and try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{joined ? 'Welcome!' : 'Join Company'}</CardTitle>
          <CardDescription>
            {joined 
              ? 'You have successfully joined the company' 
              : 'Accept your invitation to join the company'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {joined ? (
            <p>You can now access the company workspace.</p>
          ) : (
            <>
              <p className="mb-4">You've been invited to join a company workspace.</p>
              <p className="text-sm text-muted-foreground">Invitation Token: {token.substring(0, 8)}...</p>
              {error && (
                <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
        {!joined && (
          <CardFooter>
            <Button 
              onClick={handleAcceptInvitation} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : 'Accept Invitation'}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}