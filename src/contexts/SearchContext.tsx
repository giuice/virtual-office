// src/contexts/SearchContext.tsx
'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import { User } from '@/components/floor-plan/types';

interface SearchContextType {
  searchQuery: string;
  searchResults: User[];
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: User[]) => void;
  clearSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

// Mock users data - in a real app, this would come from a database
const mockUsers: User[] = [
  {
    id: 1,
    name: 'John Developer',
    avatar: '/api/placeholder/32/32',
    status: 'active',
    activity: 'Coding in Development Team'
  },
  {
    id: 2,
    name: 'Sarah Coder',
    avatar: '/api/placeholder/32/32',
    status: 'active',
    activity: 'Code review in Development Team'
  },
  {
    id: 3,
    name: 'Mike Engineer',
    avatar: '/api/placeholder/32/32',
    status: 'away',
    activity: 'In meeting in Break Room'
  },
  {
    id: 4,
    name: 'Alice Manager',
    avatar: '/api/placeholder/32/32',
    status: 'presenting',
    activity: 'Sprint review in Main Conference Room'
  },
  {
    id: 5,
    name: 'Bob Analyst',
    avatar: '/api/placeholder/32/32',
    status: 'viewing',
    activity: 'Taking notes in Main Conference Room'
  },
  {
    id: 6,
    name: 'Carol Designer',
    avatar: '/api/placeholder/32/32',
    status: 'away',
    activity: 'Coffee break in Break Room'
  },
  {
    id: 7,
    name: 'Dave Marketing',
    avatar: '/api/placeholder/32/32',
    status: 'active',
    activity: 'Campaign planning in Marketing Team'
  },
  {
    id: 8,
    name: 'Ellen Content',
    avatar: '/api/placeholder/32/32',
    status: 'away',
    activity: 'Meeting with client in Marketing Team'
  }
];

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Function to handle search
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      const trimmedQuery = query.trim();
      setIsSearching(!!trimmedQuery);
      
      if (!trimmedQuery) {
        setSearchResults([]);
        return;
      }
  
      const filteredUsers = mockUsers.filter(user => 
        user.name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
        user.activity.toLowerCase().includes(trimmedQuery.toLowerCase())
      );
  
      setSearchResults(filteredUsers);
    }, 300);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  return (
    <SearchContext.Provider
      value={{
        searchQuery,
        searchResults,
        isSearching,
        setSearchQuery: handleSearch,
        setSearchResults,
        clearSearch
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};
