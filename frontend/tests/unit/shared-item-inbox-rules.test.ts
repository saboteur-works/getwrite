/**
 * Feature 107 Task 15: pins for FR-9 and FR-10 on the shipped tree. A shared
 * text item (captureToInboxCore, origin "shared") and a shared image
 * (captureImageToInboxCore) follow Feature 106's Inbox rules: compile
 * exclusion seeded and export untouched, tree count, search, move-out
 * clearing, goal figures, and the writing log. Runs the real cores against a
 * temporary projects directory with no HTTP. The project directory name
 * differs from the id in project.json, and every call names the directory id.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeDirRetry } from "./helpers/fs-utils";
import { captureToInboxCore } from "../../src/lib/models/inbox-capture-core";
import { captureImageToInboxCore } from "../../src/lib/models/inbox-image-capture-core";
import { reorderResourcesClearingInboxExclusions } from "../../src/lib/models/inbox-move-core";
import {
  computeInboxSubtree,
  countInboxItems,
  type InboxItemNode,
} from "../../src/lib/models/inbox-membership";
import { readFolderTree } from "../../src/lib/models/folder-utils";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { readWritingLogEntries } from "../../src/lib/models/writing-log";
import { getWritingLogAggregateCore } from "../../src/lib/models/writing-log-core";
import { evaluateGoalTotal } from "../../src/lib/models/goal-filtered-total-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { executeSearch } from "../../src/lib/search/execute-search";
import { resolveInitialSelection } from "../../components/common/compile-defaults-selection";
import { generateUUID } from "../../src/lib/models/uuid";

/** The on-disk directory name; project.json carries a different id. */
const DIR_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const JSON_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const OTHER_DIR_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const opts = { now: () => NOW };
const FROM = "2026-11-09T00:00:00.000Z";
const TO = "2026-11-10T00:00:00.000Z";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

let projectsDir = "";
let root = "";
let other = "";
const prevEnv = process.env.GETWRITE_PROJECTS_DIR;

async function writeProjectJson(
  dir: string,
  config: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, "project.json"),
    JSON.stringify({
      id: dir === root ? JSON_ID : OTHER_DIR_ID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      config,
    }),
  );
}

const readConfig = async (): Promise<{
  inboxFolderId?: string;
  compileDefaults?: { excludedResourceIds: string[] };
  exportDefaults?: { excludedResourceIds: string[] };
}> =>
  JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8")).config;

beforeEach(async () => {
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-shared-rules-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  root = path.join(projectsDir, DIR_ID);
  other = path.join(projectsDir, OTHER_DIR_ID);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(other, { recursive: true });
  await writeProjectJson(root, {});
  await writeProjectJson(other, {});
});

afterEach(async () => {
  await flushIndexer();
  if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  await removeDirRetry(projectsDir);
});

async function shareText(text: string): Promise<string> {
  const r = await captureToInboxCore(
    { projectId: DIR_ID, text, origin: "shared" },
    opts,
  );
  if (r.status !== "created") throw new Error("text not created");
  return r.resourceId;
}

async function shareImage(): Promise<string> {
  const r = await captureImageToInboxCore(
    {
      projectId: DIR_ID,
      bytes: PNG,
      name: "photo.png",
      mimeType: "image/png",
      size: PNG.byteLength,
    },
    opts,
  );
  if (r.status !== "created") throw new Error("image not created");
  return r.resourceId;
}

/** A text resource outside the Inbox, with a stored word count. */
async function addOutsideText(id: string, wordCount: number): Promise<void> {
  await fs.mkdir(path.join(root, "resources", id), { recursive: true });
  await writeSidecar(root, id, {
    id,
    name: "outside",
    type: "text",
    folderId: null,
    wordCount,
  });
}

async function addOutsideFolder(): Promise<string> {
  const id = generateUUID();
  const dir = path.join(root, "folders", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "folder.json"),
    JSON.stringify({ id, name: "Out", parentId: null, orderIndex: 5 }),
  );
  return id;
}

const logEntries = async (dir: string) =>
  (await readWritingLogEntries(dir, FROM, TO)).flatMap((e) =>
    "skipped" in e ? [] : [e],
  );

