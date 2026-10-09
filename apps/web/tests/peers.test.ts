import { describe, expect, it } from "vitest";
import { cursorsFromPeers, readPeers } from "../src/sync/peers";

const ada = {
  user: { id: "ada", displayName: "Ada", color: "#0f6e62" },
  cursor: { x: 4, y: 8 },
};

describe("awareness peers", () => {
  it("drops a remote cursor when that client leaves", () => {
    const states = new Map<number, Record<string, unknown>>([
      [
        1,
        {
          user: { id: "me", displayName: "Me", color: "#111111" },
          cursor: { x: 0, y: 0 },
        },
      ],
      [2, ada],
      [
        3,
        {
          user: { id: "bea", displayName: "Bea", color: "#c4552a" },
          cursor: { x: 9, y: 1 },
        },
      ],
    ]);
    const local = 1;
    expect(
      cursorsFromPeers(readPeers(states, local)).map(
        (cursor) => cursor.displayName,
      ),
    ).toEqual(["Ada", "Bea"]);
    states.delete(2);
    const remaining = cursorsFromPeers(readPeers(states, local));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.displayName).toBe("Bea");
  });

  it("ignores peers that cleared their cursor", () => {
    const states = new Map<number, Record<string, unknown>>([
      [4, { user: ada.user, cursor: null }],
    ]);
    expect(cursorsFromPeers(readPeers(states, 1))).toEqual([]);
    expect(readPeers(states, 1)[0]?.user.displayName).toBe("Ada");
  });
});
