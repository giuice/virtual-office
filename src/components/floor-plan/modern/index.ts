// src/components/floor-plan/modern/index.ts
// Export all modern floor plan components

export { default as ModernFloorPlan } from './ModernFloorPlan';
export type { FloorPlanPerspective } from './ModernFloorPlan';
export { default as ModernSpaceCard } from './ModernSpaceCard';
export type { SpaceCardVariant } from './ModernSpaceCard';
export { default as ModernUserAvatar } from './ModernUserAvatar';
export { default as AvatarGroup } from './AvatarGroup';
export { default as AttentionBeacon } from './AttentionBeacon';
export type { AttentionBeaconProps, BeaconSeverity } from './AttentionBeacon';
export { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
export { floorPlanTokens, floorPlanHelpers } from './designTokens';
export { default as SpaceContextMenu } from './SpaceContextMenu';

// Neighborhood components (Story 3.9)
export { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';
export { NeighborhoodFilters } from './NeighborhoodFilters';

// NowBoard components (Story 3.10)
export { NowBoard } from './NowBoard';
export { NowBoardMetrics } from './NowBoardMetrics';
export { BeaconQueue } from './BeaconQueue';
export { SpaceSearch } from './SpaceSearch';
