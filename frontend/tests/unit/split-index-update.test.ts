import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setStorageAdapter,
  runForTenant,
  type StorageAdapter,
} from "../../src/lib/models/io";

// Failure injection: each wrapped function throws while `faults.step` names it
// (and, where it takes a document id, while `faults.documentId` matches).
const faults = vi.hoisted(() => ({
  step: null as string | null,
  documentId: null as string | null,
  rebuildCalls: 0,
}));

function injected(step: string, documentId?: string): void {
  if (faults.step !== step) return;
  if (faults.documentId !== null && documentId !== faults.documentId) return;
  throw new Error(`injected failure in ${step}`);
}

vi.mock("../../src/lib/models/inverted-index", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/inverted-index")
    >();
  return {
    ...actual,
    indexResource: (...args: Parameters<typeof actual.indexResource>) => {
      injected("inverted-index", args[1].id);
      return actual.indexResource(...args);
    },
    indexAnnotationBodies: (
      ...args: Parameters<typeof actual.indexAnnotationBodies>
    ) => {
      injected("annotation-index", args[1]);
      return actual.indexAnnotationBodies(...args);
    },
  };
});

vi.mock("../../src/lib/models/backlinks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/backlinks")>();
  return {
    ...actual,
    persistBacklinks: (...args: Parameters<typeof actual.persistBacklinks>) => {
      injected("backlinks");
      return actual.persistBacklinks(...args);
    },
  };
});

vi.mock("../../src/lib/models/mention-index", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/mention-index")>();
  return {
    ...actual,
    updateMentionIndex: (
      ...args: Parameters<typeof actual.updateMentionIndex>
    ) => {
      injected("mention-index");
      return actual.updateMentionIndex(...args);
    },
  };
});

vi.mock("../../src/lib/models/diagnostics-index", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/diagnostics-index")
    >();
  return {
    ...actual,
    persistDiagnosticsIndex: (
      ...args: Parameters<typeof actual.persistDiagnosticsIndex>
    ) => {
      injected("diagnostics");
      return actual.persistDiagnosticsIndex(...args);
    },
  };
});

vi.mock(
  "../../src/lib/models/derived-index-rebuild",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/lib/models/derived-index-rebuild")
      >();
    return {
      ...actual,
      rebuildDerivedIndexes: (
        ...args: Parameters<typeof actual.rebuildDerivedIndexes>
      ) => {
        faults.rebuildCalls += 1;
        return actual.rebuildDerivedIndexes(...args);
      },
    };
  },
);

import {
  updateDocumentIndexes,
  SPLIT_INDEX_STEPS,
} from "../../src/lib/models/split-index-update";
import { rebuildDerivedIndexes } from "../../src/lib/models/derived-index-rebuild";
import { waitForDrain, enqueueIndex } from "../../src/lib/models/indexer-queue";

const fsFunctions = {
  mkdir: async (p: string, o?: object) => {
    await fs.mkdir(p, o);
  },
  writeFile: (p: string, d: string, o?: object) => fs.writeFile(p, d, o),
  readFile: (p: string, e?: BufferEncoding) =>
    fs.readFile(p, e ?? "utf8") as unknown as Promise<string>,
  readdir: (p: string, o?: object) =>
    fs.readdir(p, o as never) as unknown as Promise<string[]>,
  stat: (p: string) => fs.stat(p),
  rm: (p: string, o?: object) => fs.rm(p, o),
  rename: (a: string, b: string) => fs.rename(a, b),
};
const realFsAdapter = fsFunctions as unknown as StorageAdapter;

const FIRST_HALF = "Marker alpha begins. See the lantern keeper. ";
const SECOND_HALF = "Then Aria crossed the bridge. Zebra omega ends here.";

interface Project {
  root: string;
  original: string;
  split: string;
  linker: string;
  entity: string;
}

async function writeDoc(
  root: string,
  id: string,
  sidecar: Record<string, unknown>,
  text: string,
): Promise<void> {
  const dir = path.join(root, "resources", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "content.txt"), text, "utf8");
  const tiptap = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  await fs.writeFile(
    path.join(dir, "content.tiptap.json"),
    JSON.stringify(tiptap),
    "utf8",
  );
  await writeSidecarFile(root, id, sidecar);
}

async function writeSidecarFile(
  root: string,
  id: string,
  sidecar: Record<string, unknown>,
): Promise<void> {
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", `resource-${id}.meta.json`),
    JSON.stringify({ id, type: "text", ...sidecar }),
    "utf8",
  );
}

/**
 * A project as it stands after a split committed: the baseline indexes were
 * built while the original still held both halves, then the files were
 * changed on disk (no index function called).
 */