describe("FR-10: writing log for shared items", () => {
  it("a shared text writes one import entry with source plaintext, no document id and no item id", async () => {
    const id = await shareText("shared words here");
    const entries = await logEntries(root);
    expect(entries).toHaveLength(1);
    const e = entries[0] as unknown as Record<string, unknown>;
    expect(e.source).toBe("plaintext");
    expect(e.added).toBe(3);
    expect("documentId" in e).toBe(false);
    expect(JSON.stringify(e)).not.toContain(id);
  });

  it("aggregateForRoot (via the aggregate core) does not count the shared import toward the daily goal", async () => {
    await shareText("shared words here");
    const agg = await getWritingLogAggregateCore(DIR_ID, FROM, TO);
    expect(agg.totals).toEqual({ added: 0, deleted: 0, net: 0 });
    expect(agg.imported.added).toBe(3);
  });

  it("a typed origin writes additions with the item as document id", async () => {
    const r = await captureToInboxCore(
      { projectId: DIR_ID, text: "one two three four", origin: "typed" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    const entries = await logEntries(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ added: 4, documentId: r.resourceId });
    expect(entries[0]).not.toHaveProperty("source");
  });

  it("a shared image writes no entry in any project", async () => {
    await shareImage();
    expect(await logEntries(root)).toEqual([]);
    expect(await logEntries(other)).toEqual([]);
    const agg = await getWritingLogAggregateCore(DIR_ID, FROM, TO);
    expect(agg.totals).toEqual({ added: 0, deleted: 0, net: 0 });
    expect(agg.imported).toEqual({ added: 0, deleted: 0, net: 0 });
  });
});

describe("FR-9: compile and export defaults", () => {
  it("a shared text and a shared image are each in compileDefaults and neither is in exportDefaults", async () => {
    const t = await shareText("a note");
    const i = await shareImage();
    const cfg = await readConfig();
    expect(new Set(cfg.compileDefaults?.excludedResourceIds)).toEqual(
      new Set([t, i]),
    );
    expect(cfg.exportDefaults).toBeUndefined();
  });

  it("export selection includes both by default and compile selection leaves both out", async () => {
    const t = await shareText("a note");
    const i = await shareImage();
    const cfg = await readConfig();
    const all = [t, i, "some-other-resource"];
    const exp = resolveInitialSelection(
      all,
      cfg.exportDefaults?.excludedResourceIds,
    );
    expect(exp.selectedIds.has(t)).toBe(true);
    expect(exp.selectedIds.has(i)).toBe(true);
    const comp = resolveInitialSelection(
      all,
      cfg.compileDefaults?.excludedResourceIds,
    );
    expect(comp.selectedIds.has(t)).toBe(false);
    expect(comp.selectedIds.has(i)).toBe(false);
    expect(comp.selectedIds.has("some-other-resource")).toBe(true);
  });
});

describe("FR-9: Inbox rules with no special case", () => {
  async function inboxItems(): Promise<InboxItemNode[]> {
    const ids = await fs.readdir(path.join(root, "resources"));
    const items: InboxItemNode[] = [];
    for (const id of ids) {
      const side = await readSidecar(root, id);
      const type = side?.type === "image" ? "image" : "text";
      items.push({
        id,
        type,
        folderId: typeof side?.folderId === "string" ? side.folderId : null,
      });
    }
    return items;
  }

  it("the Inbox tree count helper counts a shared text and a shared image", async () => {
    await shareText("a note");
    await shareImage();
    await addOutsideText(generateUUID(), 4);
    const cfg = await readConfig();
    const folders = (await readFolderTree(path.join(root, "folders"))).map(
      (f) => {
        const r = f as unknown as { id: string; parentId?: string | null };
        return { id: r.id, parentId: r.parentId ?? null };
      },
    );
    const computed = computeInboxSubtree(folders, cfg.inboxFolderId);
    if (!computed.ok) throw new Error("subtree failed");
    expect(countInboxItems(computed.subtree, await inboxItems())).toBe(2);
  });

  it("search finds a shared text by its words and a shared image by its name", async () => {
    const t = await shareText("A lighthouse keeper hears a bell.");
    const i = await shareImage();
    await flushIndexer();
    const byWord = await executeSearch(root, "lighthouse", {}, 50);
    expect(byWord.map((r) => r.resourceId)).toEqual([t]);
    const byName = await executeSearch(root, "photo", {}, 50);
    expect(byName.map((r) => r.resourceId)).toContain(i);
  });

  it("moving each out through the move path clears its compile exclusion and leaves export alone", async () => {
    const t = await shareText("a note");
    const i = await shareImage();
    const dest = await addOutsideFolder();
    const out = await reorderResourcesClearingInboxExclusions(DIR_ID, {
      folderOrder: [],
      resourceOrder: [
        { id: t, orderIndex: 0, folderId: dest },
        { id: i, orderIndex: 1, folderId: dest },
      ],
    });
    expect(out).toEqual({});
    const cfg = await readConfig();
    expect(cfg.compileDefaults?.excludedResourceIds ?? []).toEqual([]);
    expect(cfg.exportDefaults).toBeUndefined();
  });
});

describe("FR-9: goal figures", () => {
  const total = async () => evaluateGoalTotal(root, NOW);

  it("with no goal filter the shared text's words are outside the project total, and an outside text counts", async () => {
    await shareText("one two three four five");
    await addOutsideText(generateUUID(), 7);
    expect(await total()).toEqual({ status: "total", total: 7 });
  });

  it("a shared image changes neither the project total nor the daily figure", async () => {
    await addOutsideText(generateUUID(), 7);
    const beforeTotal = await total();
    const beforeDaily = await getWritingLogAggregateCore(DIR_ID, FROM, TO);
    await shareImage();
    expect(await total()).toEqual(beforeTotal);
    expect(await getWritingLogAggregateCore(DIR_ID, FROM, TO)).toEqual(
      beforeDaily,
    );
  });

  it("the shared text's words are outside the daily goal with no filter", async () => {
    await shareText("one two three four five");
    const agg = await getWritingLogAggregateCore(DIR_ID, FROM, TO);
    expect(agg.totals.net).toBe(0);
  });

  it("a goal filter selecting the Inbox folder counts the shared text's words in the project total", async () => {
    await shareText("one two three four five");
    const cfg = await readConfig();
    await writeProjectJson(root, {
      ...cfg,
      goalFilter: { op: "eq", field: "folderId", value: cfg.inboxFolderId },
    });
    expect(await total()).toEqual({ status: "total", total: 5 });
  });
});
