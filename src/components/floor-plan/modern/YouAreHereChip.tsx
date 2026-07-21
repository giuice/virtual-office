'use client';

import { MapPin } from 'lucide-react';

export interface YouAreHereChipProps {
  spaceName?: string;
  onLocate: () => void;
}

export function YouAreHereChip({ spaceName, onLocate }: YouAreHereChipProps) {
  return (
    <button
      type="button"
      className="vo-you-are-here-chip"
      onClick={onLocate}
      aria-label={`Find my space: ${spaceName ?? 'not in a space'}`}
    >
      <span className="vo-you-are-here-pin" aria-hidden="true">
        <MapPin className="size-3.5" />
      </span>
      <small>You are in</small>
      <span>{spaceName ?? '—'}</span>
    </button>
  );
}

export default YouAreHereChip;
