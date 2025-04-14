// src/pages/accept-invite.tsx
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; // Use next/navigation for App Router compatibility if needed, or 'next/router' for Pages Router
import { AuthProvider, useAuth } from '@/contexts/AuthContext'; // Import AuthProvider
// TODO: Identify and import the actual Firebase Auth UI component
// import FirebaseAuthUI from '@/components/auth/FirebaseAuthUI';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Define the inner component that uses the hook
function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Hook to get URL search parameters
  const { user, loading: authLoading } = useAuth(); // Use 'loading' from AuthContext
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // State to manage acceptance processing

  // 1. Extract token from URL on component mount
  useEffect(() => {
    // Add null check for searchParams
    if (searchParams) {
      const inviteToken = searchParams.get('token');
      console.log('[AcceptInvitePage] Extracted token from URL:', inviteToken); // Added log
      if (inviteToken) {
        setToken(inviteToken);
      } else {
        console.error('[AcceptInvitePage] Invitation token missing in URL.'); // Added log
        setError('Invitation token is missing in the URL.');
      }
    } else {
      // Handle case where searchParams is null (might happen during SSR or initial load)
      console.warn("useSearchParams returned null initially.");
      // Set error immediately if searchParams is null on client-side mount
      if (typeof window !== 'undefined') { // Ensure this runs only client-side
         setError('Could not read invitation token from URL.');
      }
    }
  }, [searchParams]); // Dependency array includes searchParams

  // 2. Handle post-authentication: Call the accept API endpoint
  useEffect(() => {
    // Check if authentication is complete, we have a user, a token, and are not already processing
    if (!authLoading && user && token && !isProcessing) {
      setIsProcessing(true); // Prevent multiple calls
      console.log(`[AcceptInvitePage] User ${user.id} authenticated with token ${token}. Preparing to call accept API.`); // Added log

      const payload = { token, supabaseUid: user.id };
      console.log('[AcceptInvitePage] Calling /api/invitations/accept with payload:', payload); // Added log

      // Call the backend API to accept the invitation
      fetch('/api/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), // Use payload variable
      })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to accept invitation');
        }
        return response.json();
      })
      .then(data => {
        console.log('Invitation accepted successfully:', data);
        // Redirect to dashboard or company page
        router.push('/dashboard'); // Redirect to dashboard after successful acceptance
      })
      .catch(err => {
        console.error('Error accepting invitation API call:', err);
        setError(err.message || 'An error occurred while accepting the invitation.');
        setIsProcessing(false); // Allow retry? Or guide user?
      });
      // Note: No finally block to set isProcessing = false here, because
      // successful acceptance leads to redirect. Only set false on error.
    }
  }, [authLoading, user, token, router, isProcessing]); // Dependencies for the effect

  // Display loading state while checking auth or processing
  if (authLoading || isProcessing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Processing Invitation...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please wait while we process your invitation and check your authentication status.</p>
            {/* Optional: Add a spinner */}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Display error if token is invalid or acceptance failed
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
         <Card className="w-full max-w-md">
           <CardHeader>
              <CardTitle>Invitation Error</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Replaced Alert component with simple text */}
              <p className="text-destructive font-medium">Error</p>
              <p className="text-destructive">{error}</p>
              {/* Optionally add a button to retry or go home */}
            </CardContent>
         </Card>
       </div>
    );
  }

  // If token is valid but user is NOT logged in, show login/signup prompt.
  if (token && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Accept Invitation</CardTitle>
            <CardDescription>
              You've been invited! Please sign in or create an account to join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* TODO: Render the actual Firebase Auth UI component here */}
            {/* <FirebaseAuthUI /> */}
            <p className="text-center text-muted-foreground mt-4">
              (Placeholder for Firebase Auth UI)
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback/Unexpected state - maybe token is missing and no error set yet, or user logged in without token
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading invitation details...</p>
          {/* This state might indicate an issue if it persists */}
        </CardContent>
      </Card>
    </div>
  );
}

// Wrap the content component with the provider
export default function AcceptInvitePage() {
  return (
    <AuthProvider>
      <AcceptInviteContent />
    </AuthProvider>
  );
}
