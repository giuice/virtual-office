'use client';

import { cn } from '@/lib/utils';

export interface NowBoardMetricsProps {
  onlineUsers: number;
  activeSpaces: number;
  freeSpaces: number;
  className?: string;
}

interface MetricPillProps {
  value: number;
  label: string;
  live?: boolean;
}

function MetricPill({ value, label, live = false }: MetricPillProps) {
  return (
    <span className="vo-now-board-stat">
      {live ? <span className="vo-now-board-ok-dot" aria-hidden="true" /> : null}
      <strong>{value}</strong> {label}
    </span>
  );
}

export function NowBoardMetrics({
  onlineUsers,
  activeSpaces,
  freeSpaces,
  className,
}: NowBoardMetricsProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label={`${onlineUsers} online, ${activeSpaces} live, ${freeSpaces} free`}
    >
      <MetricPill value={onlineUsers} label="online" live />
      <MetricPill value={activeSpaces} label="live" />
      <MetricPill value={freeSpaces} label="free" />
    </div>
  );
}

export default NowBoardMetrics;
