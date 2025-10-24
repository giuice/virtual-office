'use client'
{/* src/providers/query-provider.tsx */}
import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Use useState to ensure QueryClient is only created once per component instance
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 1000 * 60 * 5, // 5 minutes - Adjust as needed
        gcTime: 1000 * 60 * 60,   // 1 hour - How long unused data stays in cache
        refetchOnWindowFocus: process.env.NODE_ENV === 'production', // Refetch on focus only in prod
        retry: 1, // Retry failed requests once
      },
      mutations: {
        retry: 0, // Don't retry mutations by default
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Add devtools only in development and not in test environments */}
      {/*process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS && (
        <ReactQueryDevtools initialIsOpen={false} />
      )*/}
    </QueryClientProvider>
  )
}