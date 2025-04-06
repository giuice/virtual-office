# React Query Implementation Plan

## 1. Initial Setup

### 1.1 Dependencies
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### 1.2 Provider Setup
```typescript
// src/providers/query-provider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60,   // 1 hour
      refetchOnWindowFocus: false
    }
  }
})
```

## 2. Space Queries Implementation

### 2.1 Query Hooks
```typescript
// src/hooks/queries/useSpaces.ts
export function useSpaces(companyId: string) {
  return useQuery({
    queryKey: ['spaces', companyId],
    queryFn: () => spaceRepository.findByCompany(companyId)
  })
}

export function useSpace(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId],
    queryFn: () => spaceRepository.findById(spaceId),
    enabled: !!spaceId
  })
}
```

### 2.2 Mutation Hooks
```typescript
// src/hooks/mutations/useSpaceMutations.ts
export function useCreateSpace() {
  return useMutation({
    mutationFn: (spaceData: SpaceCreate) => 
      spaceRepository.create(spaceData),
    onSuccess: () => {
      queryClient.invalidateQueries(['spaces'])
    }
  })
}

export function useUpdateSpace() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SpaceUpdate }) =>
      spaceRepository.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(['spaces'])
      queryClient.invalidateQueries(['space', id])
    }
  })
}
```

## 3. Real-time Updates Integration

### 3.1 Supabase Subscription Hook
```typescript
// src/hooks/useSpaceRealtime.ts
export function useSpaceRealtime(companyId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const subscription = supabase
      .channel('spaces')
      .on('INSERT', (payload) => {
        queryClient.invalidateQueries(['spaces', companyId])
      })
      .on('UPDATE', (payload) => {
        queryClient.invalidateQueries(['spaces', companyId])
        queryClient.invalidateQueries(['space', payload.new.id])
      })
      .on('DELETE', (payload) => {
        queryClient.invalidateQueries(['spaces', companyId])
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [companyId])
}
```

## 4. Implementation Order

1. Set up QueryClientProvider in app layout
2. Create basic query hooks
3. Update Floor Plan component to use queries
4. Add mutation hooks
5. Implement real-time updates
6. Add error boundaries and loading states
7. Fine-tune caching and invalidation

## 5. Required Component Updates

### 5.1 Floor Plan Component
- Remove static props
- Use useSpaces hook
- Add loading state
- Add error handling

### 5.2 Room Dialog
- Use useSpace hook for single space data
- Use mutation hooks for updates
- Add optimistic updates

## 6. Performance Optimization

### 6.1 Caching Strategy
- Set appropriate staleTime per query
- Configure cache invalidation rules
- Implement prefetching where needed

### 6.2 Error Handling
- Add retry configuration
- Implement error boundaries
- Add toast notifications for mutations

## 7. Testing Strategy

1. Unit test query hooks
2. Test real-time update integration
3. Test error scenarios
4. Test loading states
5. Test cache invalidation

## Next Steps

1. Switch to code mode to implement QueryClientProvider
2. Create basic query hooks
3. Update Floor Plan component
4. Test the implementation