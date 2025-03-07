'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function CreateCompanyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { createNewCompany, isLoading, error } = useCompany();
  const [companyName, setCompanyName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect to dashboard if already logged in
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      setLocalError('Company name is required');
      return;
    }

    try {
      setLocalError(null);
      const companyId = await createNewCompany(companyName);
      router.push('/office'); // Redirect to office after company created
    } catch (err) {
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
                disabled={isLoading}
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
              disabled={isLoading || !companyName.trim()}
            >
              {isLoading ? 'Creating...' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}