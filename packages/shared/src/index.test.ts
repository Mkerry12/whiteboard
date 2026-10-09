import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BoardId, BoardParticipant } from "./index.js";

describe("shared types", () => {
  it("describes a board participant", () => {
    const boardId: BoardId = "board_1";
    const participant: BoardParticipant = {
      id: "user_1",
      displayName: "Ada",
    };

    assert.equal(boardId, "board_1");
    assert.equal(participant.id, "user_1");
    assert.equal(participant.displayName, "Ada");
  });
});
