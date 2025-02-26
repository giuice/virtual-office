// src/components/floor-plan/minimap.tsx
'use client';

import { useState } from 'react';
import { Space, User, spaceColors } from './types';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { MessageDialog } from './message-dialog';
import { Search, X } from 'lucide-react';
import { useSearch } from '@/contexts/SearchContext';

interface MinimapProps {
  spaces: Space[];
  onRoomSelect: (room: Space) => void;
}

export function Minimap({ spaces, onRoomSelect }: MinimapProps) {
  const [hoveredSpace, setHoveredSpace] = useState<Space | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const { searchResults, isSearching, clearSearch } = useSearch();
  
  // Function to handle messaging a user
  const handleMessageUser = (user: User) => {
    setSelectedUser(user);
    setIsMessageDialogOpen(true);
  };
  
  // Function to find a user's space
  const findUserSpace = (userId: number): Space | undefined => {
    return spaces.find(space => 
      space.users.some(user => user.id === userId)
    );
  };
  
  // Function to get color based on room type
  const getSpaceColor = (type: Space['type']) => {
    return spaceColors[type]?.color || spaceColors.default.color;
  };
  
  // Function to get light color based on room type  
  const getSpaceLightColor = (type: Space['type']) => {
    return spaceColors[type]?.lightColor || spaceColors.default.lightColor;
  };

  return (
    <Card className="w-full">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Office Map</CardTitle>
          {isSearching && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearSearch}
              className="h-6 px-2 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Search
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {/* Minimap SVG - Updated background for dark mode */}
        <div className="relative w-full aspect-video bg-secondary rounded-md overflow-hidden border">
          <svg 
            viewBox="0 0 800 600" 
            className="w-full h-full"
            style={{ padding: '4px' }}
          >
            {/* Grid pattern - Updated for dark mode */}
            <pattern
              id="minimap-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.03"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#minimap-grid)" />
            
            {/* Spaces */}
            {spaces.map(space => {
              // Scale factor for minimap
              const scaleFactor = 0.8;
              const x = space.position.x * scaleFactor;
              const y = space.position.y * scaleFactor;
              const width = space.position.width * scaleFactor;
              const height = space.position.height * scaleFactor;
              
              // Check if room contains any highlighted users from search
              const hasHighlightedUsers = isSearching && 
                space.users.some(user => 
                  searchResults.some(result => result.id === user.id)
                );
              
              return (
                <TooltipProvider key={space.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <g 
                        onClick={() => onRoomSelect(space)}
                        onMouseEnter={() => setHoveredSpace(space)}
                        onMouseLeave={() => setHoveredSpace(null)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          rx="2"
                          fill={hasHighlightedUsers ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--card))'}
                          stroke={hasHighlightedUsers ? 'hsl(var(--primary))' : getSpaceColor(space.type)}
                          strokeWidth={hasHighlightedUsers ? "1.5" : "1"}
                          className={`transition-all duration-200 ${
                            hoveredSpace?.id === space.id ? 'opacity-90 stroke-2' : 'opacity-80'
                          }`}
                        />
                        
                        {/* Room name - only show on hover or if it contains search results */}
                        {(hoveredSpace?.id === space.id || hasHighlightedUsers) && (
                          <text
                            x={x + width/2}
                            y={y + 10}
                            textAnchor="middle"
                            className="fill-foreground"
                            fontSize="8"
                            fontWeight="500"
                          >
                            {space.name}
                          </text>
                        )}
                        
                        {/* User indicators */}
                        {space.users.map((user, i) => {
                          // Check if this user is in search results
                          const isHighlighted = isSearching && 
                            searchResults.some(result => result.id === user.id);
                          
                          // Determine position in room
                          const userX = x + 10 + (i % 3) * 15;
                          const userY = y + 25 + Math.floor(i / 3) * 15;
                          
                          return (
                            <g key={user.id}>
                              <circle
                                cx={userX}
                                cy={userY}
                                r={isHighlighted ? 6 : 4}
                                fill={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent triggering room click
                                  handleMessageUser(user);
                                }}
                              />
                              
                              {/* Show user name if highlighted - updated for dark mode */}
                              {isHighlighted && (
                                <>
                                  <rect
                                    x={userX - 30}
                                    y={userY - 15}
                                    width={60}
                                    height={12}
                                    rx={2}
                                    className="fill-background dark:fill-card"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={userX}
                                    y={userY - 6}
                                    textAnchor="middle"
                                    className="fill-foreground"
                                    fontSize="6"
                                    fontWeight="500"
                                  >
                                    {user.name}
                                  </text>
                                </>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="p-2 text-xs">
                      <p className="font-medium">{space.name}</p>
                      <p className="text-muted-foreground">{space.users.length} users</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
            
            {/* Legend - updated for dark mode */}
            <g transform="translate(10, 560)">
              <rect x="0" y="0" width="120" height="30" className="fill-background dark:fill-card opacity-80" rx="4" />
              <text x="5" y="12" fontSize="6" className="fill-foreground" fontWeight="500">Room Types:</text>
              
              {/* Legend items */}
              <rect x="5" y="18" width="8" height="8" fill={getSpaceLightColor('workspace')} stroke={getSpaceColor('workspace')} strokeWidth="0.5" rx="1" />
              <text x="18" y="24" fontSize="6" className="fill-foreground">Workspace</text>
              
              <rect x="65" y="18" width="8" height="8" fill={getSpaceLightColor('conference')} stroke={getSpaceColor('conference')} strokeWidth="0.5" rx="1" />
              <text x="78" y="24" fontSize="6" className="fill-foreground">Conference</text>
            </g>
          </svg>
          
          {/* Search overlay - updated for dark mode */}
          {isSearching && (
            <div className="absolute top-2 left-2 bg-card  px-2 py-1 rounded shadow-sm text-xs flex items-center border">
              <Search className="h-3 w-3 mr-1 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {searchResults.length} user{searchResults.length !== 1 ? 's' : ''} found
              </span>
            </div>
          )}
        </div>
        
        {/* Quick Stats */}
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <div>
            <span className="font-medium">{spaces.length}</span> rooms
          </div>
          <div>
            <span className="font-medium">
              {spaces.reduce((count, space) => count + space.users.length, 0)}
            </span> users online
          </div>
        </div>
      </CardContent>

      {/* Message Dialog */}
      <MessageDialog
        user={selectedUser}
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
      />
    </Card>
  );
}
