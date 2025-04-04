'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group, Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Space, User as GlobalUser } from '@/types/database'; // Use global Space type and User
import { spaceColors } from './types'; // Keep local colors for now
import { RoomTooltip } from './room-tooltip';
import { Plus, Minus, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { KonvaUserAvatar } from './konva-user-avatar'; // Import the new KonvaUserAvatar component
import { UserTooltip } from './user-tooltip';
import { FloorTooltip } from './floor-tooltip';

export type FloorPlanCanvasProps = {
  spaces: Space[]; // Expects global Space[]
  onSpaceSelect: (space: Space) => void; // Expects global Space
  onSpaceDoubleClick?: (space: Space) => void; // Expects global Space
  onSpaceUpdate?: (updatedSpace: Space) => void; // Expects global Space
  isEditable?: boolean;
};

export const FloorPlanCanvas = ({ 
  spaces, 
  onSpaceSelect, 
  onSpaceDoubleClick,
  onSpaceUpdate,
  isEditable = false 
}: FloorPlanCanvasProps) => {
  // State for canvas dimensions and interactions
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 }); // Default width to prevent 0 width error
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { companyUsers } = useCompany(); // Get companyUsers from context
  
  // Add state for user tooltip
  const [hoveredUser, setHoveredUser] = useState<GlobalUser | null>(null);
  const [userTooltipPosition, setUserTooltipPosition] = useState({ x: 0, y: 0 });

  // Grid settings
  const gridSize = 20; // Size of grid cells in pixels
  const gridColor = 'rgba(0, 0, 0, 0.05)';

  // Update stage size on window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth || 800; // Fallback to 800 if offsetWidth is 0
        setStageSize({
          width,
          height: 600
        });
        console.log("Canvas container width:", width);
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
    return spaceColors[type]?.color || spaceColors.default.color;
  };

  const getRoomLightColor = (type: Space['type']) => {
    return spaceColors[type]?.lightColor || spaceColors.default.lightColor;
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
              
              {/* Rooms */}
              {spaces.map((space) => {
                const isSelected = selectedId === space.id;
                const isHovered = hoveredId === space.id;
                const roomColor = getRoomColor(space.type);
                const roomLightColor = getRoomLightColor(space.type);
                
                return (
                  <Group key={space.id}>
                    {/* Room rectangle */}
                    <Rect
                      x={space.position.x}
                      y={space.position.y}
                      width={space.position.width}
                      height={space.position.height}
                      fill={roomLightColor}
                      stroke={roomColor}
                      strokeWidth={isSelected || isHovered ? 3 : 2}
                      cornerRadius={5}
                      shadowColor="rgba(0,0,0,0.2)"
                      shadowBlur={isSelected || isHovered ? 10 : 0}
                      shadowOffset={{ x: 0, y: 2 }}
                      shadowOpacity={0.5}
                      draggable={isEditable}
                      onClick={() => handleSelect(space)}
                      onTap={() => handleSelect(space)}
                      onDblClick={() => onSpaceDoubleClick?.(space)}
                      onDblTap={() => onSpaceDoubleClick?.(space)}
                      onMouseEnter={() => setHoveredId(space.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onDragStart={handleDragStart}
                      onDragEnd={(e) => handleDragEnd(e, space.id)}
                    />
                    
                    {/* Room name */}
                    <Text
                      x={space.position.x + 10}
                      y={space.position.y + 10}
                      text={space.name}
                      fontSize={14}
                      fontFamily="'Inter', sans-serif"
                      fill="hsl(var(--foreground))"
                      width={space.position.width - 20}
                      ellipsis={true}
                    />
                    
                    {/* User count - Use userIds.length */}
                    <Text
                      x={space.position.x + 10} // Corrected typo: + 1 0 -> + 10
                      y={space.position.y + space.position.height - 25}
                      text={`${space.userIds?.length}/${space.capacity} users`} 
                      fontSize={12}
                      fontFamily="'Inter', sans-serif"
                      fill="hsl(var(--muted-foreground))"
                    />

                    {/* User Indicators - Replace circles with KonvaUserAvatar */}
                    {Array.isArray(space.userIds) && space.userIds.map((userId, index) => {
                      const user = companyUsers.find(u => u.id === userId);
                      if (!user) return null; // Skip if user data not found yet

                      // Layout: place avatars in a row near the bottom
                      const avatarSize = 16; // Increase size from 12 to 16
                      const padding = 8;
                      const maxAvatarsPerRow = Math.floor((space.position.width - padding * 2) / (avatarSize * 2 + padding));
                      
                      // Calculate row and column for grid layout
                      const row = Math.floor(index / maxAvatarsPerRow);
                      const col = index % maxAvatarsPerRow;
                      
                      const avatarX = space.position.x + padding + avatarSize + col * (avatarSize * 2 + padding);
                      const avatarY = space.position.y + space.position.height - padding - avatarSize - 30 - (row * (avatarSize * 2 + 4));

                      // Ensure avatars stay within bounds
                      if (avatarX + avatarSize > space.position.x + space.position.width - padding) {
                        return null; // Don't render if it overflows horizontally
                      }

                      return (
                        <KonvaUserAvatar
                          key={userId}
                          user={user}
                          x={avatarX}
                          y={avatarY}
                          size={avatarSize}
                          onClick={(user) => {
                            // Handle click on user avatar if needed
                            console.log('User clicked:', user.displayName);
                          }}
                          onMouseEnter={(e, user) => {
                            // Show tooltip with user info
                            setHoveredUser(user);
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
                            // Hide tooltip
                            setHoveredUser(null);
                          }}
                        />
                      );
                    })}
                    
                    {/* Resize handles (only shown when selected and editable) */}
                    {isSelected && isEditable && (
                      <>
                        {/* Top-left */}
                        <Circle
                          x={space.position.x}
                          y={space.position.y}
                          radius={6}
                          fill="white"
                          stroke={roomColor}
                          strokeWidth={2}
                          draggable
                          onDragStart={handleResizeStart}
                          onDragMove={(e) => handleResize(e, space.id, 'topLeft')}
                          onDragEnd={handleResizeEnd}
                        />
                        
                        {/* Top-right */}
                        <Circle
                          x={space.position.x + space.position.width}
                          y={space.position.y}
                          radius={6}
                          fill="white"
                          stroke={roomColor}
                          strokeWidth={2}
                          draggable
                          onDragStart={handleResizeStart}
                          onDragMove={(e) => handleResize(e, space.id, 'topRight')}
                          onDragEnd={handleResizeEnd}
                        />
                        
                        {/* Bottom-left */}
                        <Circle
                          x={space.position.x}
                          y={space.position.y + space.position.height}
                          radius={6}
                          fill="white"
                          stroke={roomColor}
                          strokeWidth={2}
                          draggable
                          onDragStart={handleResizeStart}
                          onDragMove={(e) => handleResize(e, space.id, 'bottomLeft')}
                          onDragEnd={handleResizeEnd}
                        />
                        
                        {/* Bottom-right */}
                        <Circle
                          x={space.position.x + space.position.width}
                          y={space.position.y + space.position.height}
                          radius={6}
                          fill="white"
                          stroke={roomColor}
                          strokeWidth={2}
                          draggable
                          onDragStart={handleResizeStart}
                          onDragMove={(e) => handleResize(e, space.id, 'bottomRight')}
                          onDragEnd={handleResizeEnd}
                        />
                      </>
                    )}
                  </Group>
                );
              })}
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
