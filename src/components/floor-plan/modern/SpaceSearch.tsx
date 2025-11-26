// src/components/floor-plan/modern/SpaceSearch.tsx
// Story 3.10: Enhanced search input with clear button
'use client';

import React, { useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpaceSearchProps {
  /** Current search value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Clear handler */
  onClear: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SpaceSearch - Enhanced search input with clear button
 * 
 * Story 3.10 - AC5: Space Search Input
 * - Relocates search from controls bar to NowBoard
 * - Includes clear button (X) when text is present
 * - Glass-morphism styling consistent with NowBoard
 * - Accessible with proper aria labels
 */
export const SpaceSearch: React.FC<SpaceSearchProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search spaces...',
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onClear();
    // Focus back to input after clearing
    inputRef.current?.focus();
  }, [onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Clear on Escape key
    if (e.key === 'Escape' && value) {
      e.preventDefault();
      handleClear();
    }
  }, [value, handleClear]);

  return (
    <div 
      className={cn(
        'relative flex items-center',
        className
      )}
    >
      {/* Search icon */}
      <Search 
        data-testid="search-icon"
        className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search spaces"
        className={cn(
          'w-full h-9 pl-9 pr-9',
          'rounded-lg border',
          'text-sm',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          // Glass-morphism styling
          'bg-[var(--vo-glass-bg)]',
          'border-[var(--vo-glass-border)]',
          'text-[var(--vo-text-primary)]',
          'placeholder:text-[var(--vo-text-muted)]',
          'focus:ring-[var(--vo-accent)]',
          'focus:border-[var(--vo-accent)]',
          // Backdrop blur for glass effect
          'backdrop-blur-sm',
        )}
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />
      
      {/* Clear button - shown when there's text */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className={cn(
            'absolute right-2',
            'h-5 w-5 rounded-full',
            'flex items-center justify-center',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-[var(--vo-hover-bg)]',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--vo-accent)]',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default SpaceSearch;
