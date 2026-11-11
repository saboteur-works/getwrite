/**
 * Feature 108, Task 27 (FR-19): a claim's statement is found by search like an
 * annotation body, as a hit with `snippetKind: "note"`, whether the claims
 * module is on or off; status and Source are not query fields. Real files,
 * real indexer, real `addClaimCore`; nothing is mocked.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { addClaimCore } from "../../src/lib/models/claims-add-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  writeRevision,
  setCanonicalRevision,
} from "../../src/lib/models/revision";
import { indexResource } from "../../src/lib/models/inverted-index";
import { executeSearch } from "../../src/lib/search/execute-search";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let resourceId = "";

async function writeProjectJson(
  modules: Record<string, boolean> | undefined,
): Promise<void> {
  const base = createProject({ name: "claim-search" });
  // Serialised straight to project.json; no `Project` annotation is needed.
  const project = {
    ...base,
    id: projectId,
    config: { ...base.config, ...(modules === undefined ? {} : { modules }) },
  };
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(project),
    "utf8",
  );
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-claim-search-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await writeProjectJson(undefined);
  resourceId = generateUUID();
  const content = "The quick brown fox crossed the river at dawn.";
  await writeSidecar(projectRoot, resourceId, {
    id: resourceId,
    slug: "chapter",
    type: "text",
    name: "Chapter",
    orderIndex: 0,
    folderId: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    wordCount: 9,
  } as Record<string, MetadataValue>);
  const revision = await writeRevision(projectRoot, resourceId, 1, content, {
    isCanonical: true,
  });
  await setCanonicalRevision(projectRoot, resourceId, revision.versionNumber);
  await indexResource(projectRoot, {
    id: resourceId,
    name: "Chapter",
    type: "text",
    slug: "chapter",
    orderIndex: 0,
    createdAt: "1970-01-01T00:00:00.000Z",
    plainText: content,
  });
  await flushIndexer();
});

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

async function addClaim(statement: string, target?: unknown): Promise<void> {
  await addClaimCore(projectId, resourceId, {
    id: generateUUID(),
    statement,
    quote: "quick brown",
    ...(target === undefined ? {} : { target }),
  });
  await flushIndexer();
}

describe("a claim statement in search (FR-19)", () => {
  it.each([
    ["absent (default)", undefined],
    ["on", { claims: true }],
    ["off", { claims: false }],
  ])("is found with snippetKind note, module %s", async (_label, modules) => {
    await writeProjectJson(modules);
    await addClaim("The zeppelin hangar burned down in 1937");
    const results = await executeSearch(projectRoot, "zeppelin", {}, 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.resourceId).toBe(resourceId);
    expect(results[0]!.snippetKind).toBe("note");
    expect(results[0]!.snippet).toContain("zeppelin hangar");
  });

  it("does not match on the status identifier or label", async () => {
    await addClaim("The zeppelin hangar burned down in 1937");
    for (const query of ["unverified", "Unverified", "verified"]) {
      const results = await executeSearch(projectRoot, query, {}, 10);
      expect(results).toEqual([]);
    }
  });

  it("does not match on the linked Source id or name", async () => {
    const sourceId = generateUUID();
    await addClaim("The zeppelin hangar burned down in 1937", {
      sourceId,
      sourceName: "Dockyard Ledger",
    });
    expect(await executeSearch(projectRoot, "Dockyard", {}, 10)).toEqual([]);
    expect(await executeSearch(projectRoot, sourceId, {}, 10)).toEqual([]);
  });

  it("the status filter of search does not see a claim status", async () => {
    await addClaim("The zeppelin hangar burned down in 1937");
    const results = await executeSearch(
      projectRoot,
      "zeppelin",
      { status: "unverified" },
      10,
    );
    expect(results).toEqual([]);
  });
});
