import { describe, expect, it } from "vitest";
import {
  collaborationDocumentName,
  collaborationToken,
  shareLinkPath,
} from "../src/api/contract";

describe("backend collaboration contract", () => {
  it("prefixes document names and provider tokens", () => {
    expect(collaborationDocumentName("board-1")).toBe("whiteboard:board-1");
    expect(collaborationToken("jwt", "abc.def")).toBe("jwt:abc.def");
    expect(collaborationToken("share", "tok")).toBe("share:tok");
    expect(collaborationToken("jwt", "jwt:already")).toBe("jwt:already");
  });

  it("builds the editor share path from the link token", () => {
    expect(shareLinkPath({ boardId: "board-1", token: "abc/def" })).toBe(
      "/boards/board-1?share=abc%2Fdef",
    );
  });
});
