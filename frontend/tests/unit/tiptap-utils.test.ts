import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { getStorageAdapter, setStorageAdapter } from "../../src/lib/models/io";
import type { TipTapDocument } from "../../src/lib/models/types";
import {
  persistResourceContent,
  tiptapToPlainText,
  plainTextToTiptap,
  loadResourceContent,
} from "../../src/lib/tiptap-utils";
import { generateUUID } from "../../src/lib/models/uuid";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";

describe("tiptap-utils (T015)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("converts tiptap doc to plain text and back", () => {
    const doc: TipTapDocument = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "First line" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
      ],
    };

    const plain = tiptapToPlainText(doc);
    expect(plain).toContain("Title");
    expect(plain).toContain("First line");

    const round = plainTextToTiptap(plain);
    expect(round.type).toBe("doc");
    expect(round.content.length).toBeGreaterThan(0);
  });

  it("extracts text from table cells in word-count (T015-table)", () => {
    const doc: TipTapDocument = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Name" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Role" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Gandalf" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Wizard" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const plain = tiptapToPlainText(doc);
    expect(plain).toContain("Name");
    expect(plain).toContain("Role");
    expect(plain).toContain("Gandalf");
    expect(plain).toContain("Wizard");
  });

  it("persists both tiptap and plain text forms to disk and can load them", async () => {
    const projectRoot = "/proj-" + generateUUID();
    const resourceId = generateUUID();
    const doc: TipTapDocument = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] },
      ],
    };

    await persistResourceContent(projectRoot, resourceId, doc);

    const loaded = await loadResourceContent(projectRoot, resourceId);
    expect(loaded.plainText).toBe("hello world");
    expect(loaded.tiptap).toBeDefined();
  });

  describe("loadResourceContent — locked-access fail-closed", () => {
    const previousAdapter = getStorageAdapter();

    afterEach(() => {
      setStorageAdapter(previousAdapter);
    });

    it("rejects with ProjectLockedError instead of degrading to an empty result", async () => {
      const base = createMemoryAdapter();
      setStorageAdapter(base);

      const tenantRoot = "/ws-locked";
      const projectId = generateUUID();
      const projectRoot = `${tenantRoot}/${projectId}`;
      const resourceId = generateUUID();
      const doc: TipTapDocument = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hello world" }],
          },
        ],
      };

      // Persist content while the project is still (nominally) reachable,
      // then mark it as an opted-in encrypted project — the on-disk state a
      // real locked project is in.
      await persistResourceContent(projectRoot, resourceId, doc);
      await writeProjectMarker(projectRoot, base);

      // No keyring at all — the "workspace is locked" case `adapterFor`
      // must fail closed on, exercised through the real routed adapter
      // rather than a hand-thrown stand-in.
      const routed = workspaceEncryptionAdapter(base, tenantRoot, null);
      setStorageAdapter(routed);

      await expect(
        loadResourceContent(projectRoot, resourceId),
      ).rejects.toBeInstanceOf(ProjectLockedError);
    });
  });
});
