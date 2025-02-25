// src/components/search/global-search.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Search as SearchIcon, X, MessageSquare, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { userStatusColors, User } from '@/components/floor-plan/types';
import { useSearch } from '@/contexts/SearchContext';
import { MessageDialog } from '@/components/floor-plan/message-dialog';

export function GlobalSearch() {
  const { 
    searchQuery, 
    searchResults, 
    isSearching, 
    setSearchQuery, 
    clearSearch 
  } = useSearch();
  
  const [showResults, setShowResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle outside click to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current && 
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus input when search is opened
  useEffect(() => {
    if (showResults && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showResults]);

  const handleFocus = () => {
    setShowResults(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowResults(false);
  };

  const handleMessageUser = (user: User) => {
    setSelectedUser(user);
    setIsMessageDialogOpen(true);
    setShowResults(false);
  };

  // Helper function to get status label
  const getStatusLabel = (status: User['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'away': return 'Away';
      case 'presenting': return 'Presenting';
      case 'viewing': return 'In a meeting';
      default: return 'Offline';
    }
  };

  // Helper function to get status color
  const getStatusColor = (status: User['status']) => {
    return userStatusColors[status] || userStatusColors.default;
  };
  
  return (
    <div className="relative" ref={searchContainerRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleFocus}
          className="pl-10 pr-10"
        />
        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        {searchQuery && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-0 top-0 h-full rounded-l-none" 
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="absolute mt-1 w-full bg-white rounded-md border shadow-lg z-50">
          <div className="p-2 border-b">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Search Results</span>
              {isSearching && (
                <span className="text-xs text-muted-foreground">
                  {searchResults.length} {searchResults.length === 1 ? 'user' : 'users'} found
                </span>
              )}
            </div>
          </div>
          
          {searchResults.length > 0 ? (
            <ScrollArea className="max-h-80">
              <div className="p-2">
                {searchResults.map(user => (
                  <div 
                    key={user.id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md cursor-pointer group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div 
                          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white"
                          style={{ backgroundColor: getStatusColor(user.status) }}
                        />
                      </div>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-gray-500 flex items-center">
                          <Badge 
                            variant="outline" 
                            className="mr-2 h-5 text-xs px-1"
                            style={{ 
                              borderColor: getStatusColor(user.status),
                              color: getStatusColor(user.status)
                            }}
                          >
                            {getStatusLabel(user.status)}
                          </Badge>
                          {user.activity}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleMessageUser(user)}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : isSearching ? (
            <div className="p-8 text-center">
              <UserIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">No users found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              Start typing to search for users
            </div>
          )}
        </div>
      )}

      {/* Message Dialog */}
      <MessageDialog
        user={selectedUser}
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
      />
    </div>
  );
}