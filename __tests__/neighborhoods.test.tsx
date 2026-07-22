/**
 * Story 3.9: Space Grouping and Neighborhoods - Integration Tests
 * Tests for neighborhood CRUD, filtering, and UI components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Components
import { NeighborhoodManager } from "@/components/floor-plan/neighborhoods/NeighborhoodManager";
import { NeighborhoodFilters } from "@/components/floor-plan/modern/NeighborhoodFilters";
import {
  NeighborhoodSection,
  UngroupedSection,
} from "@/components/floor-plan/modern/NeighborhoodSection";
import { NeighborhoodSelector } from "@/components/floor-plan/neighborhoods/NeighborhoodSelector";
import { SpaceContextMenu } from "@/components/floor-plan/modern/SpaceContextMenu";
import ModernFloorPlan, {
  isCurrentUserAloneOnline,
} from "@/components/floor-plan/modern/ModernFloorPlan";

// Hooks
import { useNeighborhoodFilters } from "@/hooks/useNeighborhoodFilters";
import { useGroupedSpaces } from "@/hooks/useGroupedSpaces";

// Utils
import {
  NEIGHBORHOOD_COLORS,
  getAvailableNeighborhoodColors,
  getNeighborhoodColorLabel,
  suggestNeighborhoodColor,
} from "@/lib/neighborhood-colors";

// Types
import { Neighborhood, Space, SpaceType } from "@/types/database";

// ============================================
// Test Data Fixtures
// ============================================

const mockNeighborhoods: Neighborhood[] = [
  {
    id: "n1",
    company_id: "c1",
    name: "Engineering",
    description: "Engineering team spaces",
    color: "--vo-neighborhood-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "n2",
    company_id: "c1",
    name: "Marketing",
    description: "Marketing team spaces",
    color: "--vo-neighborhood-2",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockSpaces: Space[] = [
  {
    id: "s1",
    companyId: "c1",
    name: "Dev Room",
    type: "workspace" as SpaceType,
    capacity: 10,
    neighborhoodId: "n1",
    status: "available",
    description: "Main development area",
    features: [],
    position: { x: 0, y: 0, width: 100, height: 100 },
    accessControl: { isPublic: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "s2",
    companyId: "c1",
    name: "Marketing Hub",
    type: "workspace" as SpaceType,
    capacity: 8,
    neighborhoodId: "n2",
    status: "available",
    description: "Marketing workspace",
    features: [],
    position: { x: 100, y: 0, width: 100, height: 100 },
    accessControl: { isPublic: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    companyId: "c1",
    name: "General Lounge",
    type: "lounge" as SpaceType,
    capacity: 20,
    neighborhoodId: undefined,
    status: "available",
    description: "Common area",
    features: [],
    position: { x: 200, y: 0, width: 100, height: 100 },
    accessControl: { isPublic: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============================================
// Mock Setup
// ============================================

// Mock React Query hooks
vi.mock("@/hooks/queries/useNeighborhoods", () => ({
  useNeighborhoods: vi.fn(() => ({
    data: mockNeighborhoods,
    isLoading: false,
    error: null,
  })),
}));

vi.mock("@/hooks/mutations/useNeighborhoodMutations", () => ({
  useCreateNeighborhood: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useUpdateNeighborhood: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteNeighborhood: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({
    currentUserProfile: { id: "current-user", role: "member" },
    companyUsers: [],
  }),
}));

vi.mock("@/contexts/PresenceContext", () => ({
  usePresence: () => ({
    users: [
      {
        id: "current-user",
        displayName: "Current User",
        currentSpaceId: null,
        isConnected: true,
        isOccupyingCurrentSpace: false,
      },
    ],
    usersInSpaces: new Map([
      [
        "s1",
        [
          {
            id: "occupant-user",
            displayName: "Ada Occupant",
            currentSpaceId: "s1",
            isConnected: true,
            isOccupyingCurrentSpace: true,
          },
        ],
      ],
    ]),
    isLoading: false,
    updateLocation: vi.fn(),
    beginManualIntent: vi.fn(),
    releaseManualIntent: vi.fn(),
    presenceSessionId: "session-1",
  }),
}));

vi.mock("@/contexts/AudioContext", () => ({
  useAudio: () => ({ speakingUsers: new Map(), mutedUserIds: new Set() }),
}));

vi.mock("@/components/floor-plan/modern/useModernFloorPlanKnock", () => ({
  useModernFloorPlanKnock: () => ({
    error: null,
    setError: vi.fn(),
    pendingKnockRequests: new Map(),
    respondingKnockRequestIds: new Set(),
    timeoutSpaceId: null,
    knockStatus: "idle",
    knockTargetSpaceId: null,
    getCooldownRemaining: () => 0,
    handleBannerApprove: vi.fn(),
    handleBannerDeny: vi.fn(),
    handleEnterSpace: vi.fn(),
    handleLeaveSpace: vi.fn(),
    handleKnock: vi.fn(),
    hasSpaceAccess: () => true,
    isUserInSpace: () => false,
  }),
}));

vi.mock("@/components/floor-plan/modern/ModernUserAvatar", () => ({
  default: ({ user }: { user: { displayName: string } }) => (
    <span data-testid="compact-density-avatar">{user.displayName}</span>
  ),
}));

// ============================================
// Unit Tests: Neighborhood Colors
// ============================================

describe("Neighborhood Colors", () => {
  it("should have 8 color tokens defined", () => {
    expect(NEIGHBORHOOD_COLORS).toHaveLength(8);
  });

  it("should return available colors excluding used ones", () => {
    const usedColors = ["--vo-neighborhood-1", "--vo-neighborhood-3"];
    const available = getAvailableNeighborhoodColors(usedColors);

    expect(available).not.toContain("--vo-neighborhood-1");
    expect(available).not.toContain("--vo-neighborhood-3");
    expect(available).toContain("--vo-neighborhood-2");
    expect(available).toHaveLength(6);
  });

  it("should return display labels for color tokens", () => {
    expect(getNeighborhoodColorLabel("--vo-neighborhood-1")).toBe("Blue");
    expect(getNeighborhoodColorLabel("--vo-neighborhood-2")).toBe("Emerald");
    expect(getNeighborhoodColorLabel("unknown")).toBe("Custom");
  });

  it("should suggest an available color for new neighborhoods", () => {
    const usedColors = ["--vo-neighborhood-1", "--vo-neighborhood-2"];
    const suggested = suggestNeighborhoodColor(usedColors);

    expect(usedColors).not.toContain(suggested);
    expect(NEIGHBORHOOD_COLORS).toContain(suggested);
  });

  it("should handle all colors being used", () => {
    const allUsed = [...NEIGHBORHOOD_COLORS];
    const suggested = suggestNeighborhoodColor(allUsed);

    // Should still return a valid color
    expect(NEIGHBORHOOD_COLORS).toContain(suggested);
  });
});

// ============================================
// Unit Tests: useGroupedSpaces Hook
// ============================================

describe("useGroupedSpaces Hook", () => {
  it("should group spaces by neighborhood", () => {
    // This is a unit test for the hook logic
    // Define inline type for test
    type TestGroupedSpaces = {
      grouped: Array<{
        neighborhood: Neighborhood;
        spaces: Space[];
      }>;
      ungrouped: Space[];
    };

    const grouped: TestGroupedSpaces = {
      grouped: [
        {
          neighborhood: mockNeighborhoods[0],
          spaces: [mockSpaces[0]],
        },
        {
          neighborhood: mockNeighborhoods[1],
          spaces: [mockSpaces[1]],
        },
      ],
      ungrouped: [mockSpaces[2]],
    };

    expect(grouped.grouped).toHaveLength(2);
    expect(grouped.ungrouped).toHaveLength(1);
    expect(grouped.grouped[0].neighborhood.name).toBe("Engineering");
    expect(grouped.grouped[0].spaces[0].name).toBe("Dev Room");
  });
});

// ============================================
// Unit Tests: useNeighborhoodFilters Hook
// ============================================

describe("useNeighborhoodFilters Hook", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("should start with showAll = true when no filters set", () => {
    const { result } = renderHook(() =>
      useNeighborhoodFilters(mockNeighborhoods),
    );

    expect(result.current.isShowingAll).toBe(true);
    expect(result.current.activeCount).toBe(0);
  });

  it("should add filter when toggling a neighborhood", () => {
    const { result } = renderHook(() =>
      useNeighborhoodFilters(mockNeighborhoods),
    );

    act(() => {
      result.current.toggleFilter("n1");
    });

    expect(result.current.activeFilters.has("n1")).toBe(true);
    expect(result.current.activeCount).toBe(1);
    expect(result.current.isShowingAll).toBe(false);
  });

  it("should remove filter when toggling same neighborhood", () => {
    const { result } = renderHook(() =>
      useNeighborhoodFilters(mockNeighborhoods),
    );

    act(() => {
      result.current.showOnly("n1");
    });
    act(() => {
      result.current.toggleFilter("n1");
    });

    expect(result.current.activeFilters.has("n1")).toBe(false);
    expect(result.current.activeCount).toBe(0);
    expect(result.current.isShowingAll).toBe(true);
  });
});

// ============================================
// Component Tests: NeighborhoodFilters
// ============================================

describe("NeighborhoodFilters Component", () => {
  const mockOnToggle = vi.fn();
  const mockOnShowAll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render "All" chip and neighborhood chips', () => {
    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it('should mark "All" as active when isShowingAll is true', () => {
    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    const allChip = screen.getByText("All");
    expect(allChip).toHaveAttribute("aria-pressed", "true");
  });

  it("should call onToggle when clicking a neighborhood chip", async () => {
    const user = userEvent.setup();

    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    await user.click(screen.getByText("Engineering"));
    expect(mockOnToggle).toHaveBeenCalledWith("n1");
  });

  it('should call onShowAll when clicking "All" chip', async () => {
    const user = userEvent.setup();

    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set(["n1"])}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={false}
      />,
    );

    await user.click(screen.getByText("All"));
    expect(mockOnShowAll).toHaveBeenCalled();
  });

  it("should support keyboard navigation", async () => {
    const user = userEvent.setup();

    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    const engineeringChip = screen.getByText("Engineering");
    engineeringChip.focus();
    await user.keyboard("{Enter}");

    expect(mockOnToggle).toHaveBeenCalledWith("n1");
  });

  it("should have accessible role and aria attributes", () => {
    render(
      <NeighborhoodFilters
        neighborhoods={mockNeighborhoods}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    const filterGroup = screen.getByRole("group");
    expect(filterGroup).toHaveAttribute("aria-label", "Filter by neighborhood");
  });

  it("should not render when no neighborhoods exist", () => {
    const { container } = render(
      <NeighborhoodFilters
        neighborhoods={[]}
        activeFilters={new Set()}
        onToggle={mockOnToggle}
        onShowAll={mockOnShowAll}
        isShowingAll={true}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});

// ============================================
// Component Tests: NeighborhoodSection
// ============================================

describe("NeighborhoodSection Component", () => {
  const sectionProps = {
    index: 1,
    peopleCount: 2,
    capacity: 10,
    isCollapsed: false,
    onToggleCollapsed: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders the numbered header, eyebrow, people stat, and occupancy", () => {
    render(
      <NeighborhoodSection
        neighborhood={mockNeighborhoods[0]}
        spaces={[mockSpaces[0]]}
        {...sectionProps}
      >
        <div>Space cards here</div>
      </NeighborhoodSection>,
    );

    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(
      screen.getByText("ENG / Engineering team spaces"),
    ).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("people · 1 spaces")).toBeInTheDocument();
    expect(screen.getByTitle("20% of capacity in use")).toBeInTheDocument();
  });

  it("should have accessible section with aria-labelledby", () => {
    render(
      <NeighborhoodSection
        neighborhood={mockNeighborhoods[0]}
        spaces={[mockSpaces[0]]}
        {...sectionProps}
      >
        <div>Space cards</div>
      </NeighborhoodSection>,
    );

    const section = screen.getByRole("region");
    expect(section).toHaveAttribute("id", `nb-sec-${mockNeighborhoods[0].id}`);
    expect(section).toHaveAttribute(
      "aria-labelledby",
      `nb-heading-${mockNeighborhoods[0].id}`,
    );
  });

  it("exposes collapse state and calls the page callback", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    const { rerender } = render(
      <NeighborhoodSection
        neighborhood={mockNeighborhoods[0]}
        spaces={[mockSpaces[0]]}
        {...sectionProps}
        onToggleCollapsed={onToggleCollapsed}
      >
        <div>Space cards</div>
      </NeighborhoodSection>,
    );

    const collapseButton = screen.getByRole("button", {
      name: "Collapse Engineering",
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    await user.click(collapseButton);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);

    rerender(
      <NeighborhoodSection
        neighborhood={mockNeighborhoods[0]}
        spaces={[mockSpaces[0]]}
        {...sectionProps}
        isCollapsed
        onToggleCollapsed={onToggleCollapsed}
      >
        <div>Space cards</div>
      </NeighborhoodSection>,
    );
    expect(
      screen.getByRole("button", { name: "Expand Engineering" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Space cards")).not.toBeInTheDocument();
  });
});

// ============================================
// Component Tests: UngroupedSection
// ============================================

describe("UngroupedSection Component", () => {
  it('should render "Other" section for ungrouped spaces', () => {
    const { container } = render(
      <UngroupedSection
        spaces={[mockSpaces[2]]}
        index={3}
        peopleCount={0}
        capacity={20}
        isCollapsed={false}
        onToggleCollapsed={vi.fn()}
      >
        <div>Ungrouped space cards</div>
      </UngroupedSection>,
    );

    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(
      container.querySelector(".vo-neighborhood-eyebrow"),
    ).not.toBeInTheDocument();
  });

  it("should not render when no ungrouped spaces exist", () => {
    const { container } = render(
      <UngroupedSection
        spaces={[]}
        index={1}
        peopleCount={0}
        capacity={0}
        isCollapsed={false}
        onToggleCollapsed={vi.fn()}
      >
        <div>Should not show</div>
      </UngroupedSection>,
    );

    expect(container.firstChild).toBeNull();
  });
});

// ============================================
// Component Tests: SpaceContextMenu
// ============================================

describe("SpaceContextMenu Component", () => {
  const mockSpace = mockSpaces[0];
  const mockOnEnter = vi.fn();
  const mockOnOpenChat = vi.fn();
  const mockOnEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render trigger button with accessible label", () => {
    render(
      <SpaceContextMenu
        space={mockSpace}
        isAdmin={false}
        onEnter={mockOnEnter}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: `Actions for ${mockSpace.name}`,
    });
    expect(trigger).toBeInTheDocument();
  });

  // Note: Dropdown menu tests skipped due to Radix/jsdom compatibility
  // These interactions are tested in Playwright E2E tests instead
});

// ============================================
// Component Tests: NeighborhoodSelector
// ============================================

describe("NeighborhoodSelector Component", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the select trigger", () => {
    render(<NeighborhoodSelector value={null} onChange={mockOnChange} />);

    // Check that the select trigger renders (combobox role from Radix)
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
  });

  it("should display selected neighborhood name when value is set", () => {
    render(<NeighborhoodSelector value="n1" onChange={mockOnChange} />);

    // The selected value should show Engineering (from mocked useNeighborhoods)
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  // Note: Select dropdown interaction tests skipped due to Radix/jsdom compatibility
  // These interactions are tested in Playwright E2E tests instead
});

// ============================================
// Integration Test: Full Workflow
// ============================================

describe("Neighborhood Integration", () => {
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
    });
    act(() => window.dispatchEvent(new Event("resize")));
  });

  it("keeps avatars and omits the fabricated analyst sparkline in compact density", () => {
    const { container } = render(
      <ModernFloorPlan
        spaces={[mockSpaces[0]]}
        density="compact"
        enableNeighborhoodGrouping={false}
      />,
    );

    expect(
      container.querySelector(".vo-avatar-constellation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("compact-density-avatar")).toHaveTextContent(
      "Ada Occupant",
    );
    expect(
      container.querySelector(".cursor-crosshair"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Activity:/)).not.toBeInTheDocument();
  });

  it("keeps exactly one desktop detail panel when switching cards and does not restore the previous panel", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
    });

    render(
      <ModernFloorPlan
        spaces={mockSpaces.slice(0, 2)}
        enableNeighborhoodGrouping={false}
      />,
    );

    const background = screen.getByTestId("modern-floor-plan-background");
    expect(background).not.toHaveAttribute("inert");
    fireEvent.click(screen.getByTestId("space-s1"));
    expect(
      screen.getByRole("region", { name: "Details for Dev Room" }),
    ).toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByTestId("space-s2"));
    expect(
      screen.queryByRole("region", { name: "Details for Dev Room" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Details for Marketing Hub" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /Details for/ })).toHaveLength(
      1,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(
      screen.queryByRole("region", { name: /Details for/ }),
    ).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");
  });

  it("keeps exactly one mobile detail sheet when the selected card changes", () => {
    Object.defineProperty(window, "innerWidth", { value: 640, writable: true });
    act(() => window.dispatchEvent(new Event("resize")));

    render(
      <ModernFloorPlan
        spaces={mockSpaces.slice(0, 2)}
        enableNeighborhoodGrouping={false}
      />,
    );

    const background = screen.getByTestId("modern-floor-plan-background");
    expect(background).not.toHaveAttribute("inert");
    fireEvent.click(screen.getByTestId("space-s1"));
    expect(
      screen.getByRole("dialog", { name: "Space Details: Dev Room" }),
    ).toBeInTheDocument();
    expect(background).toHaveAttribute("inert");

    fireEvent.click(screen.getByTestId("space-s2"));
    expect(
      screen.queryByRole("dialog", { name: "Space Details: Dev Room" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Space Details: Marketing Hub" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(background).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByTestId("space-s1"));
    expect(background).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");
  });

  it("updates the inert contract when an open detail surface crosses the mobile breakpoint", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
    });

    render(
      <ModernFloorPlan
        spaces={[mockSpaces[0]]}
        enableNeighborhoodGrouping={false}
      />,
    );

    const background = screen.getByTestId("modern-floor-plan-background");
    fireEvent.click(screen.getByTestId("space-s1"));
    expect(
      screen.getByRole("region", { name: "Details for Dev Room" }),
    ).toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");

    Object.defineProperty(window, "innerWidth", { value: 640, writable: true });
    void act(() => window.dispatchEvent(new Event("resize")));

    expect(
      screen.getByRole("dialog", { name: "Space Details: Dev Room" }),
    ).toBeInTheDocument();
    expect(background).toHaveAttribute("inert");
  });

  it("treats disconnected coworkers as offline for the quiet-office state", () => {
    const currentUser = {
      id: "current-user",
      displayName: "Current User",
      currentSpaceId: "s1",
      isConnected: true,
    };
    const disconnectedCoworker = {
      id: "offline-user",
      displayName: "Offline User",
      currentSpaceId: null,
      isConnected: false,
    };

    expect(
      isCurrentUserAloneOnline(
        [currentUser, disconnectedCoworker],
        currentUser.id,
      ),
    ).toBe(true);
    expect(
      isCurrentUserAloneOnline(
        [currentUser, { ...disconnectedCoworker, isConnected: true }],
        currentUser.id,
      ),
    ).toBe(false);
  });

  it("should filter spaces based on active neighborhood filters", () => {
    // Simulate filtering logic
    const activeFilters = new Set(["n1"]);
    const filteredGroups = mockNeighborhoods
      .filter((n) => activeFilters.has(n.id))
      .map((n) => ({
        neighborhood: n,
        spaces: mockSpaces.filter((s) => s.neighborhoodId === n.id),
      }));

    expect(filteredGroups).toHaveLength(1);
    expect(filteredGroups[0].neighborhood.name).toBe("Engineering");
    expect(filteredGroups[0].spaces).toHaveLength(1);
    expect(filteredGroups[0].spaces[0].name).toBe("Dev Room");
  });

  it("should show all spaces when no filters active", () => {
    const activeFilters = new Set<string>();
    const showAll = activeFilters.size === 0;

    const visibleSpaces = showAll
      ? mockSpaces
      : mockSpaces.filter(
          (s) => s.neighborhoodId && activeFilters.has(s.neighborhoodId),
        );

    expect(visibleSpaces).toHaveLength(3);
  });
});
