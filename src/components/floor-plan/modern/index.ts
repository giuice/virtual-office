// src/components/floor-plan/modern/index.ts
// Export all modern floor plan components

export { default as ModernFloorPlan } from './ModernFloorPlan';
export type { FloorPlanDensity } from './ModernFloorPlan';
export { default as ModernSpaceCard } from './ModernSpaceCard';
export { default as ModernUserAvatar } from './ModernUserAvatar';
export { default as AvatarGroup } from './AvatarGroup';
export { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
export { floorPlanTokens } from './designTokens';
export { default as SpaceContextMenu } from './SpaceContextMenu';

// Neighborhood components (Story 3.9)
export { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';
export { NeighborhoodFilters } from './NeighborhoodFilters';
export { NeighborhoodIndexRail } from './NeighborhoodIndexRail';
export type { NeighborhoodIndexRailProps } from './NeighborhoodIndexRail';
export { YouAreHereChip } from './YouAreHereChip';
export type { YouAreHereChipProps } from './YouAreHereChip';

// NowBoard components (Story 3.10)
export { NowBoard } from './NowBoard';
export { isSpaceEnterable } from './NowBoard';
export { NowBoardMetrics } from './NowBoardMetrics';
export { SpaceSearch } from './SpaceSearch';

// SpaceDetailPanel components (Story 3.11)
export { SpaceDetailPanel } from './SpaceDetailPanel';
export type { SpaceDetailPanelProps } from './SpaceDetailPanel';
export { ParticipantRoster } from './ParticipantRoster';
export type { ParticipantRosterProps } from './ParticipantRoster';
export { SpaceActionButtons } from './SpaceActionButtons';
export type { SpaceActionButtonsProps } from './SpaceActionButtons';
export { SpaceDetailBottomSheet } from './SpaceDetailBottomSheet';
export type { SpaceDetailBottomSheetProps } from './SpaceDetailBottomSheet';

// FullBadge component (Story 3.12)
export { FullBadge } from './FullBadge';
export type { FullBadgeProps } from './FullBadge';
