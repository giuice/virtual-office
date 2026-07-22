import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KnockBanner,
  KnockBannerHost,
} from "@/components/floor-plan/modern/KnockBanner";
import ModernSpaceCard from "@/components/floor-plan/modern/ModernSpaceCard";
import type { Space, UserPresenceData } from "@/types/database";

vi.mock("@/components/ui/enhanced-avatar-v2", () => ({
  EnhancedAvatarV2: ({
    user,
    "aria-label": ariaLabel,
  }: {
    user: { displayName?: string };
    "aria-label"?: string;
  }) => <div aria-label={ariaLabel}>{user.displayName}</div>,
}));

vi.mock("lucide-react", () => ({
  Check: () => <span aria-hidden="true">check</span>,
  X: () => <span aria-hidden="true">x</span>,
  DoorOpen: () => <span aria-hidden="true">door-open</span>,
  DoorClosed: () => <span aria-hidden="true">door-closed</span>,
  Loader2: () => <span aria-hidden="true">loader</span>,
  ShieldX: () => <span aria-hidden="true">shield-x</span>,
  Clock: () => <span aria-hidden="true">clock</span>,
  Timer: () => <span aria-hidden="true">timer</span>,
  Building: () => <span aria-hidden="true">building</span>,
  Coffee: () => <span aria-hidden="true">coffee</span>,
  Briefcase: () => <span aria-hidden="true">briefcase</span>,
  Video: () => <span aria-hidden="true">video</span>,
  Users: () => <span aria-hidden="true">users</span>,
  Users2: () => <span aria-hidden="true">users-2</span>,
  FlaskConical: () => <span aria-hidden="true">flask</span>,
  LayoutGrid: () => <span aria-hidden="true">layout-grid</span>,
}));

vi.mock("@/components/floor-plan/modern/AvatarGroup", () => ({
  default: () => <div>avatars</div>,
}));

vi.mock("@/components/floor-plan/modern/StatusIndicators", () => ({
  SpaceStatusBadge: () => <div>status</div>,
  SpaceTypeIndicator: () => <div>type</div>,
  CapacityIndicator: () => <div>capacity</div>,
}));

vi.mock("@/components/floor-plan/modern/FullBadge", () => ({
  FullBadge: () => <div>full</div>,
}));

vi.mock("@/components/floor-plan/modern/SpaceContextMenu", () => ({
  default: () => null,
}));

vi.mock("@/components/floor-plan/modern/SpaceDetailPanel", () => ({
  SpaceDetailPanel: () => null,
}));

vi.mock("@/components/floor-plan/modern/SpaceDetailBottomSheet", () => ({
  SpaceDetailBottomSheet: () => null,
}));

vi.mock("@/hooks/useSpaceDetails", () => ({
  useSpaceDetails: () => ({
    agenda: null,
    activityLog: [],
    transcript: null,
    isLoading: false,
  }),
}));

vi.mock("@/components/ui/glass-panel", () => ({
  GlassPanel: ({
    ref,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    ref?: React.Ref<HTMLDivElement>;
  }) => <div ref={ref} {...props} />,
}));

const mockKnockRequest = {
  type: "KNOCK_REQUEST" as const,
  requestId: "request-1",
  spaceId: "space-1",
  requesterId: "user-1",
  requesterName: "Taylor Knock",
  requesterAvatarUrl: "https://example.com/avatar.png",
  timestamp: Date.now(),
};

const restrictedSpace: Space = {
  id: "space-1",
  companyId: "company-1",
  name: "Focus Room",
  type: "private_office",
  status: "active",
  capacity: 4,
  features: [],
  position: { x: 0, y: 0, width: 4, height: 2 },
  accessControl: { isPublic: false },
};

const publicSpace: Space = {
  ...restrictedSpace,
  id: "space-public",
  name: "Open Workspace",
  accessControl: { isPublic: true },
};

const occupant: UserPresenceData = {
  id: "occupant-1",
  displayName: "Occupant One",
  avatarUrl: undefined,
  status: "online",
  currentSpaceId: "space-1",
  statusMessage: undefined,
};

