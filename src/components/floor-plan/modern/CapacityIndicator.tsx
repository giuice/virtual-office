import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import { floorPlanTokens } from './designTokens';

interface CapacityIndicatorProps {
  current: number;
  capacity: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CapacityIndicator: React.FC<CapacityIndicatorProps> = ({
  current,
  capacity,
  className,
  size = 'sm'
}) => {
  if (!capacity) {
    return <div className={cn(floorPlanTokens.capacityIndicator.container, className)}>
        <Users className={cn(floorPlanTokens.capacityIndicator.icon.base)} />
        <span>{current}</span>
      </div>;
  }

  const utilizationPercentage = current / capacity * 100;

  let colorClass;
  if (utilizationPercentage < 33) {
    colorClass = floorPlanTokens.capacityIndicator.icon.low;
  } else if (utilizationPercentage < 66) {
    colorClass = floorPlanTokens.capacityIndicator.icon.medium;
  } else {
    colorClass = floorPlanTokens.capacityIndicator.icon.high;
  }

  const iconSize = size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-4' : 'size-5';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';
  return <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(floorPlanTokens.capacityIndicator.container, textSize, className)}>
            <Users className={cn(iconSize, colorClass)} />
            <span>{current}/{capacity}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {utilizationPercentage >= 100 ? 'At full capacity!' : utilizationPercentage >= 75 ? 'Near full capacity' : `${Math.round(utilizationPercentage)}% occupied`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>;
};
