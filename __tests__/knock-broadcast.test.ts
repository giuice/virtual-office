import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { broadcastKnockInvalidated } from "@/lib/presence/knock-broadcast";

const COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const channel = {
  httpSend: vi.fn(),
};
const supabase = {
  channel: vi.fn(),
  removeChannel: vi.fn(),
} as unknown as SupabaseClient;

describe("broadcastKnockInvalidated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.channel).mockReturnValue(channel as never);
    vi.mocked(supabase.removeChannel).mockResolvedValue("ok");
  });

  it("sends a private company invalidation with a bounded timeout and removes the channel", async () => {
    channel.httpSend.mockResolvedValue({ success: true });

    await expect(
      broadcastKnockInvalidated(supabase, COMPANY_ID),
    ).resolves.toBeUndefined();

    expect(supabase.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:knock`,
      {
        config: { private: true },
      },
    );
    expect(channel.httpSend).toHaveBeenCalledWith(
      "knock-invalidated",
      { kind: "knock-invalidated" },
      { timeout: 2_000 },
    );
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("absorbs delivery rejection and still removes the channel", async () => {
    channel.httpSend.mockRejectedValue(new Error("Realtime unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      broadcastKnockInvalidated(supabase, COMPANY_ID),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("Knock invalidation broadcast failed");
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    warn.mockRestore();
  });

  it("does nothing when the canonical company id is absent", async () => {
    await expect(
      broadcastKnockInvalidated(supabase, null),
    ).resolves.toBeUndefined();

    expect(supabase.channel).not.toHaveBeenCalled();
    expect(channel.httpSend).not.toHaveBeenCalled();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
  });
});
