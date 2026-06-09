// src/lib/neighborhood-colors.ts

/**
 * Available neighborhood color tokens.
 * These map to CSS variables defined in tokens.css
 */
export const NEIGHBORHOOD_COLORS = [
  '--vo-neighborhood-1',
  '--vo-neighborhood-2',
  '--vo-neighborhood-3',
  '--vo-neighborhood-4',
  '--vo-neighborhood-5',
  '--vo-neighborhood-6',
  '--vo-neighborhood-7',
  '--vo-neighborhood-8',
] as const;

export type NeighborhoodColor = typeof NEIGHBORHOOD_COLORS[number];

/**
 * Get a neighborhood color token by index.
 * Wraps around if index exceeds available colors.
 * 
 * @param index Zero-based index
 * @returns CSS variable name for the neighborhood color
 */
function getNeighborhoodColor(index: number): NeighborhoodColor {
  const safeIndex = Math.abs(index) % NEIGHBORHOOD_COLORS.length;
  return NEIGHBORHOOD_COLORS[safeIndex];
}

/**
 * Get all available neighborhood colors.
 * 
 * @returns Array of CSS variable names
 */
export function getAllNeighborhoodColors(): readonly NeighborhoodColor[] {
  return NEIGHBORHOOD_COLORS;
}

/**
 * Get neighborhood colors that are not currently in use.
 * Useful for the color picker to suggest unused colors.
 * 
 * @param usedColors Array of color tokens already in use
 * @returns Array of available (unused) color tokens
 */
export function getAvailableNeighborhoodColors(
  usedColors: string[]
): NeighborhoodColor[] {
  const usedSet = new Set(usedColors);
  return NEIGHBORHOOD_COLORS.filter(color => !usedSet.has(color));
}

/**
 * Get the next available color for a new neighborhood.
 * Prefers unused colors, falls back to least-used pattern.
 * 
 * @param usedColors Array of color tokens already in use
 * @returns Suggested color token for a new neighborhood
 */
export function suggestNeighborhoodColor(usedColors: string[]): NeighborhoodColor {
  const available = getAvailableNeighborhoodColors(usedColors);
  
  if (available.length > 0) {
    return available[0];
  }
  
  // All colors in use - return the one that would create a balanced distribution
  // Count usage of each color
  const counts = new Map<string, number>();
  NEIGHBORHOOD_COLORS.forEach(color => counts.set(color, 0));
  usedColors.forEach(color => {
    if (counts.has(color)) {
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  });
  
  // Find the least used color
  let minCount = Infinity;
  let leastUsed: NeighborhoodColor = NEIGHBORHOOD_COLORS[0];
  counts.forEach((count, color) => {
    if (count < minCount) {
      minCount = count;
      leastUsed = color as NeighborhoodColor;
    }
  });
  
  return leastUsed;
}

/**
 * Resolve a CSS variable to its actual color value.
 * Requires a DOM element to compute the style.
 * 
 * @param colorToken CSS variable name (e.g., '--vo-neighborhood-1')
 * @param element Optional element to compute style from (defaults to document.documentElement)
 * @returns The computed color value (e.g., '#3B82F6')
 */
function resolveNeighborhoodColor(
  colorToken: string,
  element?: HTMLElement
): string {
  if (typeof window === 'undefined') {
    return colorToken; // SSR fallback
  }
  
  const el = element || document.documentElement;
  const computedStyle = getComputedStyle(el);
  return computedStyle.getPropertyValue(colorToken).trim() || colorToken;
}

/**
 * Get a human-readable label for a neighborhood color.
 * 
 * @param colorToken CSS variable name
 * @returns Human-readable color name
 */
export function getNeighborhoodColorLabel(colorToken: string): string {
  const labels: Record<string, string> = {
    '--vo-neighborhood-1': 'Blue',
    '--vo-neighborhood-2': 'Emerald',
    '--vo-neighborhood-3': 'Amber',
    '--vo-neighborhood-4': 'Red',
    '--vo-neighborhood-5': 'Violet',
    '--vo-neighborhood-6': 'Pink',
    '--vo-neighborhood-7': 'Cyan',
    '--vo-neighborhood-8': 'Lime',
  };
  
  return labels[colorToken] || 'Custom';
}
