'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function CreateCompanyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { createNewCompany, isLoading, error, currentUserProfile, loadCompanyData } = useCompany();
  const [companyName, setCompanyName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Handle authentication redirect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);
  
  // Handle company redirect
  useEffect(() => {
    if (!isLoading && !isCreating && currentUserProfile?.companyId) {
      console.log('Redirecting to dashboard - user already has company:', currentUserProfile);
      router.push('/dashboard');
    }
  }, [isLoading, currentUserProfile, router, isCreating]);

  // Early return if loading
  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Don't render the form if user is not logged in or already has a company
  if (!user || (currentUserProfile?.companyId && !isCreating)) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      setLocalError('Company name is required');
      return;
    }

    try {
      setIsCreating(true);
      setLocalError(null);
      const companyId = await createNewCompany(companyName);
      console.log('Company created successfully with ID:', companyId);
      
      // Force reload company data to ensure state is updated
      if (user) {
        await loadCompanyData(user.uid);
      }
      
      // Use window.location for a hard navigation instead of router.push
      // This ensures a complete page refresh and state reset
      window.location.href = '/dashboard';
    } catch (err) {
      setIsCreating(false);
      console.error('Error creating company:', err);
      setLocalError(err instanceof Error ? err.message : 'Error creating company');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Create Your Virtual Office</h1>
          <p className="text-muted-foreground">
            Set up your company workspace to start collaborating with your team
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="companyName" className="text-sm font-medium">
                Company Name
              </label>
              <Input
                id="companyName"
                placeholder="Enter your company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={isLoading || isCreating}
                required
              />
            </div>

            {(localError || error) && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {localError || error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isCreating || !companyName.trim()}
            >
              {isCreating ? 'Creating...' : isLoading ? 'Loading...' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}