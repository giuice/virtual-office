// src/components/floor-plan/modern/StatusIndicators.tsx
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SpaceStatus, SpaceType } from '@/types/database';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Users, Lock, Clock, Wrench, 
  CheckCircle2, Building, 
  Coffee, Briefcase, Video, Users2, 
  FlaskConical, LayoutGrid
} from 'lucide-react';
import { floorPlanTokens } from './designTokens';

interface StatusBadgeProps {
  status: SpaceStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Space Status Badge (available, maintenance, locked, etc.)
export const SpaceStatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  showIcon = true,
  size = 'sm'
}) => {
  // Text and icon configurations based on status
  const statusConfig = {
    available: { 
      text: 'Available',
      icon: <CheckCircle2 className="h-3 w-3" />,
      variant: 'online' as const,
    },
    maintenance: { 
      text: 'Maintenance',
      icon: <Wrench className="h-3 w-3" />,
      variant: 'away' as const,
    },
    locked: { 
      text: 'Locked',
      icon: <Lock className="h-3 w-3" />,
      variant: 'busy' as const,
    },
    reserved: { 
      text: 'Reserved',
      icon: <Clock className="h-3 w-3" />,
      variant: 'away' as const,
    },
    in_use: { 
      text: 'In Use',
      icon: <Users className="h-3 w-3" />,
      variant: 'online' as const,
    },
    active: { 
      text: 'Active',
      icon: <Users className="h-3 w-3" />,
      variant: 'online' as const,
    }
  };

  const config = statusConfig[status] || statusConfig.available;

  return (
    <Badge 
      variant={config.variant}
      className={cn(
        floorPlanTokens.statusBadge.base,
        size === 'sm' && "text-xs",
        size === 'md' && "text-sm",
        size === 'lg' && "text-base",
        className
      )}
    >
      {showIcon && (
        <span className="mr-1">{config.icon}</span>
      )}
      {config.text}
    </Badge>
  );
};

interface SpaceTypeIndicatorProps {
  type: SpaceType;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// Space Type Indicator (workspace, conference, social, etc.)
export const SpaceTypeIndicator: React.FC<SpaceTypeIndicatorProps> = ({
  type,
  className,
  size = 'sm',
  showLabel = true
}) => {
  // Icon and label configurations based on space type
  const typeConfig = {
    workspace: {
      icon: <Briefcase />,
      label: 'Workspace'
    },
    conference: {
      icon: <Video />,
      label: 'Conference'
    },
    social: {
      icon: <Users2 />,
      label: 'Social'
    },
    breakout: {
      icon: <Users />,
      label: 'Breakout'
    },
    private_office: {
      icon: <Building />,
      label: 'Private Office'
    },
    open_space: {
      icon: <LayoutGrid />,
      label: 'Open Space'
    },
    lounge: {
      icon: <Coffee />,
      label: 'Lounge'
    },
    lab: {
      icon: <FlaskConical />,
      label: 'Lab'
    }
  };

  const config = typeConfig[type] || typeConfig.workspace;
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';

  if (!showLabel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("text-muted-foreground", className)}>
              {React.cloneElement(config.icon, { className: iconSize })}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 text-muted-foreground", textSize, className)}>
      {React.cloneElement(config.icon, { className: iconSize })}
      <span>{config.label}</span>
    </div>
  );
};

interface CapacityIndicatorProps {
  current: number;
  capacity: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Capacity Indicator (shows current occupancy vs capacity)
export const CapacityIndicator: React.FC<CapacityIndicatorProps> = ({
  current,
  capacity,
  className,
  size = 'sm'
}) => {
  // If capacity is 0 or undefined, show unlimited
  if (!capacity) {
    return (
      <div className={cn(floorPlanTokens.capacityIndicator.container, className)}>
        <Users className={cn(floorPlanTokens.capacityIndicator.icon.base)} />
        <span>{current}</span>
      </div>
    );
  }

  // Calculate utilization percentage
  const utilizationPercentage = (current / capacity) * 100;
  
  // Get color based on utilization
  let colorClass;
  if (utilizationPercentage < 33) {
    colorClass = floorPlanTokens.capacityIndicator.icon.low;
  } else if (utilizationPercentage < 66) {
    colorClass = floorPlanTokens.capacityIndicator.icon.medium;
  } else {
    colorClass = floorPlanTokens.capacityIndicator.icon.high;
  }

  // Size adjustments
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(floorPlanTokens.capacityIndicator.container, textSize, className)}>
            <Users className={cn(iconSize, colorClass)} />
            <span>{current}/{capacity}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {utilizationPercentage >= 100 
              ? 'At full capacity!' 
              : utilizationPercentage >= 75 
              ? 'Near full capacity' 
              : `${Math.round(utilizationPercentage)}% occupied`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
