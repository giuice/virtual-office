'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cleanupDuplicateCompanies } from '@/lib/api';

export default function CleanupCompaniesPage() {
  const { user } = useAuth();
  const [userId, setUserId] = useState(user?.id || '');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const handleCleanup = async () => {
    if (!userId) {
      setResult({
        success: false,
        message: 'Please enter a user ID'
      });
      return;
    }

    try {
      setIsLoading(true);
      setResult(null);

      const response = await cleanupDuplicateCompanies(userId);
      
      if (response.totalRemoved > 0) {
        setResult({
          success: true,
          message: `Successfully cleaned up ${response.totalRemoved} duplicate companies`,
          details: response
        });
      } else {
        setResult({
          success: true,
          message: 'No duplicate companies found for this user',
          details: response
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'An error occurred during cleanup'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Company Cleanup Tool</CardTitle>
          <CardDescription>
            This tool helps clean up duplicate companies for a user. It will keep the most
            recent company and delete all others.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="userId" className="text-sm font-medium">
              User ID
            </label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              The Firebase UID of the user whose companies need cleanup
            </p>
          </div>

          <Button 
            onClick={handleCleanup} 
            disabled={isLoading || !userId}
            className="w-full"
          >
            {isLoading ? 'Cleaning up...' : 'Clean Up Duplicate Companies'}
          </Button>

          {result && (
            <>
              <Separator className="my-4" />
              <div className={`p-4 border rounded-md ${
                result.success ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 
                'border-red-200 bg-red-50 dark:bg-red-900/20'
              }`}>
                <h3 className={`font-medium mb-2 ${
                  result.success ? 'text-green-800 dark:text-green-200' : 
                  'text-red-800 dark:text-red-200'
                }`}>
                  {result.success ? 'Success' : 'Error'}
                </h3>
                <p className="text-sm mb-2">{result.message}</p>
                {result.details && (
                  <pre className="text-xs p-2 bg-black/5 rounded overflow-auto">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          <div className="text-sm text-muted-foreground">
            <p><strong>Note:</strong> This is an administrative tool. Only run this if you understand
            the consequences. It will:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Find all companies where the user is an admin</li>
              <li>Keep only the most recently created company</li>
              <li>Delete all other companies</li>
              <li>Update the user record to point to the kept company</li>
            </ul>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}