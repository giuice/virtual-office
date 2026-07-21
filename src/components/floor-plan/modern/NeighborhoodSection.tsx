'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Neighborhood, Space } from '@/types/database';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  headingId: string;
  index: number;
  name: string;
  eyebrow?: string;
  peopleCount: number;
  spaceCount: number;
  capacity: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

function SectionHeader({
  headingId,
  index,
  name,
  eyebrow,
  peopleCount,
  spaceCount,
  capacity,
  isCollapsed,
  onToggleCollapsed,
}: SectionHeaderProps) {
  const occupancyPercent = capacity > 0
    ? Math.min(100, Math.round((peopleCount / capacity) * 100))
    : 0;
  const peopleLabel = peopleCount === 1 ? 'person' : 'people';

  return (
    <header className="vo-neighborhood-header">
      <span className="vo-neighborhood-number" aria-hidden="true">
        {String(index).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        {eyebrow ? <p className="vo-neighborhood-eyebrow">{eyebrow}</p> : null}
        <h2 id={headingId} className="vo-neighborhood-name font-display">
          {name}
        </h2>
      </div>
      <p className="vo-neighborhood-stat">
        <strong>{peopleCount}</strong>
        <span>{peopleLabel} · {spaceCount} spaces</span>
      </p>
      <button
        type="button"
        className="vo-neighborhood-collapse"
        onClick={onToggleCollapsed}
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${name}`}
      >
        <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
      </button>
      <div
        className="vo-neighborhood-occupancy"
        title={`${occupancyPercent}% of capacity in use`}
        aria-hidden="true"
      >
        <span style={{ width: `${occupancyPercent}%` }} />
      </div>
    </header>
  );
}

export interface NeighborhoodSectionProps {
  neighborhood: Neighborhood;
  spaces: Space[];
  index: number;
  peopleCount: number;
  capacity: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
  className?: string;
}

export function NeighborhoodSection({
  neighborhood,
  spaces,
  index,
  peopleCount,
  capacity,
  isCollapsed,
  onToggleCollapsed,
  children,
  className,
}: NeighborhoodSectionProps) {
  const headingId = `nb-heading-${neighborhood.id}`;
  const code = neighborhood.name.slice(0, 3).toUpperCase();
  const description = neighborhood.description?.trim();
  const eyebrow = description ? `${code} / ${description}` : code;
  const colorStyle = {
    '--nbc': `var(${neighborhood.color})`,
    '--neighborhood-color': `var(${neighborhood.color})`,
  } as CSSProperties;

  return (
    <section
      id={`nb-sec-${neighborhood.id}`}
      className={cn('vo-neighborhood-section', className)}
      aria-labelledby={headingId}
      style={colorStyle}
    >
      <SectionHeader
        headingId={headingId}
        index={index}
        name={neighborhood.name}
        eyebrow={eyebrow}
        peopleCount={peopleCount}
        spaceCount={spaces.length}
        capacity={capacity}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {isCollapsed ? null : children}
    </section>
  );
}

export interface UngroupedSectionProps {
  spaces: Space[];
  index: number;
  peopleCount: number;
  capacity: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
  className?: string;
}

export function UngroupedSection({
  spaces,
  index,
  peopleCount,
  capacity,
  isCollapsed,
  onToggleCollapsed,
  children,
  className,
}: UngroupedSectionProps) {
  if (spaces.length === 0) {
    return null;
  }

  const colorStyle = {
    '--nbc': 'var(--vo-text-dim)',
    '--neighborhood-color': 'var(--vo-text-dim)',
  } as CSSProperties;

  return (
    <section
      id="nb-sec-ungrouped"
      className={cn('vo-neighborhood-section', className)}
      aria-labelledby="nb-heading-ungrouped"
      style={colorStyle}
    >
      <SectionHeader
        headingId="nb-heading-ungrouped"
        index={index}
        name="Other"
        peopleCount={peopleCount}
        spaceCount={spaces.length}
        capacity={capacity}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {isCollapsed ? null : children}
    </section>
  );
}

export default NeighborhoodSection;
