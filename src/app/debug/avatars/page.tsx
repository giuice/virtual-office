'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedAvatar } from '@/components/ui/enhanced-avatar';
import { testSupabaseStorageConfiguration, testAvatarUrl } from '@/lib/supabase-storage-test';
import { debugAvatarUrl, testSupabaseStorageAccess, logAvatarDebugInfo } from '@/lib/avatar-debug';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';

export default function AvatarDebugPage() {
  const { user } = useAuth();
  const { currentUserProfile, companyUsers } = useCompany();
  const [testResults, setTestResults] = useState<string>('');
  const [isRunningTests, setIsRunningTests] = useState(false);

  const addToResults = (message: string) => {
    setTestResults(prev => prev + message + '\n');
  };

  const runStorageTests = async () => {
    setIsRunningTests(true);
    setTestResults('');
    
    addToResults('🔍 Starting Supabase Storage Tests...\n');
    
    try {
      // Capture console output
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = (...args) => {
        addToResults(args.join(' '));
        originalLog(...args);
      };
      
      console.error = (...args) => {
        addToResults('ERROR: ' + args.join(' '));
        originalError(...args);
      };
      
      console.warn = (...args) => {
        addToResults('WARN: ' + args.join(' '));
        originalWarn(...args);
      };
      
      await testSupabaseStorageConfiguration();
      
      // Test storage access
      addToResults('\n🔍 Testing Storage Access...');
      const storageAccess = await testSupabaseStorageAccess();
      addToResults(`Bucket exists: ${storageAccess.bucketExists}`);
      addToResults(`Public access: ${storageAccess.publicAccess}`);
      addToResults(`Sample URLs tested: ${storageAccess.sampleUrls.length}`);
      
      for (const urlInfo of storageAccess.sampleUrls) {
        addToResults(`\nURL: ${urlInfo.url}`);
        addToResults(`Accessible: ${urlInfo.accessible}`);
        addToResults(`Status: ${urlInfo.responseStatus}`);
        if (urlInfo.error) {
          addToResults(`Error: ${urlInfo.error}`);
        }
      }
      
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      
    } catch (error) {
      addToResults(`\n❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    setIsRunningTests(false);
  };

  const testCurrentUserAvatar = async () => {
    if (!currentUserProfile?.avatarUrl) {
      addToResults('\n⚠️ Current user has no avatar URL to test');
      return;
    }
    
    addToResults(`\n🖼️ Testing current user avatar: ${currentUserProfile.avatarUrl}`);
    
    try {
      const debugInfo = await debugAvatarUrl(currentUserProfile.avatarUrl);
      addToResults(`Accessible: ${debugInfo.accessible}`);
      addToResults(`Status: ${debugInfo.responseStatus}`);
      addToResults(`CORS: ${debugInfo.corsEnabled}`);
      
      if (debugInfo.error) {
        addToResults(`Error: ${debugInfo.error}`);
      }
      
      if (debugInfo.responseHeaders) {
        addToResults('Headers:');
        Object.entries(debugInfo.responseHeaders).forEach(([key, value]) => {
          addToResults(`  ${key}: ${value}`);
        });
      }
    } catch (error) {
      addToResults(`❌ Debug failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testAllUserAvatars = async () => {
    addToResults('\n🖼️ Testing all user avatars...');
    
    for (const user of companyUsers) {
      if (user.avatarUrl) {
        addToResults(`\nTesting ${user.displayName}: ${user.avatarUrl}`);
        try {
          const debugInfo = await debugAvatarUrl(user.avatarUrl);
          addToResults(`  Status: ${debugInfo.responseStatus} - ${debugInfo.accessible ? 'OK' : 'FAILED'}`);
          if (debugInfo.error) {
            addToResults(`  Error: ${debugInfo.error}`);
          }
        } catch (error) {
          addToResults(`  ❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        addToResults(`\n${user.displayName}: No avatar URL`);
      }
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Avatar Debug Tool</h1>
          <p className="text-muted-foreground">
            Debug avatar loading issues and test Supabase storage configuration
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
            <CardDescription>
              Run various tests to diagnose avatar issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runStorageTests} 
              disabled={isRunningTests}
              className="w-full"
            >
              {isRunningTests ? 'Running Tests...' : 'Test Supabase Storage'}
            </Button>
            
            <Button 
              onClick={testCurrentUserAvatar} 
              disabled={!currentUserProfile?.avatarUrl}
              variant="outline"
              className="w-full"
            >
              Test Current User Avatar
            </Button>
            
            <Button 
              onClick={testAllUserAvatars} 
              disabled={companyUsers.length === 0}
              variant="outline"
              className="w-full"
            >
              Test All User Avatars
            </Button>
            
            <Button 
              onClick={() => setTestResults('')} 
              variant="outline"
              className="w-full"
            >
              Clear Results
            </Button>
          </CardContent>
        </Card>

        {/* Avatar Previews */}
        <Card>
          <CardHeader>
            <CardTitle>Avatar Previews</CardTitle>
            <CardDescription>
              See how avatars are currently rendering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentUserProfile && (
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <EnhancedAvatar
                  user={currentUserProfile}
                  size="lg"
                  showStatus={true}
                  onError={(error, url) => {
                    addToResults(`\n❌ Avatar load error for current user: ${error.message}`);
                    addToResults(`URL: ${url}`);
                  }}
                />
                <div>
                  <p className="font-medium">{currentUserProfile.displayName}</p>
                  <p className="text-sm text-muted-foreground">{currentUserProfile.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Avatar URL: {currentUserProfile.avatarUrl || 'None'}
                  </p>
                </div>
              </div>
            )}
            
            {companyUsers.slice(0, 3).map(user => (
              <div key={user.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <EnhancedAvatar
                  user={user}
                  size="md"
                  showStatus={true}
                  onError={(error, url) => {
                    addToResults(`\n❌ Avatar load error for ${user.displayName}: ${error.message}`);
                    addToResults(`URL: ${url}`);
                  }}
                />
                <div>
                  <p className="font-medium">{user.displayName}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Avatar URL: {user.avatarUrl || 'None'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            Output from avatar and storage tests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {testResults || 'No test results yet. Click a test button to start.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}