async function makeSplitProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-split-idx-"));
  const [original, split, linker, entity] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: randomUUID(), name: "Fixture", config: {} }),
    "utf8",
  );
  await writeDoc(root, entity, { name: "Aria", entityKind: "character" }, "");
  await writeDoc(
    root,
    original,
    {
      name: "Chapter",
      annotations: [
        { id: "a1", body: "firstnote body", quote: "Marker" },
        { id: "a2", body: "secondnote body", quote: "Zebra" },
      ],
    },
    FIRST_HALF + SECOND_HALF,
  );
  await writeDoc(
    root,
    linker,
    { name: "Linker" },
    `Points at ${original} directly.`,
  );
  await runForTenant(root, () => rebuildDerivedIndexes(root), realFsAdapter);
  // The split, as written to disk by the split core.
  await writeDoc(
    root,
    original,
    {
      name: "Chapter",
      annotations: [{ id: "a1", body: "firstnote body", quote: "Marker" }],
    },
    FIRST_HALF,
  );
  await writeDoc(
    root,
    split,
    {
      name: "Chapter (part 2)",
      annotations: [{ id: "a2", body: "secondnote body", quote: "Zebra" }],
    },
    SECOND_HALF,
  );
  faults.rebuildCalls = 0;
  return { root, original, split, linker, entity };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

async function readJson(root: string, rel: string): Promise<unknown> {
  try {
    return sortKeys(
      JSON.parse(await fs.readFile(path.join(root, rel), "utf8")),
    );
  } catch {
    return "absent";
  }
}

const REBUILT_FILES = [
  "meta/index/inverted.json",
  "meta/index/annotations.json",
  "meta/index/mentions.json",
  "meta/backlinks.json",
];

async function snapshot(root: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const rel of REBUILT_FILES) out[rel] = await readJson(root, rel);
  return out;
}

function run<T>(root: string, fn: () => Promise<T>): Promise<T> {
  return runForTenant(root, fn, realFsAdapter);
}

