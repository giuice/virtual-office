// src/components/ui/ThemeSwitcher.tsx
'use client';

import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useVOTheme, VOTheme, VO_THEME_METADATA } from '@/hooks/useVOTheme';
import { cn } from '@/lib/utils';

interface ThemePreviewSwatchProps {
  theme: VOTheme;
  isActive?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Color swatch preview for a theme
 */
function ThemePreviewSwatch({ theme, isActive, size = 'sm' }: ThemePreviewSwatchProps) {
  const metadata = VO_THEME_METADATA[theme];
  const sizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div
      className={cn(
        'rounded-full border-2 flex items-center justify-center overflow-hidden',
        sizeClasses,
        isActive ? 'border-[var(--vo-accent)]' : 'border-transparent'
      )}
      style={{ backgroundColor: metadata.previewColors.bg }}
      aria-hidden="true"
    >
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: metadata.previewColors.accent }}
      />
    </div>
  );
}

interface ThemeSwitcherProps {
  /** Alignment of the dropdown */
  align?: 'start' | 'center' | 'end';
  /** Side of the trigger the dropdown appears */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Custom trigger content (defaults to icon button) */
  trigger?: React.ReactNode;
  /** Additional class names for the trigger */
  triggerClassName?: string;
  /** Show theme labels in dropdown */
  showLabels?: boolean;
  /** Compact mode - icons only */
  compact?: boolean;
}

/**
 * Theme switcher dropdown component.
 * Allows users to select from available Virtual Office themes.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <ThemeSwitcher />
 * 
 * // Custom alignment
 * <ThemeSwitcher align="end" side="bottom" />
 * 
 * // Compact mode for toolbars
 * <ThemeSwitcher compact />
 * ```
 */
export function ThemeSwitcher({
  align = 'end',
  side = 'bottom',
  trigger,
  triggerClassName,
  showLabels = true,
  compact = false,
}: ThemeSwitcherProps) {
  const { theme, setTheme, themes, themeMetadata, isLoading } = useVOTheme();
  const [open, setOpen] = React.useState(false);

  // Announce theme change to screen readers
  const announceThemeChange = React.useCallback((newTheme: VOTheme) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = `Theme changed to ${VO_THEME_METADATA[newTheme].label}`;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
  }, []);

  const handleThemeSelect = React.useCallback(
    (newTheme: VOTheme) => {
      setTheme(newTheme);
      announceThemeChange(newTheme);
      setOpen(false);
    },
    [setTheme, announceThemeChange]
  );

  // Handle keyboard navigation for theme selection
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent, themeValue: VOTheme) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleThemeSelect(themeValue);
      }
    },
    [handleThemeSelect]
  );

  const defaultTrigger = (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      className={cn(
        'gap-2',
        triggerClassName
      )}
      aria-label={`Current theme: ${themeMetadata.label}. Click to change theme.`}
      disabled={isLoading}
    >
      <ThemePreviewSwatch theme={theme} size={compact ? 'sm' : 'md'} />
      {!compact && <span className="hidden sm:inline">{themeMetadata.label}</span>}
      <span className="sr-only">Open theme menu</span>
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild data-avatar-interactive>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        className="w-56"
        data-avatar-interactive
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Reality Distortion
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themes.map((themeOption) => {
          const metadata = VO_THEME_METADATA[themeOption];
          const isActive = theme === themeOption;

          return (
            <DropdownMenuItem
              key={themeOption}
              onClick={(e) => {
                e.stopPropagation();
                handleThemeSelect(themeOption);
              }}
              onKeyDown={(e) => handleKeyDown(e, themeOption)}
              onSelect={(e) => e.preventDefault()}
              className={cn(
                'flex items-center gap-3 cursor-pointer',
                isActive && 'bg-accent/50'
              )}
              aria-selected={isActive}
              role="option"
            >
              <ThemePreviewSwatch theme={themeOption} isActive={isActive} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className={cn('font-medium', isActive && 'text-[var(--vo-accent)]')}>
                  {metadata.label}
                </span>
                {showLabels && (
                  <span className="text-xs text-muted-foreground truncate">
                    {metadata.description}
                  </span>
                )}
              </div>
              {isActive && (
                <CheckIcon className="w-4 h-4 text-[var(--vo-accent)]" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Simple check icon */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Inline theme palette selector.
 * Alternative UI for theme selection, shows all themes as clickable swatches.
 */
export function ThemePalette({ className }: { className?: string }) {
  const { theme, setTheme, themes } = useVOTheme();

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="radiogroup"
      aria-label="Select theme"
    >
      {themes.map((themeOption) => {
        const metadata = VO_THEME_METADATA[themeOption];
        const isActive = theme === themeOption;

        return (
          <button
            key={themeOption}
            onClick={() => setTheme(themeOption)}
            className={cn(
              'relative w-8 h-8 rounded-full transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--vo-accent)]',
              isActive ? 'ring-2 ring-[var(--vo-accent)] scale-110' : 'hover:scale-105'
            )}
            style={{ backgroundColor: metadata.previewColors.bg }}
            role="radio"
            aria-checked={isActive}
            aria-label={`${metadata.label} theme`}
            title={metadata.label}
          >
            <span
              className="absolute inset-1 rounded-full"
              style={{ backgroundColor: metadata.previewColors.accent, opacity: 0.3 }}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

export default ThemeSwitcher;
