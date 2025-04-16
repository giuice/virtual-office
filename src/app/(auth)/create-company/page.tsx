'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Added Label import
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added more Card components

export default function CreateCompanyPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();
  // Get mutation, profile query, and aggregated loading state from the new context
  const { createCompanyMutation, currentUserProfileQuery, isLoading: companyContextLoading } = useCompany();
  const { data: currentUserProfile, isLoading: profileLoading } = currentUserProfileQuery;

  const [companyName, setCompanyName] = useState('');

  // Use mutation's loading and error states directly
  const { mutateAsync: createCompany, isPending: isCreating, error: mutationError } = createCompanyMutation;

  // Handle authentication redirect
  useEffect(() => {
    if (!authLoading && !authUser) {
      console.log('[CreateCompanyPage] Auth finished, no user found. Redirecting to login.');
      router.push('/login');
    }
  }, [authLoading, authUser, router]);

  // Handle redirect if user already has a company (after profile loads)
  useEffect(() => {
    // Wait for profile to load and ensure mutation isn't running
    if (!profileLoading && currentUserProfile?.companyId && !isCreating) {
      console.log(`[CreateCompanyPage] Profile loaded, user ${currentUserProfile.id} already belongs to company ${currentUserProfile.companyId}. Redirecting to dashboard.`);
      router.push('/dashboard');
    }
  }, [profileLoading, currentUserProfile, router, isCreating]);

  // Combined loading state
  const isLoading = authLoading || companyContextLoading; // Use aggregated loading from context

  // Early return if loading essential data
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Don't render the form if user is not logged in (should be handled by redirect, but good safety check)
  // or if they already have a company and profile has loaded (also handled by redirect)
  if (!authUser || (!profileLoading && currentUserProfile?.companyId)) {
     console.log('[CreateCompanyPage] Skipping render - no auth user or already has company.');
     return null; // Or a message indicating redirection is happening
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure profile is loaded before submitting
    if (!companyName.trim() || !authUser?.id || !currentUserProfile?.id) {
      console.error('[CreateCompanyPage] Submit prevented - Missing required data:', {
        companyName,
        authUserId: authUser?.id,
        profileId: currentUserProfile?.id,
        profileLoaded: !profileLoading,
      });
      // Optionally set a local error state here if needed for UI feedback
      return;
    }

    try {
      console.log(`[CreateCompanyPage] Attempting to create company "${companyName}" for authUser ${authUser.id}, profileId ${currentUserProfile.id}`);
      await createCompany({
        name: companyName,
        creatorAuthId: authUser.id,
        creatorDbId: currentUserProfile.id,
      });
      // onSuccess in the mutation hook handles invalidation and navigation
      console.log(`[CreateCompanyPage] Company creation mutation initiated successfully.`);
    } catch (err) {
      // Error is captured by mutationError state
      console.error('[CreateCompanyPage] Error submitting company creation mutation:', err);
    }
  };

  // Display error from mutation state
  const displayError = mutationError instanceof Error ? mutationError.message : mutationError;

  // Disable form if loading or creating
  const formDisabled = isLoading || isCreating;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create Your Virtual Office</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Set up your company workspace to start collaborating.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Enter your company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={formDisabled}
                required
              />
            </div>

            {displayError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {displayError}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={formDisabled || !companyName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Company'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
