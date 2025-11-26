// src/components/floor-plan/modern/SpaceContextMenu.tsx
'use client';

import React, { useState } from 'react';
import { Space } from '@/types/database';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreVertical,
  DoorOpen,
  MessageSquare,
  Pencil,
  Settings,
  Users,
} from 'lucide-react';

interface SpaceContextMenuProps {
  /** The space this menu is for */
  space: Space;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
  /** Whether the current user is in this space */
  isUserInSpace?: boolean;
  /** Handler for entering the space */
  onEnter?: () => void;
  /** Handler for opening chat in the space */
  onOpenChat?: () => void;
  /** Handler for editing the space (admin only) */
  onEdit?: () => void;
  /** Handler for managing the space (admin only) */
  onManage?: () => void;
  /** Optional class name */
  className?: string;
  /** Button variant */
  variant?: 'default' | 'ghost' | 'outline';
  /** Button size */
  size?: 'default' | 'sm' | 'icon';
}

/**
 * SpaceContextMenu provides a dropdown menu for space actions.
 * Shows different options based on user role (admin vs member).
 * 
 * Actions:
 * - Enter Space (all users)
 * - Open Chat (all users)
 * - Edit Space (admin only)
 * - Manage Space (admin only)
 */
export const SpaceContextMenu: React.FC<SpaceContextMenuProps> = ({
  space,
  isAdmin = false,
  isUserInSpace = false,
  onEnter,
  onOpenChat,
  onEdit,
  onManage,
  className,
  variant = 'ghost',
  size = 'icon',
}) => {
  const [open, setOpen] = useState(false);
  
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          data-avatar-interactive="true"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((prev) => !prev);
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          aria-label={`Actions for ${space.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={5}
        className="z-50"
        data-avatar-interactive="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Enter Space */}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEnter?.();
          }}
          disabled={isUserInSpace}
        >
          <DoorOpen className="h-4 w-4 mr-2" />
          {isUserInSpace ? 'Already Here' : 'Enter Space'}
        </DropdownMenuItem>

        {/* Open Chat */}
        {onOpenChat && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onOpenChat?.();
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Open Chat
          </DropdownMenuItem>
        )}

        {/* Admin-only actions */}
        {isAdmin && (onEdit || onManage) && (
          <>
            <DropdownMenuSeparator />
            
            {onEdit && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Space
              </DropdownMenuItem>
            )}

            {onManage && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onManage?.();
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Space
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* Space info footer */}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>Capacity: {space.capacity}</span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SpaceContextMenu;
