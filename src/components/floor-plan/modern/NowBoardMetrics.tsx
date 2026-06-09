// src/components/floor-plan/modern/NowBoardMetrics.tsx
// Story 3.10: NowBoard Metrics Sub-component - Compact metric display
'use client';

import React from 'react';
import { Users, Video, LayoutGrid, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NowBoardMetricsProps {
  /** Total number of spaces */
  totalSpaces: number;
  /** Number of online users */
  onlineUsers: number;
  /** Number of spaces with active meetings */
  activeMeetings: number;
  /** Number of normal severity beacons */
  normalBeacons: number;
  /** Number of critical severity beacons */
  criticalBeacons: number;
  /** Additional CSS classes */
  className?: string;
}

interface MetricItemProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColor?: string;
  highlight?: boolean;
  className?: string;
}

/**
 * Single metric item with icon, label, and value
 */
const MetricItem: React.FC<MetricItemProps> = ({
  icon,
  label,
  value,
  iconColor,
  highlight = false,
  className,
}) => (
  <address
    className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg not-italic',
      'transition-colors duration-200',
      highlight && 'bg-red-500/10',
      className
    )}
    aria-label={`${label}: ${value}`}
  >
    <span className={cn('flex-shrink-0', iconColor)} aria-hidden="true">
      {icon}
    </span>
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground leading-none">{label}</span>
      <span className={cn(
        'text-lg font-semibold leading-tight',
        highlight ? 'text-red-500' : 'text-foreground'
      )}>
        {value}
      </span>
    </div>
  </address>
);

/**
 * NowBoardMetrics - Compact metrics display for NowBoard
 * 
 * Story 3.10 - AC2: Key Metrics Display
 * - Total spaces count
 * - Online users (reuses existing data)
 * - Active meetings (reuses existing data)
 * - Beacon counts with severity breakdown
 * - Compact format with icons
 */
export const NowBoardMetrics: React.FC<NowBoardMetricsProps> = ({
  totalSpaces,
  onlineUsers,
  activeMeetings,
  normalBeacons,
  criticalBeacons,
  className,
}) => {
  const totalBeacons = normalBeacons + criticalBeacons;
  const hasBeacons = totalBeacons > 0;
  const hasCritical = criticalBeacons > 0;

  // Build aria summary for screen readers
  const summaryText = `Office pulse: ${totalSpaces} spaces, ${onlineUsers} online, ${activeMeetings} in meetings, ${totalBeacons} beacons${hasCritical ? ` including ${criticalBeacons} critical` : ''}`;

  return (
    <address
      className={cn(
        'flex items-center gap-1 flex-wrap not-italic',
        className
      )}
      aria-label={summaryText}
    >
      {/* Spaces count */}
      <MetricItem
        icon={<LayoutGrid className="size-4" />}
        label="Spaces"
        value={totalSpaces}
        iconColor="text-blue-500"
      />

      {/* Online users */}
      <MetricItem
        icon={<Users className="size-4" />}
        label="Online"
        value={onlineUsers}
        iconColor="text-green-500"
      />

      {/* Active meetings */}
      <MetricItem
        icon={<Video className="size-4" />}
        label="Meetings"
        value={activeMeetings}
        iconColor="text-purple-500"
      />

      {/* Beacons - only show if there are any */}
      {hasBeacons && (
        <MetricItem
          icon={<AlertCircle className="size-4" />}
          label="Beacons"
          value={totalBeacons}
          iconColor={hasCritical ? 'text-red-500' : 'text-amber-500'}
          highlight={hasCritical}
        />
      )}

      {/* Screen reader only summary */}
      <span className="sr-only">{summaryText}</span>
    </address>
  );
};

export default NowBoardMetrics;
