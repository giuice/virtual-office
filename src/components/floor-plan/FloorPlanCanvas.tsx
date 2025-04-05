'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group, Circle, Line } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import Konva from 'konva';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Space, User as GlobalUser, UIUserStatus } from '@/types/database'; // Use global Space type and User
import { spaceColors } from './types'; // Keep local colors for now
import { RoomTooltip } from './room-tooltip';
import { Plus, Minus, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { KonvaUserAvatar } from './konva-user-avatar'; // Import the KonvaUserAvatar component
import { UserTooltip } from './user-tooltip';
import { FloorTooltip } from './floor-tooltip';
import { debugLogger } from '@/utils/debug-logger'; // Import debugLogger

export type FloorPlanCanvasProps = {
  spaces: Space[]; // Expects global Space[]
  onSpaceSelect: (space: Space) => void; // Expects global Space
  onSpaceDoubleClick?: (space: Space) => void; // Expects global Space
  onSpaceUpdate?: (updatedSpace: Space) => void; // Expects global Space
  isEditable?: boolean;
  highlightedSpaceId?: string | null; // Add prop for highlighting a specific space
};

export const FloorPlanCanvas = ({ 
  spaces, 
  onSpaceSelect, 
  onSpaceDoubleClick,
  onSpaceUpdate,
  isEditable = false,
  highlightedSpaceId = null
}: FloorPlanCanvasProps) => {
  // State for canvas dimensions and interactions
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 }); // Default width to prevent 0 width error
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { companyUsers, currentUserProfile } = useCompany(); // Get companyUsers and currentUserProfile from context
  
  // Add state for user tooltip
  const [hoveredUser, setHoveredUser] = useState<{
    id: string;
    name: string;
    status: UIUserStatus; // Explicitly use UIUserStatus for UI
    avatar: string;
  } | null>(null);
  const [userTooltipPosition, setUserTooltipPosition] = useState({ x: 0, y: 0 });

  // Grid settings
  const gridSize = 20; // Size of grid cells in pixels
  const gridColor = 'rgba(0, 0, 0, 0.05)';

  // Fallback color map for Konva (since it doesn't support CSS variables)
  const konvaColorMap = {
    // Main colors
    workspace: { color: '#10b981', lightColor: 'rgba(16, 185, 129, 0.3)' }, // Green
    conference: { color: '#3b82f6', lightColor: 'rgba(59, 130, 246, 0.3)' }, // Blue
    social: { color: '#f59e0b', lightColor: 'rgba(245, 158, 11, 0.3)' }, // Amber
    breakout: { color: '#8b5cf6', lightColor: 'rgba(139, 92, 246, 0.3)' }, // Purple
    private_office: { color: '#ef4444', lightColor: 'rgba(239, 68, 68, 0.3)' }, // Red
    open_space: { color: '#ec4899', lightColor: 'rgba(236, 72, 153, 0.3)' }, // Pink
    lounge: { color: '#14b8a6', lightColor: 'rgba(20, 184, 166, 0.3)' }, // Teal
    lab: { color: '#6366f1', lightColor: 'rgba(99, 102, 241, 0.3)' }, // Indigo
    default: { color: '#6b7280', lightColor: 'rgba(107, 114, 128, 0.3)' }, // Gray
  };

  // Update stage size on window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth || 800; // Fallback to 800 if offsetWidth is 0
        setStageSize({
          width,
          height: 600
        });
        debugLogger.log('FloorPlanCanvas', `Canvas resized: ${width}x600`);
      }
    };

    // Initial size update
    updateSize();
    
    // Add a small delay to ensure the container has been properly rendered
    const timeoutId = setTimeout(updateSize, 100);
    
    // Add resize listener
    window.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Log when spaces are rendered or updated
  useEffect(() => {
    debugLogger.log('FloorPlanCanvas', `Rendering ${spaces.length} spaces`, spaces);
    // Check for any spaces with missing positions or dimensions
    const invalidSpaces = spaces.filter(space => 
      !space.position || 
      typeof space.position.x !== 'number' || 
      typeof space.position.y !== 'number' ||
      typeof space.position.width !== 'number' ||
      typeof space.position.height !== 'number'
    );
    
    if (invalidSpaces.length > 0) {
      debugLogger.warn('FloorPlanCanvas', 'Found spaces with invalid position data:', invalidSpaces);
    }
  }, [spaces]);

  // When highlightedSpaceId changes, update position to center the highlighted space
  useEffect(() => {
    if (highlightedSpaceId && stageRef.current) {
      const space = spaces.find(s => s.id === highlightedSpaceId);
      if (space && space.position) {
        // Log that we're highlighting the space
        debugLogger.log('FloorPlanCanvas', `Highlighting space ${highlightedSpaceId}`);
      }
    }
  }, [highlightedSpaceId, spaces]);

  // Handle room selection
  const handleSelect = (space: Space) => {
    if (isDragging || isResizing) return;
    setSelectedId(space.id);
    onSpaceSelect(space);
  };

  // Snap position to grid
  const snapToGrid = (position: number): number => {
    return Math.round(position / gridSize) * gridSize;
  };

  // Handle room dragging
  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>, spaceId: string) => {
    setIsDragging(false);
    
    if (!isEditable) return;
    
    // Get the current transform scale to adjust for zoom level
    const stage = e.target.getStage();
    const transform = stage?.getAbsoluteTransform().copy();
    
    // Get the actual position in the original coordinate system
    const pos = {
      x: e.target.x(),
      y: e.target.y()
    };
    
    // Snap to grid
    const x = snapToGrid(pos.x);
    const y = snapToGrid(pos.y);
    
    const updatedSpaces = spaces.map(space => {
      if (space.id === spaceId) {
        return {
          ...space,
          position: {
            ...space.position,
            x,
            y
          }
        };
      }
      return space;
    });
    
    const updatedSpace = updatedSpaces.find(space => space.id === spaceId);
    if (updatedSpace && onSpaceUpdate) {
      onSpaceUpdate(updatedSpace);
    }
  };

  // Handle resize
  const handleResizeStart = () => {
    setIsResizing(true);
  };

  const handleResize = (e: KonvaEventObject<DragEvent>, spaceId: string, corner: string) => {
    if (!isEditable) return;
    
    // Get the current position of the resize handle
    const pos = {
      x: e.target.x(),
      y: e.target.y()
    };
    
    const updatedSpaces = spaces.map(space => {
      if (space.id === spaceId) {
        let { x, y, width, height } = space.position;
        const newX = pos.x;
        const newY = pos.y;
        
        // Update dimensions based on which corner is being dragged
        switch (corner) {
          case 'topLeft':
            width = width + (x - newX);
            height = height + (y - newY);
            x = newX;
            y = newY;
            break;
          case 'topRight':
            width = newX - x;
            height = height + (y - newY);
            y = newY;
            break;
          case 'bottomLeft':
            width = width + (x - newX);
            height = newY - y;
            x = newX;
            break;
          case 'bottomRight':
            width = newX - x;
            height = newY - y;
            break;
        }
        
        // Ensure minimum size
        width = Math.max(width, gridSize * 3);
        height = Math.max(height, gridSize * 3);
        
        // Snap to grid
        x = snapToGrid(x);
        y = snapToGrid(y);
        width = snapToGrid(width);
        height = snapToGrid(height);
        
        return {
          ...space,
          position: { x, y, width, height }
        };
      }
      return space;
    });
    
    const updatedSpace = updatedSpaces.find(space => space.id === spaceId);
    if (updatedSpace && onSpaceUpdate) {
      onSpaceUpdate(updatedSpace);
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // Check for collisions between rooms
  const checkCollision = (space1: Space, space2: Space): boolean => {
    return !(
      space1.position.x + space1.position.width < space2.position.x ||
      space1.position.x > space2.position.x + space2.position.width ||
      space1.position.y + space1.position.height < space2.position.y ||
      space1.position.y > space2.position.y + space2.position.height
    );
  };

  // Draw grid lines
  const renderGrid = useCallback(() => {
    const gridLines = [];
    
    // Horizontal lines
    for (let i = 0; i <= stageSize.height; i += gridSize) {
      gridLines.push(
        <Rect
          key={`h-${i}`}
          x={0}
          y={i}
          width={stageSize.width}
          height={1}
          fill={gridColor}
        />
      );
    }
    
    // Vertical lines
    for (let i = 0; i <= stageSize.width; i += gridSize) {
      gridLines.push(
        <Rect
          key={`v-${i}`}
          x={i}
          y={0}
          width={1}
          height={stageSize.height}
          fill={gridColor}
        />
      );
    }
    
    return gridLines;
  }, [stageSize.width, stageSize.height, gridSize]);

  // Get room color based on type
  const getRoomColor = (type: Space['type']) => {
    // Use the direct color values instead of CSS variables
    const colorObj = konvaColorMap[type] || konvaColorMap.default;
    const color = colorObj.color;
    debugLogger.traceSpace('color', `Room type ${type} gets color ${color}`);
    return color;
  };

  // Get a lighter version of the room color for better contrast
  const getRoomLightColor = (type: Space['type']) => {
    // Use the direct color values with proper opacity
    const colorObj = konvaColorMap[type] || konvaColorMap.default;
    return colorObj.lightColor;
  };

  // Function to check if current user is in a space
  const isUserInSpace = (space: Space) => {
    if (!currentUserProfile) return false;
    return space.userIds?.includes(currentUserProfile.id) || false;
  };

  // Render the space layer
  const renderSpaces = () => {
    return spaces.map((space) => {
      // Debugging info
      debugLogger.traceSpace('render', `Rendering space ${space.id}: ${space.name}`);
      debugLogger.traceSpace('users', `Space has ${space.userIds?.length || 0} users`);
      
      const isSelected = selectedId === space.id;
      const position = space.position;
      const spaceColor = getRoomColor(space.type);
      const spaceLightColor = getRoomLightColor(space.type);
      
      // Map userIds to actual user objects with proper type safety
      const spaceUsers = (space.userIds || [])
        .map(userId => companyUsers.find(u => u.id === userId))
        .filter((user): user is GlobalUser => !!user); // Type guard to ensure users are defined
      
      return (
        <Group
          key={space.id}
          x={position.x}
          y={position.y}
          draggable={isEditable}
          onDragStart={handleDragStart}
          onDragEnd={(e) => handleDragEnd(e, space.id)}
          onClick={() => handleSelect(space)}
          onMouseEnter={() => {
            setHoveredId(space.id);
            debugLogger.traceSpace(space.id, 'Mouse enter');
          }}
          onMouseLeave={() => {
            setHoveredId(null);
            debugLogger.traceSpace(space.id, 'Mouse leave');
          }}
          onDblClick={() => {
            if (onSpaceDoubleClick) {
              onSpaceDoubleClick(space);
              debugLogger.traceSpace(space.id, 'Double click');
            }
          }}
        >
          {/* Background */}
          <Rect
            width={position.width}
            height={position.height}
            cornerRadius={8}
            fill={spaceLightColor}
            stroke={spaceColor}
            strokeWidth={isSelected ? 3 : 2}
            shadowColor="rgba(0, 0, 0, 0.2)"
            shadowBlur={isSelected ? 10 : 0}
            shadowOpacity={0.5}
          />

          {/* Space Name */}
          <Text
            text={space.name}
            fontSize={14}
            fontFamily="Arial"
            fontStyle="bold"
            fill="#333"
            align="center"
            width={position.width}
            padding={5}
            ellipsis
          />

          {/* User count indicator */}
          {(spaceUsers.length > 0) && (
            <Group x={position.width - 30} y={5}>
              <Circle
                radius={12}
                fill="#3b82f6" // Blue
                opacity={0.9}
              />
              <Text
                text={String(spaceUsers.length)}
                fontSize={10}
                fontFamily="Arial"
                fontStyle="bold"
                fill="white"
                align="center"
                verticalAlign="middle"
                width={24}
                height={24}
              />
            </Group>
          )}

          {/* User Avatars */}
          {spaceUsers.length > 0 && (
            <Group y={30}>
              {spaceUsers.map((user, index) => {
                // Debug user avatar rendering
                debugLogger.traceSpace('user', `Rendering user ${user.displayName} in space ${space.name}`);
                
                // Limit users displayed and space them evenly
                const maxDisplayUsers = Math.floor(position.width / 25);
                if (index >= maxDisplayUsers) return null;
                
                // Calculate positions to evenly space avatars
                const spacing = position.width / (Math.min(spaceUsers.length, maxDisplayUsers) + 1);
                const xPos = spacing * (index + 1);
                
                // Convert database UserStatus to UIUserStatus for tooltips
                const getUserUIStatus = (dbStatus: string): UIUserStatus => {
                  switch (dbStatus) {
                    case 'online': return 'active';
                    case 'away': return 'away';
                    case 'busy': return 'presenting';
                    default: return 'viewing';
                  }
                };
                
                return (
                  <KonvaUserAvatar
                    key={user.id}
                    user={user}
                    x={xPos}
                    y={20}
                    size={16}
                    onClick={() => onSpaceSelect?.(space)}
                    onMouseEnter={(e, _) => {
                      setHoveredUser({
                        id: user.id,
                        name: user.displayName,
                        status: getUserUIStatus(user.status),
                        avatar: user.avatarUrl || ''
                      });
                      const stage = e.target.getStage();
                      if (stage) {
                        const pointerPosition = stage.getPointerPosition();
                        if (pointerPosition) {
                          setUserTooltipPosition({
                            x: pointerPosition.x,
                            y: pointerPosition.y
                          });
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredUser(null);
                    }}
                  />
                );
              })}
            </Group>
          )}
        </Group>
      );
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <Button 
          variant="outline" 
          size="icon" 
          className="bg-background/80 backdrop-blur-sm"
          onClick={() => {
            if (stageRef.current) {
              stageRef.current.zoomIn();
            }
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          className="bg-background/80 backdrop-blur-sm"
          onClick={() => {
            if (stageRef.current) {
              stageRef.current.zoomOut();
            }
          }}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          className="bg-background/80 backdrop-blur-sm"
          onClick={() => {
            if (stageRef.current) {
              stageRef.current.resetTransform();
            }
          }}
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <TransformWrapper
        ref={stageRef}
        initialScale={1}
        minScale={0.5}
        maxScale={2}
        wheel={{ step: 0.1 }}
        centerOnInit={true}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '600px' }}
          contentStyle={{ width: '100%', height: '600px' }}
        >
          <Stage 
            width={stageSize.width} 
            height={stageSize.height}
            onClick={(e) => {
              // Deselect when clicking on empty space
              if (e.target === e.currentTarget) {
                setSelectedId(null);
              }
            }}
          >
            <Layer>
              {/* Grid */}
              {renderGrid()}
              
              {/* Spaces (Rooms) */}
              {renderSpaces()}
            </Layer>
          </Stage>
        </TransformComponent>
      </TransformWrapper>
      
      {/* User tooltip */}
      {hoveredUser && <FloorTooltip 
        content={{ type: 'user', data: hoveredUser }} 
        position={userTooltipPosition}
      />}
    </div>
  );
};
