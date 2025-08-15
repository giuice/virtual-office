// src/app/(auth)/accept-invite/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { AuthErrorDisplay } from '@/components/auth/auth-error-display';
import { InvitationErrorDisplay } from '@/components/invitation/invitation-error-display';
import { AuthErrorHandler, CategorizedAuthError, RecoveryAction } from '@/lib/auth/error-handler';
import { InvitationErrorHandler, InvitationError } from '@/lib/invitation-error-handler';
import { useInvitationOperation } from '@/hooks/useInvitationOperation';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

// Separate component to handle search params
function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, signInWithGoogle, actionLoading, actionError } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<CategorizedAuthError | InvitationError | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [invitationDetails, setInvitationDetails] = useState<{
    email?: string;
    companyName?: string;
  } | null>(null);

  // Use invitation operation hook for better error handling
  const invitationOperation = useInvitationOperation({
    showNotifications: false, // We'll handle notifications manually
    onSuccess: (result) => {
      console.log('Invitation accepted successfully:', result);
      showSuccess({ description: 'Welcome to your new company! Invitation accepted successfully.' });
      
      // Redirect to office after successful acceptance
      setTimeout(() => {
        router.push('/office');
      }, 1500);
    },
    onError: (invitationError) => {
      setError(invitationError);
      setIsProcessing(false);
    }
  });

  // Extract token from URL on component mount
  useEffect(() => {
    if (searchParams) {
      const inviteToken = searchParams.get('token');
      console.log('[AcceptInvitePage] Extracted token from URL:', inviteToken);
      
      if (inviteToken) {
        setToken(inviteToken);
        // Optionally validate token and get invitation details
        validateInvitationToken(inviteToken);
      } else {
        console.error('[AcceptInvitePage] Invitation token missing in URL.');
        setError({
          type: 'invalid_token',
          userMessage: 'Invitation token is missing in the URL. Please check your invitation link.',
          isRetryable: false,
          recoveryActions: [
            {
              type: 'redirect',
              label: 'Go to Login',
              description: 'Return to the login page',
              action: () => router.push('/login')
            }
          ]
        });
      }
    }
  }, [searchParams, router]);

  // Validate invitation token and get details
  const validateInvitationToken = async (inviteToken: string) => {
    try {
      const response = await fetch(`/api/invitations/validate?token=${inviteToken}`);
      if (response.ok) {
        const data = await response.json();
        setInvitationDetails({
          email: data.email,
          companyName: data.companyName
        });
      } else {
        // Handle validation errors using invitation error handler
        const validationError = InvitationErrorHandler.handleError(
          { status: response.status, message: 'Invitation validation failed' },
          { token: inviteToken, operation: 'validate' }
        );
        setError(validationError);
      }
    } catch (err) {
      console.error('Error validating invitation token:', err);
      // Don't set error here, let the user proceed with authentication
    }
  };

  // Handle post-authentication: Call the accept API endpoint
  useEffect(() => {
    if (!authLoading && user && token && !isProcessing && !error) {
      setIsProcessing(true);
      console.log(`[AcceptInvitePage] User ${user.id} authenticated with token ${token}. Calling accept API.`);

      // Use the invitation operation hook for better error handling
      const acceptOperation = async () => {
        const payload = { token, supabaseUid: user.id };
        console.log('[AcceptInvitePage] Calling /api/invitations/accept with payload:', payload);

        const response = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to accept invitation');
        }

        return response.json();
      };

      // Execute the operation with enhanced error handling
      invitationOperation.executeOperation(
        acceptOperation,
        'accept',
        { token, email: invitationDetails?.email }
      ).catch(() => {
        // Error is handled by the hook
        setIsProcessing(false);
      });
    }
  }, [authLoading, user, token, router, isProcessing, error, showSuccess]);

  // Handle recovery actions for both auth and invitation errors
  const handleRecoveryAction = async (action: RecoveryAction | any) => {
    try {
      if (action.action) {
        await action.action();
      }
      setError(null);
    } catch (recoveryError) {
      console.error('Recovery action failed:', recoveryError);
      showError({ description: 'Recovery action failed. Please try again.' });
    }
  };

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // The useEffect above will handle the invitation acceptance after authentication
    } catch (err) {
      console.error('Google sign-in error:', err);
      const categorizedError = await AuthErrorHandler.handleError(err);
      setError(categorizedError);
    }
  };

  // Display loading state while checking auth or processing
  if (authLoading || isProcessing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              {isProcessing ? 'Accepting Invitation...' : 'Loading...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              {isProcessing 
                ? 'Please wait while we add you to the company and set up your account.'
                : 'Please wait while we check your authentication status.'
              }
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Display error with recovery options
  if (error) {
    // Check if it's an invitation error or auth error
    const isInvitationError = 'type' in error && 'suggestedActions' in error;
    
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {isInvitationError ? (
          <InvitationErrorDisplay
            error={error as InvitationError}
            onAction={handleRecoveryAction}
            onDismiss={() => setError(null)}
            isProcessing={isProcessing}
          />
        ) : (
          <AuthErrorDisplay
            error={error as CategorizedAuthError}
            onRecoveryAction={handleRecoveryAction}
            onDismiss={() => setError(null)}
          />
        )}
      </div>
    );
  }

  // Display action error from auth context
  if (actionError) {
    const authError: CategorizedAuthError = {
      type: 'invalid_credentials',
      userMessage: actionError,
      isRetryable: true,
      recoveryActions: [
        {
          type: 'retry',
          label: 'Try Again',
          description: 'Retry the authentication process',
          action: () => handleGoogleSignIn()
        }
      ]
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <AuthErrorDisplay
          error={authError}
          onRecoveryAction={handleRecoveryAction}
          isRecovering={actionLoading}
        />
      </div>
    );
  }

  // If token is valid but user is NOT logged in, show login/signup prompt
  if (token && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Accept Invitation
            </CardTitle>
            <CardDescription>
              {invitationDetails?.email 
                ? `You've been invited to join ${invitationDetails.companyName || 'a company'}!`
                : "You've been invited to join a company!"
              }
              <br />
              Please sign in or create an account to accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitationDetails?.email && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Invitation for:</p>
                <p className="font-medium">{invitationDetails.email}</p>
                {invitationDetails.companyName && (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">Company:</p>
                    <p className="font-medium">{invitationDetails.companyName}</p>
                  </>
                )}
              </div>
            )}

            <Button 
              onClick={handleGoogleSignIn}
              disabled={actionLoading}
              className="w-full"
              size="lg"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`)}
              >
                Sign in with existing account
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => router.push(`/signup?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`)}
              >
                Create new account
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              By accepting this invitation, you agree to join the company and follow their policies.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback state - should not normally be reached
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Processing Invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Loading invitation details...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Main component with Suspense wrapper
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              Please wait while we load your invitation...
            </p>
          </CardContent>
        </Card>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}