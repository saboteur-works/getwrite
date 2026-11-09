/**
 * Feature 106 Task 5: Inbox membership helper (FR-7, FR-14, FR-23, OQ-9).
 */
import { describe, it, expect } from "vitest";
import {
  computeInboxSubtree,
  isInInbox,
  inboxResourceIds,
  countInboxItems,
  classifyInboxMove,
  type InboxFolderNode,
  type InboxItemNode,
  type InboxSubtree,
} from "../../src/lib/models/inbox-membership";

const folder = (
  id: string,
  parentId: string | null = null,
): InboxFolderNode => ({ id, parentId });
const res = (id: string, folderId: string | null = null): InboxItemNode => ({
  id,
  type: "text",
  folderId,
});

const FOLDERS: InboxFolderNode[] = [
  folder("inbox"),
  folder("inbox-a", "inbox"),
  folder("inbox-b", "inbox-a"),
  folder("other"),
  folder("other-a", "other"),
];

function subtreeOf(
  folders: InboxFolderNode[],
  id: string | null,
): InboxSubtree {
  const r = computeInboxSubtree(folders, id);
  if (!r.ok) throw new Error("unexpected failure");
  return r.subtree;
}

describe("computeInboxSubtree", () => {
  it("is empty when the Inbox id is unset", () => {
    const s = subtreeOf(FOLDERS, null);
    expect(s.folderIds.size).toBe(0);
    expect(isInInbox(s, res("r", "inbox"))).toBe(false);
  });

  it("is empty when the id names no folder", () => {
    const s = subtreeOf(FOLDERS, "missing");
    expect(s.folderIds.size).toBe(0);
    expect(isInInbox(s, res("r", "missing"))).toBe(false);
  });

  it("holds the Inbox folder and every descendant at any depth", () => {
    const s = subtreeOf(FOLDERS, "inbox");
    expect([...s.folderIds].sort()).toEqual(["inbox", "inbox-a", "inbox-b"]);
  });

  it("falls back to folderId when a folder has no parentId", () => {
    const s = subtreeOf(
      [folder("inbox"), { id: "x", folderId: "inbox" }],
      "inbox",
    );
    expect(s.folderIds.has("x")).toBe(true);
  });

  it("reports a parent cycle through the Inbox as a failure value", () => {
    const r = computeInboxSubtree(
      [folder("inbox", "c"), folder("b", "inbox"), folder("c", "b")],
      "inbox",
    );
    expect(r.ok).toBe(false);
  });

  it("reports a duplicated folder id under the Inbox as a failure value", () => {
    const r = computeInboxSubtree(
      [folder("inbox"), folder("d", "inbox"), folder("d", "inbox")],
      "inbox",
    );
    expect(r.ok).toBe(false);
  });

  it("ignores a cycle that is not reachable from the Inbox", () => {
    const r = computeInboxSubtree(
      [folder("inbox"), folder("p", "q"), folder("q", "p")],
      "inbox",
    );
    expect(r.ok).toBe(true);
  });
});

describe("isInInbox", () => {
  const s = subtreeOf(FOLDERS, "inbox");
  it("is true for a resource in any subtree folder", () => {
    expect(isInInbox(s, res("r1", "inbox"))).toBe(true);
    expect(isInInbox(s, res("r2", "inbox-b"))).toBe(true);
  });
  it("is false for a resource at root or outside the subtree", () => {
    expect(isInInbox(s, res("r3", null))).toBe(false);
    expect(isInInbox(s, res("r4", "other-a"))).toBe(false);
  });
  it("is true for a folder nested in the Inbox, false outside", () => {
    expect(isInInbox(s, { id: "inbox-b", type: "folder" })).toBe(true);
    expect(isInInbox(s, { id: "other-a", type: "folder" })).toBe(false);
  });
});

describe("inboxResourceIds and countInboxItems", () => {
  const s = subtreeOf(FOLDERS, "inbox");
  const items: InboxItemNode[] = [
    res("r1", "inbox"),
    res("r2", "inbox-b"),
    res("r3", null),
    res("r4", "other"),
    { id: "inbox-a", type: "folder", folderId: "inbox" },
  ];
  it("returns the ids of resources in the subtree, not folders", () => {
    expect(inboxResourceIds(s, items).sort()).toEqual(["r1", "r2"]);
  });
  it("counts resources only", () => {
    expect(countInboxItems(s, items)).toBe(2);
  });
  it("counts zero for an empty subtree", () => {
    expect(countInboxItems(subtreeOf(FOLDERS, null), items)).toBe(0);
  });
});

describe("classifyInboxMove", () => {
  const s = subtreeOf(FOLDERS, "inbox");
  it("classifies a resource moved to a folder outside as out", () => {
    expect(classifyInboxMove(s, res("r1", "inbox"), "other")).toBe("out");
    expect(classifyInboxMove(s, res("r1", "inbox-b"), null)).toBe("out");
  });
  it("classifies a move inside the subtree as within", () => {
    expect(classifyInboxMove(s, res("r1", "inbox"), "inbox-b")).toBe("within");
  });
  it("classifies a move that starts outside as unrelated", () => {
    expect(classifyInboxMove(s, res("r5", "other"), "inbox")).toBe("unrelated");
    expect(classifyInboxMove(s, res("r5", "other"), "other-a")).toBe(
      "unrelated",
    );
  });
  it("classifies a nested folder moved out as out, within as within", () => {
    const f: InboxItemNode = {
      id: "inbox-b",
      type: "folder",
      folderId: "inbox-a",
    };
    expect(classifyInboxMove(s, f, "other")).toBe("out");
    expect(classifyInboxMove(s, f, "inbox")).toBe("within");
  });
  it("classifies moving the Inbox folder itself as unrelated", () => {
    expect(classifyInboxMove(s, { id: "inbox", type: "folder" }, "other")).toBe(
      "unrelated",
    );
  });
  it("is unrelated when no Inbox is set", () => {
    const none = subtreeOf(FOLDERS, null);
    expect(classifyInboxMove(none, res("r", "inbox"), "other")).toBe(
      "unrelated",
    );
  });
});