describe("updateDocumentIndexes", () => {
  beforeEach(() => {
    setStorageAdapter(realFsAdapter);
    faults.step = null;
    faults.documentId = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    faults.step = null;
    await waitForDrain(2000);
    vi.restoreAllMocks();
  });

  it("brings every index up to date for the document set and a link to the original resolves", async () => {
    const p = await makeSplitProject();
    const result = await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    expect(result.outcome).toBe("updated");

    const inverted = (await readJson(
      p.root,
      "meta/index/inverted.json",
    )) as Record<string, Record<string, number>>;
    expect(inverted["alpha"]?.[p.original]).toBeGreaterThan(0);
    expect(inverted["zebra"]?.[p.original]).toBeUndefined();
    expect(inverted["zebra"]?.[p.split]).toBeGreaterThan(0);
    expect(inverted["part"]?.[p.split]).toBeGreaterThan(0);

    const annotations = (await readJson(
      p.root,
      "meta/index/annotations.json",
    )) as Record<string, Record<string, number>>;
    expect(annotations["firstnote"]?.[p.original]).toBeGreaterThan(0);
    expect(annotations["secondnote"]?.[p.original]).toBeUndefined();
    expect(annotations["secondnote"]?.[p.split]).toBeGreaterThan(0);

    const backlinks = (await readJson(p.root, "meta/backlinks.json")) as Record<
      string,
      string[]
    >;
    expect(backlinks[p.linker]).toContain(p.original);

    // Mentions are recomputed: the original no longer holds the entity's
    // record the baseline gave it, and the new document has its own.
    const mentions = (await readJson(
      p.root,
      "meta/index/mentions.json",
    )) as Record<string, { entityId: string; offsets: number[] }[]>;
    expect(mentions[p.original]).toBeUndefined();
    expect(mentions[p.split]?.[0]?.entityId).toBe(p.entity);
    expect(mentions[p.split]?.[0]?.offsets).toEqual([
      SECOND_HALF.indexOf("Aria"),
    ]);

    const diagnostics = (await readJson(
      p.root,
      "meta/index/diagnostics.json",
    )) as Record<string, unknown>;
    expect(diagnostics[p.original]).toBeDefined();
    expect(diagnostics[p.split]).toBeDefined();
  });

  it("gives the same four indexes as a full rebuild of the same files", async () => {
    const p = await makeSplitProject();
    const copy = await fs.mkdtemp(path.join(os.tmpdir(), "gw-split-idx-copy-"));
    await fs.cp(p.root, copy, { recursive: true });

    await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    await run(copy, () => rebuildDerivedIndexes(copy));

    expect(await snapshot(p.root)).toEqual(await snapshot(copy));
  });

  it("does not run a whole-project reindex", async () => {
    const p = await makeSplitProject();
    await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    expect(faults.rebuildCalls).toBe(0);
  });

  it("resolves only after the work has run (no timer resolve)", async () => {
    const p = await makeSplitProject();
    await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    const inverted = (await readJson(
      p.root,
      "meta/index/inverted.json",
    )) as Record<string, Record<string, number>>;
    expect(inverted["zebra"]?.[p.split]).toBeGreaterThan(0);
  });

  const INJECTED_STEPS = [
    "inverted-index",
    "annotation-index",
    "backlinks",
    "mention-index",
    "diagnostics",
  ] as const;

  for (const step of INJECTED_STEPS) {
    it(`returns a failed outcome naming the document and step when ${step} fails, and reindex then equals a full rebuild`, async () => {
      const p = await makeSplitProject();
      const copy = await fs.mkdtemp(
        path.join(os.tmpdir(), "gw-split-idx-copy-"),
      );
      await fs.cp(p.root, copy, { recursive: true });

      faults.step = step;
      // Per-document steps fail for the split-off document only.
      if (step === "inverted-index" || step === "annotation-index") {
        faults.documentId = p.split;
      }
      const result = await run(p.root, () =>
        updateDocumentIndexes(p.root, [p.original, p.split]),
      );
      faults.step = null;
      faults.documentId = null;

      expect(result.outcome).toBe("failed");
      if (result.outcome !== "failed") throw new Error("unreachable");
      expect(result.failures).toContainEqual({ documentId: p.split, step });
      if (step === "inverted-index" || step === "annotation-index") {
        expect(result.failures).toEqual([{ documentId: p.split, step }]);
      }

      await run(p.root, () => rebuildDerivedIndexes(p.root));
      await run(copy, () => rebuildDerivedIndexes(copy));
      expect(await snapshot(p.root)).toEqual(await snapshot(copy));
    });
  }

  it("names read-content when a document's text cannot be read, and writes no empty index for it", async () => {
    const p = await makeSplitProject();
    const ghost = randomUUID();
    await writeSidecarFile(p.root, ghost, { name: "Ghost" });
    const result = await run(p.root, () =>
      updateDocumentIndexes(p.root, [ghost]),
    );
    expect(result).toEqual({
      outcome: "failed",
      failures: [{ documentId: ghost, step: "read-content" }],
    });
    const diagnostics = (await readJson(
      p.root,
      "meta/index/diagnostics.json",
    )) as Record<string, unknown> | "absent";
    expect(diagnostics === "absent" || !(ghost in diagnostics)).toBe(true);
  });

  it("names read-sidecar when a sidecar is unreadable", async () => {
    const p = await makeSplitProject();
    await fs.writeFile(
      path.join(p.root, "meta", `resource-${p.split}.meta.json`),
      "{not json",
      "utf8",
    );
    const result = await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.split]),
    );
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") throw new Error("unreachable");
    expect(result.failures).toContainEqual({
      documentId: p.split,
      step: "read-sidecar",
    });
  });

  async function failDiagnosticsThenReindex(p: Project): Promise<void> {
    faults.step = "diagnostics";
    const result = await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    faults.step = null;
    expect(result.outcome).toBe("failed");
    await run(p.root, () => rebuildDerivedIndexes(p.root));
  }

  async function hasDiagnosticsRecord(
    root: string,
    id: string,
  ): Promise<boolean> {
    const index = (await readJson(root, "meta/index/diagnostics.json")) as
      | Record<string, unknown>
      | "absent";
    return index !== "absent" && id in index;
  }

  it("a failed diagnostics step is not repaired by reindex (rebuildDerivedIndexes)", async () => {
    const p = await makeSplitProject();
    await failDiagnosticsThenReindex(p);
    expect(await hasDiagnosticsRecord(p.root, p.split)).toBe(false);
  });

  it("a failed diagnostics step is written by the document's next save (enqueueIndex)", async () => {
    const p = await makeSplitProject();
    await failDiagnosticsThenReindex(p);
    expect(await hasDiagnosticsRecord(p.root, p.split)).toBe(false);

    await run(p.root, async () => {
      await enqueueIndex(p.root, p.split);
      await waitForDrain(5000);
    });
    expect(await hasDiagnosticsRecord(p.root, p.split)).toBe(true);
  });

  it("running the update again also writes a failed diagnostics record", async () => {
    const p = await makeSplitProject();
    await failDiagnosticsThenReindex(p);
    const again = await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    expect(again.outcome).toBe("updated");
    expect(await hasDiagnosticsRecord(p.root, p.split)).toBe(true);
  });

  it("each failure carries a stable step identifier Task 22 can name", async () => {
    expect([...SPLIT_INDEX_STEPS]).toEqual([
      "read-content",
      "read-sidecar",
      "inverted-index",
      "annotation-index",
      "backlinks",
      "mention-index",
      "diagnostics",
    ]);
    const p = await makeSplitProject();
    faults.step = "diagnostics";
    const result = await run(p.root, () =>
      updateDocumentIndexes(p.root, [p.original, p.split]),
    );
    faults.step = null;
    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") throw new Error("unreachable");
    expect(result.failures.length).toBeGreaterThan(0);
    for (const failure of result.failures) {
      expect(Object.keys(failure).sort()).toEqual(["documentId", "step"]);
      expect(SPLIT_INDEX_STEPS).toContain(failure.step);
      expect(failure.step).toBe("diagnostics");
    }
  });
});
