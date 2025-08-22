// src/app/join/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const token = searchParams?.get('token') || null;
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);

  // Fetch invitation details to get the invited email
  useEffect(() => {
    if (token) {
      fetchInvitationDetails();
    }
  }, [token]);

  // Redirect to dashboard if user is already authenticated and has joined
  useEffect(() => {
    if (joined && user) {
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    }
  }, [joined, user, router]);

  const fetchInvitationDetails = async () => {
    try {
      const response = await fetch(`/api/invitations/validate?token=${token}`);
      const data = await response.json();
      
      if (response.ok && data.invitation) {
        setInvitationEmail(data.invitation.email);
      }
    } catch (error) {
      console.error('Error fetching invitation details:', error);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      await signOut();
      // Redirect to signup page with invitation redirect
      const currentUrl = `/join?token=${token}`;
      router.push(`/signup?redirect=${encodeURIComponent(currentUrl)}`);
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  const handleAcceptInvitation = async () => {
    if (!token) {
      setError('Invalid invitation link');
      return;
    }

    if (!user) {
      setError('You must be signed in to accept an invitation');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('Accepting invitation with token:', token);
      console.log('Using authenticated user ID:', user.id);
      
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          supabaseUid: user.id  // Use the actual authenticated user's Supabase UID
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

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="container mx-auto py-10 flex justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  // Show sign-in prompt if user is not authenticated
  if (!user) {
    return (
      <div className="container mx-auto py-10 flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>You must sign in to accept this invitation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">Please sign in with the email address that received this invitation.</p>
            <Button 
              onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/join?token=${token}`)}`)}
              className="w-full"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if the logged-in user email matches the invitation email
  const emailMismatch = invitationEmail && user.email !== invitationEmail;

  return (
    <div className="container mx-auto py-10 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{joined ? 'Welcome!' : 'Join Company'}</CardTitle>
          <CardDescription>
            {joined 
              ? 'You have successfully joined the company. Redirecting to dashboard...' 
              : 'Accept your invitation to join the company'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {joined ? (
            <div className="text-center">
              <p className="mb-4">You can now access the company workspace.</p>
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : (
            <>
              <p className="mb-4">You've been invited to join a company workspace.</p>
              
              {invitationEmail && (
                <p className="text-sm text-muted-foreground mb-2">
                  Invitation sent to: <strong>{invitationEmail}</strong>
                </p>
              )}
              
              <p className="text-sm text-muted-foreground mb-2">
                Currently signed in as: <strong>{user.email}</strong>
              </p>
              
              {emailMismatch && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-start">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-yellow-800 font-medium mb-1">Email Mismatch</p>
                      <p className="text-yellow-700 mb-3">
                        You're signed in as {user.email}, but this invitation was sent to {invitationEmail}.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleSwitchAccount}
                        className="w-full"
                      >
                        Sign in as {invitationEmail}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground mt-2">Invitation Token: {token.substring(0, 8)}...</p>
              
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
              disabled={loading || emailMismatch}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : emailMismatch ? (
                'Sign in with correct email first'
              ) : (
                'Accept Invitation'
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}