// src/app/(dashboard)/realtime-test/page.tsx
'use client';

import React from 'react';
import { useRealtimeTest } from '@/hooks/realtime/useRealtimeTest';

export default function RealtimeTestPage() {
  const { status, error } = useRealtimeTest({ table: 'messages', schema: 'public' });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Realtime Test</h1>
      <p className="text-sm text-gray-600">Testing realtime connection… Check the browser console.</p>
      <div className="mt-4">
        <div className="text-sm">Status: <span className="font-mono">{status}</span></div>
        {error && <div className="text-sm text-red-600">Error: {error}</div>}
      </div>
    </div>
  );
}
