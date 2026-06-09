import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SpaceType } from '@/types/database';
import { Building, Coffee, Briefcase, Video, Users, Users2, FlaskConical, LayoutGrid } from 'lucide-react';

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

interface SpaceTypeIndicatorProps {
  type: SpaceType;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const SpaceTypeIndicator: React.FC<SpaceTypeIndicatorProps> = ({
  type,
  className,
  size = 'sm',
  showLabel = true
}) => {
  const config = typeConfig[type] || typeConfig.workspace;
  const iconSize = size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-4' : 'size-5';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';
  if (!showLabel) {
    return <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("text-muted-foreground", className)}>
              {React.cloneElement(config.icon, {
              className: iconSize
            })}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>;
  }
  return <div className={cn("flex items-center gap-1 text-muted-foreground", textSize, className)}>
      {React.cloneElement(config.icon, {
      className: iconSize
    })}
      <span>{config.label}</span>
    </div>;
};
