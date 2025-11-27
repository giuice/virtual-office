// src/components/floor-plan/modern/ActivityLogPreview.tsx
// Story 3.11 - AC4: Activity Log Preview
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { 
  AlertTriangle, 
  CheckCircle, 
  FileText, 
  AlertOctagon, 
  LogIn, 
  LogOut,
  ChevronRight
} from 'lucide-react';

/**
 * Story 3.11 - AC4: Activity Log Entry Type
 */
export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  author: string;
  authorId: string;
  summary: string;
  type: 'decision' | 'action' | 'note' | 'blocker' | 'join' | 'leave';
}

/**
 * Story 3.11 - AC4: Activity Log Preview
 * - Shows last 3-5 activity log entries for the space
 * - Each entry: timestamp, author, summary chip
 * - Uses monospace font (JetBrains Mono / font-mono) per UX spec
 * - Links to full activity log panel if available
 */
export interface ActivityLogPreviewProps {
  entries: ActivityLogEntry[];
  maxEntries?: number;
  onViewAll?: () => void;
  className?: string;
}

/**
 * Get icon for entry type
 */
const EntryTypeIcon: React.FC<{ type: ActivityLogEntry['type']; className?: string }> = ({ 
  type, 
  className 
}) => {
  const iconClass = cn('w-3 h-3', className);
  
  switch (type) {
    case 'decision':
      return <CheckCircle className={cn(iconClass, 'text-[var(--vo-signal-success)]')} />;
    case 'action':
      return <CheckCircle className={cn(iconClass, 'text-[var(--vo-accent)]')} />;
    case 'note':
      return <FileText className={cn(iconClass, 'text-muted-foreground')} />;
    case 'blocker':
      return <AlertOctagon className={cn(iconClass, 'text-[var(--vo-signal-critical)]')} />;
    case 'join':
      return <LogIn className={cn(iconClass, 'text-[var(--vo-signal-success)]')} />;
    case 'leave':
      return <LogOut className={cn(iconClass, 'text-muted-foreground')} />;
    default:
      return <AlertTriangle className={cn(iconClass, 'text-muted-foreground')} />;
  }
};

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Get type label for accessibility
 */
function getTypeLabel(type: ActivityLogEntry['type']): string {
  switch (type) {
    case 'decision': return 'Decision';
    case 'action': return 'Action item';
    case 'note': return 'Note';
    case 'blocker': return 'Blocker';
    case 'join': return 'Joined';
    case 'leave': return 'Left';
    default: return 'Activity';
  }
}

export const ActivityLogPreview: React.FC<ActivityLogPreviewProps> = ({
  entries,
  maxEntries = 5,
  onViewAll,
  className,
}) => {
  // Limit entries to maxEntries
  const visibleEntries = entries.slice(0, maxEntries);
  const hasMore = entries.length > maxEntries;

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          Activity Log
        </span>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className={cn(
              'text-[10px] text-[var(--vo-accent)] hover:underline',
              'flex items-center gap-0.5'
            )}
          >
            View All
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Log entries */}
      <div 
        className={cn(
          'flex flex-col gap-1 p-2 rounded-lg',
          'bg-[var(--vo-log-bg)]'
        )}
      >
        {visibleEntries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-2 text-[10px]"
            aria-label={`${getTypeLabel(entry.type)} by ${entry.author}: ${entry.summary}`}
          >
            {/* Type icon */}
            <EntryTypeIcon type={entry.type} className="mt-0.5 flex-shrink-0" />
            
            {/* Timestamp - monospace font per AC4 */}
            <span className="font-mono text-muted-foreground flex-shrink-0 w-10">
              {formatTimestamp(entry.timestamp)}
            </span>
            
            {/* Author */}
            <span className="font-medium text-foreground flex-shrink-0 max-w-[60px] truncate">
              {entry.author}
            </span>
            
            {/* Summary chip */}
            <span className="font-mono text-muted-foreground truncate flex-1">
              {entry.summary}
            </span>
          </div>
        ))}
        
        {/* More indicator */}
        {hasMore && !onViewAll && (
          <div className="text-[10px] text-muted-foreground text-center pt-1">
            +{entries.length - maxEntries} more entries
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogPreview;
