import { describe, expect, it, vi } from "vitest";
import { broadcastMatchView } from "./broadcast";
import type { MatchView } from "./view";

describe("broadcastMatchView", () => {
  it("sends each view on its own viewer's channel (seat b must not get seat a's view)", async () => {
    const sent: [string, string][] = [];
    const db = {
      channel: (name: string) => ({ httpSend: vi.fn(async (event: string) => void sent.push([name, event])) }),
      removeChannel: vi.fn(async () => "ok"),
    };
    await broadcastMatchView({ id: "m1", channel: "match:m1" } as MatchView, db as never);
    await broadcastMatchView({ id: "m1", channel: "match:m1:b" } as MatchView, db as never);
    expect(sent).toEqual([
      ["match:m1", "state"],
      ["match:m1:b", "state"],
    ]);
    expect(db.removeChannel).toHaveBeenCalledTimes(2);
  });
});
