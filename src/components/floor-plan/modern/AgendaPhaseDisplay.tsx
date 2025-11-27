// src/components/floor-plan/modern/AgendaPhaseDisplay.tsx
// Story 3.11 - AC3: Agenda Phase Display
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ListChecks } from 'lucide-react';

/**
 * Story 3.11 - AC3: Agenda Phase Display
 * - Shows current meeting phase/agenda item if available
 * - Phase tracker pill showing progress (e.g., "Phase 2 of 4")
 * - Phase name and description visible
 * - Gracefully handles absence of agenda data
 */
export interface AgendaPhaseDisplayProps {
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
  phaseDescription?: string;
  className?: string;
}

export const AgendaPhaseDisplay: React.FC<AgendaPhaseDisplayProps> = ({
  currentPhase,
  totalPhases,
  phaseName,
  phaseDescription,
  className,
}) => {
  // Validate inputs
  if (totalPhases <= 0 || currentPhase < 1) {
    return null;
  }

  // Calculate progress percentage
  const progressPercent = Math.min((currentPhase / totalPhases) * 100, 100);

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 p-2 rounded-lg',
        'bg-[var(--vo-log-bg)]',
        className
      )}
      role="status"
      aria-label={`Meeting phase: ${phaseName}, ${currentPhase} of ${totalPhases}`}
    >
      {/* Header with icon and phase tracker pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ListChecks className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Agenda
          </span>
        </div>
        
        {/* Phase tracker pill */}
        <div 
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-medium',
            'bg-[var(--vo-pill-bg)] text-[var(--vo-pill-text)]',
            'border border-[var(--vo-pill-border)]'
          )}
        >
          Phase {currentPhase} of {totalPhases}
        </div>
      </div>

      {/* Phase name */}
      <div className="text-xs font-medium text-foreground">
        {phaseName}
      </div>

      {/* Phase description (optional) */}
      {phaseDescription && (
        <div className="text-[10px] text-muted-foreground line-clamp-2">
          {phaseDescription}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 w-full bg-[var(--vo-border-subtle)] rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500 rounded-full"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: 'var(--vo-accent)',
          }}
          role="progressbar"
          aria-valuenow={currentPhase}
          aria-valuemin={1}
          aria-valuemax={totalPhases}
        />
      </div>
    </div>
  );
};

export default AgendaPhaseDisplay;
