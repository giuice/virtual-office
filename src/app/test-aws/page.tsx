'use client';

import { useState } from 'react';

export default function TestAWSPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/test-aws');
      const data = await response.json();
      
      setResult(data);
    } catch (err) {
      console.error('Error testing AWS connection:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">AWS Connection Test</h1>
      
      <button 
        onClick={testConnection}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded mb-4"
      >
        {loading ? 'Testing connection...' : 'Test AWS Connection'}
      </button>
      
      {error && (
        <div className="p-4 mb-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Test Result:</h2>
          <pre className="p-4 bg-gray-100 rounded overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-2">Navigation</h2>
        <a href="/setup-aws" className="text-blue-500 underline">Go to Setup AWS Page</a>
      </div>
    </div>
  );
}