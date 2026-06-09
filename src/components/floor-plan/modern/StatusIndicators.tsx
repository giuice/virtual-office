// src/components/floor-plan/modern/StatusIndicators.tsx
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SpaceStatus } from '@/types/database';
import { Users, Lock, Clock, Wrench, CheckCircle2 } from 'lucide-react';
import { floorPlanTokens } from './designTokens';

export { SpaceTypeIndicator } from './SpaceTypeIndicator';
export { CapacityIndicator } from './CapacityIndicator';

const statusConfig = {
  available: {
    text: 'Available',
    icon: <CheckCircle2 className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.available
  },
  maintenance: {
    text: 'Maintenance',
    icon: <Wrench className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.maintenance
  },
  locked: {
    text: 'Locked',
    icon: <Lock className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.locked
  },
  reserved: {
    text: 'Reserved',
    icon: <Clock className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.locked
  },
  in_use: {
    text: 'In Use',
    icon: <Users className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.occupied
  },
  active: {
    text: 'Active',
    icon: <Users className="size-3" />,
    classes: floorPlanTokens.statusBadge.colors.occupied
  }
};

interface StatusBadgeProps {
  status: SpaceStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const SpaceStatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  showIcon = true,
  size = 'sm'
}) => {
  const config = statusConfig[status] || statusConfig.available;
  return <Badge variant="outline" className={cn(floorPlanTokens.statusBadge.base, config.classes, size === 'sm' && "text-xs", size === 'md' && "text-sm", size === 'lg' && "text-base", className)}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.text}
    </Badge>;
};
