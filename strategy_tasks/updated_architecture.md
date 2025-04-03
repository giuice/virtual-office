# Updated Architecture with React Query & Zustand

## Original SpaceContext Responsibilities vs New Solution

### 1. Data Fetching & Caching
- ~~SpaceContext~~ → **React Query**
```typescript
// Instead of SpaceContext.tsx:
const { data: spaces, isLoading } = useQuery({
  queryKey: ['spaces', companyId],
  queryFn: () => spaceRepository.findByCompany(companyId)
});
```

### 2. UI State Management
- ~~SpaceContext~~ → **Zustand**
```typescript
// Instead of SpaceContext state:
const useSpaceStore = create<SpaceStore>((set) => ({
  selectedSpace: null,
  filters: {},
  setSelectedSpace: (space) => set({ selectedSpace: space }),
  setFilters: (filters) => set({ filters })
}));
```

### 3. Real-time Updates
- ~~SpaceContext~~ → **React Query + Supabase**
```typescript
// In a custom hook:
export function useSpaceRealtime() {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const subscription = supabase
      .channel('spaces')
      .on('*', (payload) => {
        queryClient.invalidateQueries(['spaces']);
      })
      .subscribe();
      
    return () => {
      subscription.unsubscribe();
    };
  }, []);
}
```

## New Architecture Benefits

1. **Separation of Concerns**
   - React Query: Server state
   - Zustand: UI state
   - No need for complex context provider

2. **Better Performance**
   - Automatic caching
   - Optimized re-renders
   - Built-in request deduplication

3. **Simpler Code**
   - Less boilerplate
   - More maintainable
   - Better TypeScript integration

## Implementation Plan

1. Install and setup React Query
2. Create space queries and mutations
3. Add Zustand for UI state
4. Modify Floor Plan component to use new hooks
5. Implement real-time updates

## Example Implementation

```typescript
// src/hooks/useSpaces.ts
export function useSpaces(companyId: string) {
  return useQuery({
    queryKey: ['spaces', companyId],
    queryFn: () => spaceRepository.findByCompany(companyId)
  });
}

// src/stores/spaceStore.ts
export const useSpaceStore = create<SpaceStore>((set) => ({
  selectedSpace: null,
  setSelectedSpace: (space) => set({ selectedSpace: space })
}));

// src/components/floor-plan/index.tsx
export function FloorPlan({ companyId }: { companyId: string }) {
  const { data: spaces, isLoading } = useSpaces(companyId);
  const { selectedSpace, setSelectedSpace } = useSpaceStore();
  
  if (isLoading) return <LoadingState />;
  
  return (
    // Existing JSX using spaces and selectedSpace
  );
}
```

## Conclusion

With React Query and Zustand, we no longer need a SpaceContext provider. The combination of these libraries provides a more robust and maintainable solution with better performance characteristics and less code.