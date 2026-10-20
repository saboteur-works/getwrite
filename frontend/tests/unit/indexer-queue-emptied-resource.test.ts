/**
 * A text resource whose text is all removed must index as empty. The emptying
 * save goes through the real canonical save (`updateRevisionInPlace`), which
 * snapshots the previous text as a revision before overwriting it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { writeResourceWithInitialRevision } from "../../src/lib/models/resource-initial-revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { listRevisions } from "../../src/lib/models/revision";
import {
  enqueueIndex,
  loadPersistedPlainText,
  waitForDrain,
} from "../../src/lib/models/indexer-queue";
import { loadDiagnosticsIndex } from "../../src/lib/models/diagnostics-index";
import { search } from "../../src/lib/models/inverted-index";

const realFsAdapter = {
  mkdir: async (p: string, o?: unknown) => {
    await fs.mkdir(p, o as never);
  },
  writeFile: (p: string, d: unknown, o?: unknown) =>
    fs.writeFile(p, d as never, o as never),
  readFile: (p: string, e?: unknown) =>
    fs.readFile(p, (e ?? "utf8") as never) as unknown as Promise<string>,
  readdir: (p: string, o?: unknown) => fs.readdir(p, o as never) as never,
  stat: (p: string) => fs.stat(p) as never,
  rm: (p: string, o?: unknown) => fs.rm(p, o as never),
  rename: (a: string, b: string) => fs.rename(a, b),
};

const EMPTY_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

describe("indexing a resource after all its text is removed", () => {
  beforeEach(() => {
    setStorageAdapter(realFsAdapter as never);
  });

  it("reads no text and stores zero diagnostics", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-emptied-"));
    await fs.writeFile(
      path.join(projectRoot, "project.json"),
      JSON.stringify({ id: "p", name: "P", config: {} }),
    );
    const resource = createTextResource({
      name: "Chapter",
      plainText:
        '"Run," she said. "Now." The rain fell and the rain fell and the rain fell.',
    });
    await writeResourceWithInitialRevision(projectRoot, resource);
    const [canonical] = await listRevisions(projectRoot, resource.id);

    await updateRevisionInPlace(
      projectRoot,
      resource.id,
      canonical!.id,
      EMPTY_DOC,
    );

    expect(await loadPersistedPlainText(projectRoot, resource.id)).toBe("");

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);
    const record = (await loadDiagnosticsIndex(projectRoot))[resource.id];
    expect(record).toMatchObject({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    });
    // The deleted words are no longer searchable either.
    expect(await search(projectRoot, "rain")).not.toContain(resource.id);
  });

  it("with no content files at all, reads the canonical revision as text, not its raw JSON", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-nocontent-"),
    );
    await fs.writeFile(
      path.join(projectRoot, "project.json"),
      JSON.stringify({ id: "p", name: "P", config: {} }),
    );
    const resource = createTextResource({
      name: "Chapter",
      plainText: "The rain fell.",
    });
    await writeResourceWithInitialRevision(projectRoot, resource);
    await fs.rm(
      path.join(projectRoot, "resources", resource.id, "content.txt"),
    );
    await fs.rm(
      path.join(projectRoot, "resources", resource.id, "content.tiptap.json"),
    );

    expect(await loadPersistedPlainText(projectRoot, resource.id)).toBe(
      "The rain fell.",
    );
  });
});
