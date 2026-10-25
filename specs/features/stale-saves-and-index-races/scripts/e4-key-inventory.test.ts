/**
 * Experiment E-4 (Feature 93, Task 2), server half. NOT part of the suite.
 *
 * Throwaway temp-directory project (mkdtemp under $TMPDIR). Real cores only.
 * Steps per repetition:
 *  1. createResourceCore (text, with plainText and tiptap) -> stored sidecar S0.
 *  2. loadProjectCore -> the resource object the page holds (the "page copy"):
 *     the server open-project payload `{...sidecar, plaintext, wordCount}`.
 *  3. canonical save (updateRevisionInPlace), rename, noise-term dismissal,
 *     entityKind/aliases/wordCountGoal/resourceSubtype writes -> stored S1.
 *  4. the page save construction (page.tsx applyUpdate): stale page copy with a
 *     userMetadata edit, `wordCount` overlaid from the post-save value, sent
 *     through updateSidecarCore -> stored S2.
 * Writes the result JSON to $E4_RESULT_OUT and writes the page copy to
 * $E4_PAGE_COPY_OUT when set (input to e4-sender-payloads.test.tsx).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../../../frontend/src/lib/models/project";
import { PROJECT_FILENAME } from "../../../../frontend/src/lib/models/project-config";
import {
  createResourceCore,
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../../../frontend/src/lib/models/resource-crud-core";
import { loadProjectCore } from "../../../../frontend/src/lib/models/project-crud-core";
import { readSidecar } from "../../../../frontend/src/lib/models/sidecar";
import { listRevisions } from "../../../../frontend/src/lib/models/revision";
import { updateRevisionInPlace } from "../../../../frontend/src/lib/models/revision-core";
import { flushIndexer } from "../../../../frontend/src/lib/models/indexer-queue";
import { generateUUID } from "../../../../frontend/src/lib/models/uuid";
import { removeDirRetry } from "../../../../frontend/tests/unit/helpers/fs-utils";

const REPS = 5;
/** fresh: page copy loaded before any canonical save or dismissal; warm: after one of each. */
const VARIANTS = ["fresh", "warm"] as const;
const dirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

const doc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

type Bag = Record<string, unknown>;
const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe("E-4 key inventory (server half)", () => {
  it("records keys", async () => {
    const batch = await fs.mkdtemp(path.join(os.tmpdir(), "f93-e4-"));
    dirs.push(batch);
    process.env.GETWRITE_PROJECTS_DIR = batch;
    const reps: Bag[] = [];

    for (const variant of VARIANTS)
      for (let i = 0; i < REPS; i++) {
        const projectId = generateUUID();
        const projectRoot = path.join(batch, projectId);
        await fs.mkdir(projectRoot, { recursive: true });
        await fs.writeFile(
          path.join(projectRoot, PROJECT_FILENAME),
          JSON.stringify(createProject({ name: `e4-${i}` })),
          "utf8",
        );
        const created = await createResourceCore(projectId, {
          name: "Chapter One",
          type: "text",
          text: { plainText: "hello world", tiptap: doc("hello world") },
        });
        const id = created.id;
        const s0 = (await readSidecar(projectRoot, id)) as Bag;
        if (variant === "warm") {
          const [first] = await listRevisions(projectRoot, id);
          await updateRevisionInPlace(
            projectRoot,
            id,
            first!.id,
            JSON.stringify(doc("hello world again")),
          );
          await setNoiseTermDismissedCore(projectId, id, "alpha", true);
          await sleep(5);
        }

        const loaded = await loadProjectCore(projectId);
        const pageCopy = loaded.resources.find((r) => r.id === id) as Bag;
        if (variant === "warm" && i === 0 && process.env.E4_PAGE_COPY_OUT) {
          await fs.writeFile(
            process.env.E4_PAGE_COPY_OUT,
            JSON.stringify({ projectId, pageCopy }),
            "utf8",
          );
        }

        await sleep(5);
        const [rev] = await listRevisions(projectRoot, id);
        await updateRevisionInPlace(
          projectRoot,
          id,
          rev!.id,
          JSON.stringify(doc("hello world and more words here")),
        );
        await renameResourceSidecarCore(projectId, id, "Renamed Chapter");
        await updateSidecarCore(projectId, id, {
          entityKind: "character",
          aliases: ["Ch"],
          wordCountGoal: 500,
          resourceSubtype: "Scene",
        });
        await setNoiseTermDismissedCore(projectId, id, "Hello", true);
        const s1 = (await readSidecar(projectRoot, id)) as Bag;

        // page.tsx applyUpdate: stale copy, userMetadata edit, wordCount overlaid
        // from the post-save value (Redux), resourceSubtype overlaid from Redux.
        const sent: Bag = {
          ...pageCopy,
          userMetadata: {
            ...((pageCopy.userMetadata as Bag) ?? {}),
            mood: "calm",
          },
          wordCount: s1.wordCount,
          resourceSubtype: s1.resourceSubtype,
        };
        await updateSidecarCore(projectId, id, sent);
        const s2 = (await readSidecar(projectRoot, id)) as Bag;

        const union = new Set([
          ...Object.keys(s0),
          ...Object.keys(pageCopy),
          ...Object.keys(s1),
          ...Object.keys(s2),
        ]);
        const putBack: string[] = [];
        const addedByStaleSave: string[] = [];
        const changedAtAll: string[] = [];
        for (const k of union) {
          if (!eq(s1[k], s2[k])) changedAtAll.push(k);
          if (!(k in s1) && k in s2) addedByStaleSave.push(k);
          if (k in s1 && !eq(s1[k], s2[k]) && eq(s2[k], pageCopy[k]))
            putBack.push(k);
        }
        reps.push({
          variant,
          s0Keys: Object.keys(s0).sort(),
          pageCopyKeys: Object.keys(pageCopy).sort(),
          pageCopyKeysNotInS0: Object.keys(pageCopy)
            .filter((k) => !(k in s0))
            .sort(),
          s1Keys: Object.keys(s1).sort(),
          s2Keys: Object.keys(s2).sort(),
          sentKeys: Object.keys(sent).sort(),
          putBackToStaleValue: putBack.sort(),
          keysChangedBySend: changedAtAll.sort(),
          keysAddedBySend: addedByStaleSave.sort(),
          s1Name: s1.name,
          s2Name: s2.name,
          s1UpdatedAtNewerThanCopy:
            String(s1.updatedAt) > String(pageCopy.updatedAt),
          copyUpdatedAt: pageCopy.updatedAt,
          s1UpdatedAt: s1.updatedAt,
          s2UpdatedAt: s2.updatedAt,
          copyHasUpdatedAt: "updatedAt" in pageCopy,
          s2PlaintextType: typeof s2.plaintext,
          s2HasPlainText: "plainText" in s2,
          s2HasTiptap: "tiptap" in s2,
          s2HasCharCount: "charCount" in s2,
          s1HasPlainText: "plainText" in s1,
          s1HasTiptap: "tiptap" in s1,
          s1HasCharCount: "charCount" in s1,
          s1Dismissed: s1.dismissedNoiseTerms,
          s2Dismissed: s2.dismissedNoiseTerms,
          copyDismissed: pageCopy.dismissedNoiseTerms,
        });
      }
    const out = JSON.stringify({ batch, reps }, null, 1);
    if (process.env.E4_RESULT_OUT)
      await fs.writeFile(process.env.E4_RESULT_OUT, out, "utf8");
    expect(reps.length).toBe(REPS * VARIANTS.length);
  }, 60_000);
});