function renderSpaceCard(
  overrides: Partial<React.ComponentProps<typeof ModernSpaceCard>> = {},
) {
  return render(
    <ModernSpaceCard
      space={restrictedSpace}
      usersInSpace={[occupant]}
      onEnterSpace={vi.fn()}
      onKnock={vi.fn()}
      state={{ directEnter: false, detailPanel: false }}
      {...overrides}
    />,
  );
}

describe("KnockBanner", () => {
  it("renders requester name and avatar", () => {
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        requesterAvatarUrl="https://example.com/avatar.png"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Taylor Knock").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Taylor Knock avatar")).toBeInTheDocument();
  });

  it("renders Approve and Deny buttons", () => {
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /let taylor knock in/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deny taylor knock/i }),
    ).toBeInTheDocument();
  });

  it('has role="alert" and aria-live="polite" for accessibility', () => {
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("aria-atomic", "true");
  });

  it("has data-avatar-interactive on outer div", () => {
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-avatar-interactive",
      "true",
    );
  });

  it("calls onApprove when Approve button clicked", () => {
    const onApprove = vi.fn();
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /let taylor knock in/i }),
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("does not submit twice across pointerdown and click", () => {
    const onApprove = vi.fn();
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );

    const approveButton = screen.getByRole("button", {
      name: /let taylor knock in/i,
    });
    fireEvent.pointerDown(approveButton);
    fireEvent.click(approveButton);

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onDeny when Deny button clicked", () => {
    const onDeny = vi.fn();
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        onApprove={vi.fn()}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /deny taylor knock/i }));

    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("stops event propagation on button clicks", () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <KnockBanner
          requesterName="Taylor Knock"
          onApprove={vi.fn()}
          onDeny={vi.fn()}
        />
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /let taylor knock in/i }),
    );

    expect(parentClick).not.toHaveBeenCalled();
  });

  it("renders the presentational countdown", () => {
    render(
      <KnockBanner
        requesterName="Taylor Knock"
        remainingMs={12_400}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText(/13s/)).toBeInTheDocument();
  });
});

