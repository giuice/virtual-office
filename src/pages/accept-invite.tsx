// src/pages/accept-invite.tsx
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import '@/app/globals.css';
// Removed Firebase Auth UI import comment

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNotification } from '@/hooks/useNotification'; // Import useNotification

// Define the inner component that uses the hook
function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Destructure auth methods and state needed for the form
  const {
    user,
    loading: authLoading,
    signIn,
    signUp,
    signInWithGoogle,
    actionLoading, // Loading state for auth actions
    actionError      // Error state for auth actions
  } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); // Page-level error (e.g., token invalid)
  const [isProcessing, setIsProcessing] = useState(false);

  // State for the auth form within this component
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { showSuccess, showError } = useNotification(); // Use notifications

  // ... (useEffect for token extraction remains the same) ...
  useEffect(() => {
    if (searchParams) {
      const inviteToken = searchParams.get('token');
      if (inviteToken) {
        setToken(inviteToken);
        setError(null);
      }
    }
  }, [searchParams]);


  // ... (useEffect for API call remains the same) ...
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
        showSuccess({ description: 'Invitation accepted! Redirecting...' }); // Show success
        // Redirect to dashboard or company page
        router.push('/dashboard'); // Redirect to dashboard after successful acceptance
      })
      .catch(err => {
        console.error('Error accepting invitation API call:', err);
        setError(err.message || 'An error occurred while accepting the invitation.'); // Set page-level error
        showError({ description: err.message || 'Failed to accept invitation.' }); // Show error notification
        setIsProcessing(false); // Allow retry? Or guide user?
      });
      // Note: No finally block to set isProcessing = false here, because
      // successful acceptance leads to redirect. Only set false on error.
    }
  }, [authLoading, user, token, router, isProcessing, showSuccess, showError]); // Added notification hooks to dependencies


  // --- Auth Form Handlers ---
  const handleSignInSubmit = (e: React.FormEvent<HTMLFormElement>) => { // Removed async from handler signature
    e.preventDefault();
    // Wrap async logic
    const attemptSignIn = async () => {
      try {
        await signIn(email, password);
        // Success message handled by AuthContext or redirect effect
      } catch (err) {
        console.error("Sign in error:", err); // Log the specific error
        // Error is set in AuthContext (actionError)
      }
    };
    void attemptSignIn(); // Call the async function, void operator suppresses promise lint warning
  };

  // Corrected: Ensure attemptSignUp is defined and called within handleSignUpSubmit
  const handleSignUpSubmit = (e: React.MouseEvent<HTMLButtonElement>) => { // Removed async from handler signature
    e.preventDefault(); // Good practice, though type="button" should prevent submission
    // Basic validation example
    if (password.length < 6) {
       showError({ description: "Password must be at least 6 characters long."});
       return;
    }
    // Define and call the async wrapper function
    const attemptSignUp = async () => {
      try {
        await signUp(email, password);
        showSuccess({ description: 'Sign up successful! Check your email if confirmation is needed.' });
        // User state will update via useAuth, triggering the API call useEffect
      } catch (err) {
        console.error("Sign up error:", err); // Log the specific error
        // Error is set in AuthContext (actionError)
      }
    };
    void attemptSignUp(); // Call the wrapper
  };

   const handleGoogleSignInClick = () => { // Removed async from handler signature
    // Wrap async logic
    const attemptGoogleSignIn = async () => {
      try {
        await signInWithGoogle();
        // Redirect happens via Supabase OAuth flow
      } catch (err) {
         console.error("Google sign in error:", err); // Log the specific error
         // Error is set in AuthContext (actionError)
      }
    };
    void attemptGoogleSignIn(); // Call the async function
  };


  // ... (Loading state rendering remains the same) ...
  if (authLoading || isProcessing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/5">
        {/* ... loading card content ... */}
         <Card className="w-full max-w-md border-2 border-primary/10 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <CardTitle className="text-xl font-semibold">Processing Invitation</CardTitle>
            <CardDescription className="text-base">
              We're getting everything ready for you
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4 pb-6">
            <p className="text-muted-foreground">
              Please wait while we process your invitation and verify your access credentials.
            </p>
            <div className="w-full bg-secondary/30 h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-pulse" style={{width: '70%'}}></div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center border-t bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">This will only take a moment</p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ... (Error state rendering remains the same) ...
   if (error) { // This is for page-level errors (token, API call failure)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/5">
       {/* ... error card content ... */}
        <Card className="w-full max-w-md border-2 border-destructive/10 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive h-8 w-8">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
            </div>
            <CardTitle className="text-xl font-semibold">Invitation Error</CardTitle>
            <CardDescription className="text-base">
              We encountered a problem with your invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4 pb-6">
            <p className="text-destructive/90 font-medium">
              {error}
            </p>
            <p className="text-muted-foreground">
              This could be due to an expired token or invalid permissions. Please check your invitation details or contact your workspace administrator.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 border-t bg-muted/20 p-4">
            <Button className="w-full" variant="outline" onClick={() => { setToken(null); setError(null); }}> {/* Clear error too */}
              Try a different token
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => router.push('/')}>
              Return to home page
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }


  // If token is valid but user is NOT logged in, show login/signup prompt.
  if (token && !user) {
    // ... (sessionStorage setting remains the same) ...
     if (typeof window !== 'undefined') {
      sessionStorage.setItem('isAcceptingInvite', 'true');
      console.log('[AcceptInvitePage] Set sessionStorage flag: isAcceptingInvite=true');
    }


    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/5">
        <Card className="w-full max-w-md border-2 border-primary/10 shadow-lg">
          {/* ... CardHeader remains the same ... */}
           <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary h-8 w-8">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <CardTitle className="text-xl font-semibold">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              Sign in or create an account to join the workspace
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
             {/* --- START: Authentication Form --- */}
             {/* onSubmit still calls the synchronous wrapper */}
             <form onSubmit={handleSignInSubmit} className="space-y-3">
               <div className="space-y-1">
                 <Label htmlFor="email">Email</Label>
                 <Input
                   id="email"
                   type="email"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@example.com"
                   required
                   disabled={actionLoading}
                 />
               </div>
               <div className="space-y-1">
                 <Label htmlFor="password">Password</Label>
                 <Input
                   id="password"
                   type="password"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   placeholder="••••••••"
                   required
                   disabled={actionLoading}
                 />
               </div>
               {/* Display Auth Action Error */}
                {actionError && (
                  <p className="text-sm font-medium text-destructive">{actionError}</p>
                )}
               <div className="flex flex-col sm:flex-row gap-2 pt-2">
                 <Button type="submit" className="flex-1" disabled={actionLoading}>
                   {actionLoading ? 'Signing In...' : 'Sign In'}
                 </Button>
                 <Button
                   type="button"
                   variant="secondary"
                   className="flex-1"
                   onClick={handleSignUpSubmit}
                   disabled={actionLoading}
                 >
                   {actionLoading ? 'Signing Up...' : 'Sign Up'}
                 </Button>
               </div>
             </form>

             <div className="relative my-3">
               <div className="absolute inset-0 flex items-center">
                 <span className="w-full border-t" />
               </div>
               <div className="relative flex justify-center text-xs uppercase">
                 <span className="bg-card px-2 text-muted-foreground">
                   Or continue with
                 </span>
               </div>
             </div>

             <Button
               type="button"
               variant="outline"
               className="w-full"
               // onClick calls the synchronous wrapper
               onClick={handleGoogleSignInClick}
               disabled={actionLoading}
             >
                {/* ... Google Icon ... */}
               {actionLoading ? 'Redirecting...' : 'Sign in with Google'}
             </Button>
             {/* --- END: Authentication Form --- */}
          </CardContent>
          {/* ... CardFooter remains the same ... */}
           <CardFooter className="flex flex-col space-y-2 border-t bg-muted/20 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              By signing in, you'll be able to accept the invitation and join the workspace
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ... (Token input form rendering remains the same) ...
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/5">
        {/* ... token input card content ... */}
         <Card className="w-full max-w-md border-2 border-primary/10 shadow-lg">
          <CardHeader className="space-y-1 text-center pb-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Welcome to Virtual Office</CardTitle>
            <CardDescription className="text-base">
              You've been invited to join a workspace. Please enter your invitation token to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="mx-auto my-4 flex w-full items-center justify-center">
              <div className="h-px w-full bg-muted" />
              <span className="mx-6 text-muted-foreground flex-shrink-0">Token required</span>
              <div className="h-px w-full bg-muted" />
            </div>
            <form
              className="space-y-4"
              onSubmit={e => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('inviteToken') as HTMLInputElement;
                if (input.value.trim()) {
                  setToken(input.value.trim());
                  setError(null);
                } else {
                  setError('Please enter a valid invitation token.'); // Use page-level error
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="inviteToken">Invitation Token</Label>
                <Input
                  id="inviteToken"
                  name="inviteToken"
                  placeholder="Enter your invitation token"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  className={error ? "border-destructive" : ""} // Check page-level error
                />
                 {/* Display page-level error for token input */}
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              </div>
              <Button type="submit" className="w-full">
                Join Workspace
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col items-center justify-center space-y-2 border-t bg-muted/20 p-6">
            <div className="text-sm text-muted-foreground text-center">
              <p>Need help? Contact your workspace administrator</p>
              <p>or check your invitation email for instructions.</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ... (Fallback rendering remains the same) ...
   return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg shadow-lg bg-white p-8 flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-2">Accept Invitation</h2>
        <p>Loading invitation details...</p> {/* Or consider showing an error/redirect */}
      </div>
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
