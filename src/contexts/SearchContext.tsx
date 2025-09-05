// src/contexts/SearchContext.tsx
'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import { UserPresenceData as User } from '@/types/database';
import { usePresence } from './PresenceContext'; 

interface SearchContextType {
  searchQuery: string;
  searchResults: User[] | undefined;
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: User[]) => void;
  clearSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);


export function SearchProvider({ children }: { children: React.ReactNode }) {
  const { users } = usePresence(); // To get real-time user presence data
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[] | undefined>([]);
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
  
      const filteredUsers = users?.filter(user => 
        user.displayName.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
        user.status?.toLowerCase().includes(trimmedQuery.toLowerCase())
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
