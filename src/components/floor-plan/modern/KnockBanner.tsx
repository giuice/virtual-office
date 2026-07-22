"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, DoorOpen, X } from "lucide-react";
import { EnhancedAvatarV2 } from "@/components/ui/enhanced-avatar-v2";
import { cn } from "@/lib/utils";
import type { KnockRequestPayload } from "@/hooks/realtime/useKnockSignaling";

const KNOCK_LIFETIME_MS = 30_000;
const COUNTDOWN_TICK_MS = 250;

interface KnockBannerProps {
  requesterName: string;
  requesterAvatarUrl?: string;
  remainingMs?: number;
  onApprove: () => void;
  onDeny: () => void;
  responding?: boolean;
}

export interface KnockBannerHostProps {
  pendingKnockRequests: Map<string, KnockRequestPayload>;
  respondingKnockRequestIds: Set<string>;
  onApprove: (request: KnockRequestPayload) => void;
  onDeny: (request: KnockRequestPayload) => void;
}

export const KnockBanner: React.FC<KnockBannerProps> = ({
  requesterName,
  requesterAvatarUrl,
  remainingMs = KNOCK_LIFETIME_MS,
  onApprove,
  onDeny,
  responding = false,
}) => {
  const expired = remainingMs <= 0;
  const controlsDisabled = responding;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const progress = Math.max(
    0,
    Math.min(100, (remainingMs / KNOCK_LIFETIME_MS) * 100),
  );
  const handleApprove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onApprove();
  };

  const handleDeny = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeny();
  };

  const stopPointerDownPropagation = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      data-avatar-interactive="true"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ boxShadow: "var(--vo-shadow), 0 0 34px var(--vo-mag-soft)" }}
      className={cn(
        "pointer-events-auto relative flex w-[min(560px,calc(100vw-2rem))] items-center gap-3 overflow-hidden rounded-2xl border p-3.5 pr-4",
        "bg-[var(--vo-banner-bg)] border-[var(--vo-mag)]",
        "animate-in slide-in-from-top-2 duration-300 motion-reduce:animate-none",
      )}
    >
      <div className="relative flex-shrink-0">
        <EnhancedAvatarV2
          user={{
            id: `knock-${requesterName}`,
            displayName: requesterName,
            avatarUrl: requesterAvatarUrl,
          }}
          size="md"
          fallbackName={requesterName}
          className="size-10"
          aria-label={`${requesterName} avatar`}
        />
        {!requesterAvatarUrl && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <DoorOpen className="size-4" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate">
          <span className="text-sm font-semibold text-[var(--vo-mag)]">
            {requesterName}
          </span>
          <span className="text-sm font-normal text-foreground">
            {" "}
            is knocking
          </span>
        </p>
        <p className="text-xs font-normal text-muted-foreground">
          Requesting access to this space ·{" "}
          {expired ? "Expired" : `${remainingSeconds}s`}
        </p>
      </div>

      <button
        type="button"
        data-avatar-interactive="true"
        onPointerDown={stopPointerDownPropagation}
        onClick={handleApprove}
        disabled={controlsDisabled}
        aria-disabled={controlsDisabled}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--vo-ok)] px-3 text-[var(--vo-bg)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Let ${requesterName} in`}
      >
        <Check className="size-4" />
      </button>

      <button
        type="button"
        data-avatar-interactive="true"
        onPointerDown={stopPointerDownPropagation}
        onClick={handleDeny}
        disabled={controlsDisabled}
        aria-disabled={controlsDisabled}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--vo-err)] bg-transparent px-3 text-[var(--vo-err)] transition-colors hover:bg-[var(--vo-err)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Deny ${requesterName}`}
      >
        <X className="size-4" />
      </button>

      <div
        className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-[var(--vo-line-soft)]"
        aria-hidden="true"
      >
        <span
          className="block h-full rounded-full bg-[var(--vo-mag)] transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export function KnockBannerHost({
  pendingKnockRequests,
  respondingKnockRequestIds,
  onApprove,
  onDeny,
}: KnockBannerHostProps) {
  const hasPendingRequests = pendingKnockRequests.size > 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasPendingRequests) return undefined;

    setNow(Date.now());
    const intervalId = window.setInterval(
      () => setNow(Date.now()),
      COUNTDOWN_TICK_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [hasPendingRequests]);

  const requests = useMemo(
    () =>
      Array.from(pendingKnockRequests.values()).sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
    [pendingKnockRequests],
  );

  if (typeof document === "undefined" || requests.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 top-3 z-[2147483647] flex max-h-[calc(100vh-1.5rem)] -translate-x-1/2 flex-col gap-2 overflow-y-auto"
      data-testid="global-knock-banner-host"
      aria-label="Pending knock requests"
    >
      {requests.map((request) => (
        <KnockBanner
          key={request.requestId}
          requesterName={request.requesterName}
          requesterAvatarUrl={request.requesterAvatarUrl}
          remainingMs={request.timestamp + KNOCK_LIFETIME_MS - now}
          responding={respondingKnockRequestIds.has(request.requestId)}
          onApprove={() => onApprove(request)}
          onDeny={() => onDeny(request)}
        />
      ))}
    </div>,
    document.body,
  );
}
