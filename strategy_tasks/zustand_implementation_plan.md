# Zustand Implementation Plan

## 1. Initial Setup

### 1.1 Dependencies
```bash
npm install zustand
```

## 2. Space Store Implementation

### 2.1 Basic Store Setup
```typescript
// src/stores/spaceStore.ts
import { create } from 'zustand'

interface SpaceStore {
  selectedSpace: Space | null
  filters: SpaceFilters
  setSelectedSpace: (space: Space | null) => void
  setFilters: (filters: Partial<SpaceFilters>) => void
  resetFilters: () => void
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  selectedSpace: null,
  filters: {
    status: 'all',
    type: 'all',
    search: ''
  },
  setSelectedSpace: (space) => set({ selectedSpace: space }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),
  resetFilters: () => set({
    filters: {
      status: 'all',
      type: 'all',
      search: ''
    }
  })
}))
```

### 2.2 Additional Store Features
```typescript
// Extended store functionality
interface SpaceStore {
  // ... existing interface
  view: 'grid' | 'list'
  sortBy: 'name' | 'createdAt' | 'status'
  setView: (view: 'grid' | 'list') => void
  setSortBy: (sortBy: 'name' | 'createdAt' | 'status') => void
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  // ... existing store
  view: 'grid',
  sortBy: 'name',
  setView: (view) => set({ view }),
  setSortBy: (sortBy) => set({ sortBy })
}))
```

## 3. Integration with React Query

### 3.1 Combined Usage Example
```typescript
// src/components/floor-plan/index.tsx
export function FloorPlan({ companyId }: { companyId: string }) {
  const { data: spaces, isLoading } = useSpaces(companyId)
  const { selectedSpace, filters, view } = useSpaceStore()
  
  // Filter spaces based on store filters
  const filteredSpaces = useMemo(() => {
    if (!spaces) return []
    return filterSpaces(spaces, filters)
  }, [spaces, filters])

  return (
    // Component JSX
  )
}
```

## 4. Additional Stores

### 4.1 UI Preferences Store
```typescript
// src/stores/uiStore.ts
interface UIStore {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  theme: 'light',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme })
}))
```

## 5. Implementation Order

1. Install Zustand dependency
2. Create core space store
3. Create UI preferences store
4. Update Floor Plan component to use both React Query and Zustand
5. Add persistence if needed
6. Implement devtools integration

## 6. Component Updates

### 6.1 Floor Plan Component
- Replace local state with Zustand store
- Integrate with existing React Query data
- Add filters and view controls

### 6.2 Room Dialog
- Use selectedSpace from store
- Keep form state local (use React Hook Form)
- Update store on successful mutations

## 7. Best Practices

1. Keep stores focused and minimal
2. Use multiple small stores instead of one large store
3. Implement proper TypeScript types
4. Add middleware only when necessary
5. Consider using slices for complex stores

## 8. Performance Considerations

1. Use selective subscriptions
2. Implement proper memoization
3. Split stores by domain
4. Use shallow equality checks where appropriate

## 9. Testing Strategy

1. Test store creation and initial state
2. Test action handlers
3. Test middleware if added
4. Test store integration in components

## Next Steps

1. Create the space store
2. Update Floor Plan component
3. Create UI preferences store
4. Test the implementation
5. Document any gotchas or learnings