describe("KnockBannerHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createRequest(
    requestId: string,
    requesterName: string,
    timestampOffset = 0,
  ) {
    return {
      ...mockKnockRequest,
      requestId,
      requesterId: `user-${requestId}`,
      requesterName,
      timestamp: Date.now() + timestampOffset,
    };
  }

  it("portals a globally fixed host and stacks requests oldest to newest", () => {
    const older = createRequest("request-old", "Older Request", -1_000);
    const newer = createRequest("request-new", "Newer Request");

    render(
      <KnockBannerHost
        pendingKnockRequests={
          new Map([
            [newer.requestId, newer],
            [older.requestId, older],
          ])
        }
        respondingKnockRequestIds={new Set()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    const host = screen.getByTestId("global-knock-banner-host");
    expect(host.parentElement).toBe(document.body);
    expect(host).toHaveClass("fixed", "z-[2147483647]");
    expect(within(host).getAllByRole("alert")).toHaveLength(2);
    expect(within(host).getAllByRole("alert")[0]).toHaveTextContent(
      "Older Request",
    );
    expect(within(host).getAllByRole("alert")[1]).toHaveTextContent(
      "Newer Request",
    );
  });

  it("routes each approve and deny action with the matching request", () => {
    const first = createRequest("request-first", "First Request", -500);
    const second = createRequest("request-second", "Second Request");
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <KnockBannerHost
        pendingKnockRequests={
          new Map([
            [first.requestId, first],
            [second.requestId, second],
          ])
        }
        respondingKnockRequestIds={new Set()}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Let First Request in" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Deny Second Request" }),
    );
    expect(onApprove).toHaveBeenCalledWith(first);
    expect(onDeny).toHaveBeenCalledWith(second);
  });

  it("disables both controls only for the request being answered", () => {
    const first = createRequest("request-first", "First Request", -500);
    const second = createRequest("request-second", "Second Request");

    render(
      <KnockBannerHost
        pendingKnockRequests={
          new Map([
            [first.requestId, first],
            [second.requestId, second],
          ])
        }
        respondingKnockRequestIds={new Set([first.requestId])}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Let First Request in" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Deny First Request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Let Second Request in" }),
    ).toBeEnabled();
  });

  it("labels an expired request while keeping server-authorized actions available", () => {
    const request = createRequest(
      "request-expired",
      "Expired Request",
      -31_000,
    );
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <KnockBannerHost
        pendingKnockRequests={new Map([[request.requestId, request]])}
        respondingKnockRequestIds={new Set()}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    expect(
      screen.getByText("Requesting access to this space · Expired"),
    ).toBeInTheDocument();
    const approve = screen.getByRole("button", {
      name: "Let Expired Request in",
    });
    const deny = screen.getByRole("button", { name: "Deny Expired Request" });
    expect(approve).toBeEnabled();
    expect(approve).toHaveAttribute("aria-disabled", "false");
    expect(deny).toBeEnabled();
    expect(deny).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(approve);
    fireEvent.click(deny);
    expect(onApprove).toHaveBeenCalledWith(request);
    expect(onDeny).toHaveBeenCalledWith(request);
  });

  it("keeps fresh request controls enabled", () => {
    const request = createRequest("request-fresh", "Fresh Request");

    render(
      <KnockBannerHost
        pendingKnockRequests={new Map([[request.requestId, request]])}
        respondingKnockRequestIds={new Set()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText(/30s/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Let Fresh Request in" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Let Fresh Request in" }),
    ).toHaveAttribute("aria-disabled", "false");
    expect(
      screen.getByRole("button", { name: "Deny Fresh Request" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Deny Fresh Request" }),
    ).toHaveAttribute("aria-disabled", "false");
  });

  it("counts down from the payload timestamp without mutating the request map", () => {
    const request = createRequest("request-countdown", "Countdown Request");
    const requests = new Map([[request.requestId, request]]);

    render(
      <KnockBannerHost
        pendingKnockRequests={requests}
        respondingKnockRequestIds={new Set()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText(/30s/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5_100);
    });
    expect(screen.getByText(/25s/)).toBeInTheDocument();
    expect(requests.get(request.requestId)).toBe(request);
  });

  it("cleans its countdown interval on unmount and preserves click-stop", () => {
    const request = createRequest("request-cleanup", "Cleanup Request");
    const parentClick = vi.fn();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = render(
      <div onClick={parentClick}>
        <KnockBannerHost
          pendingKnockRequests={new Map([[request.requestId, request]])}
          respondingKnockRequestIds={new Set()}
          onApprove={vi.fn()}
          onDeny={vi.fn()}
        />
      </div>,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Let Cleanup Request in" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Let Cleanup Request in" }),
    );
    expect(parentClick).not.toHaveBeenCalled();
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    clearIntervalSpy.mockRestore();
  });
});

describe("ModernSpaceCard - Knock Button", () => {
  it("renders knock button on restricted spaces for non-occupants", () => {
    renderSpaceCard();

    expect(screen.getByRole("button", { name: "Knock" })).toBeInTheDocument();
  });

  it("does not render knock button on public spaces", () => {
    renderSpaceCard({ space: publicSpace, state: { directEnter: true } });

    expect(
      screen.queryByRole("button", { name: "Knock" }),
    ).not.toBeInTheDocument();
  });

  it("does not render knock button for occupants of the space", () => {
    renderSpaceCard({ state: { userInSpace: true, directEnter: true } });

    expect(
      screen.queryByRole("button", { name: "Knock" }),
    ).not.toBeInTheDocument();
  });

  it('shows "Knocking..." state with spinner when knockStatus is knocking', () => {
    renderSpaceCard({ knockStatus: "knocking" });

    expect(screen.getByRole("button", { name: "Knocking..." })).toBeDisabled();
    expect(screen.getByText("Knocking...")).toBeInTheDocument();
  });

  it('shows disabled "Denied" state when knockStatus is denied', () => {
    renderSpaceCard({ knockStatus: "denied" });

    expect(screen.getByRole("button", { name: "Denied" })).toHaveTextContent(
      "Denied",
    );
  });

  it("shows cooldown countdown when knockStatus is cooldown", () => {
    renderSpaceCard({ knockStatus: "cooldown", knockCooldownRemaining: 42 });

    const button = screen.getByRole("button", { name: "Wait 42s" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Wait 42s");
  });

  it("knock button has data-avatar-interactive attribute", () => {
    renderSpaceCard();

    expect(screen.getByRole("button", { name: "Knock" })).toHaveAttribute(
      "data-avatar-interactive",
      "true",
    );
  });
});
