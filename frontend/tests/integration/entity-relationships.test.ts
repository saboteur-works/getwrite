/**
 * Integration test (entity-relationships Task 9): write/read fidelity,
 * idempotency, and the dangling-edge placeholder against a real fixture
 * project.
 *
 * This exercises the full vertical slice end to end against a REAL project
 * on a REAL temp directory on disk — not the in-memory adapter, not a mocked
 * transport. It drives the HTTP route handlers directly (Task 3's `GET`/
 * `POST` and the `remove` route's `POST`, exactly as
 * `entity-relationships-route.test.ts` already does for its own narrower
 * unit-level assertions) against a `GETWRITE_PROJECTS_DIR`-scoped fixture
 * project, and separately calls the real `deleteResourceCore` soft-delete
 * path (`resource-crud-core.ts`) — never a mock or stub of it — to prove
 * FR-16's "touches no edge" claim against the actual on-disk artifact.
 *
 * Two real declared entities (source and target) are created as real
 * resources with real sidecars on disk so the FR-16/FR-11 soft-delete
 * scenario has a genuine entity to delete, mirroring the fixture-building
 * convention `entity-cooccurrence.test.tsx` and `entity-roster.test.tsx`
 * establish (build a fixture through real persistence calls, then exercise
 * the feature under test against it) rather than hand-built fixture objects.
 *
 * All four properties Task 9 requires are asserted against the SAME fixture
 * project in this one test run:
 *
 * (a) Creating an edge via the HTTP route persists it to
 *     `meta/relationships.json` in the shape the model defines, and a
 *     subsequent list read (via the route) returns it.
 * (b) Creating the identical `(source, target, type)` triple a second time
 *     leaves exactly one persisted edge (FR-17) — asserted by reading
 *     `meta/relationships.json` directly off disk, not only via the API
 *     response.
 * (c) Removing an edge by id removes only that edge from the file, leaving a
 *     second edge between the same two entities of a DIFFERENT relationship
 *     type untouched (FR-12) — again verified by reading the file directly.
 * (d) Soft-deleting the source entity of an existing edge (via the real
 *     `deleteResourceCore`/soft-delete path) leaves `meta/relationships.json`
 *     byte-for-byte unchanged (FR-16) — the file's raw bytes are read before
 *     and after the delete and asserted equal. A subsequent list read still
 *     contains the edge naming the now-deleted source, so a UI reading it
 *     would need to render the FR-11 placeholder for the deleted side.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  GET,
  POST,
} from "../../app/api/project/[project-id]/entity-relationships/route";
import { POST as REMOVE } from "../../app/api/project/[project-id]/entity-relationships/remove/route";
import type { EntityRelationshipEdge } from "../../src/lib/models/entity-relationships";
import { deleteResourceCore } from "../../src/lib/models/resource-crud-core";
import { createTextResource } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

/**
 * Builds a real fixture project on disk: a `project.json` with a
 * `relationshipTypes` list, and two real declared entities (source/target)
 * persisted as real resources with real sidecars via the same
 * `writeResourceToFile`/`writeSidecar` persistence path production code
 * uses — not hand-built fixture objects.
 */
async function buildFixtureProject(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
  sourceEntityId: string;
  targetEntityId: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-relationships-integration-"),
  );
  tmpDirs.push(projectsDir);

  const sourceResource = createTextResource({ name: "Priya", plainText: "" });
  const targetResource = createTextResource({ name: "Marcus", plainText: "" });
  const projectId = crypto.randomUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify(
      { config: { relationshipTypes: ["ally", "rival"] } },
      null,
      2,
    ),
    "utf8",
  );

  await writeResourceToFile(projectPath, sourceResource);
  await writeSidecar(projectPath, sourceResource.id, {
    name: "Priya",
    entityKind: "character",
    aliases: [],
  });

  await writeResourceToFile(projectPath, targetResource);
  await writeSidecar(projectPath, targetResource.id, {
    name: "Marcus",
    entityKind: "character",
    aliases: [],
  });

  return {
    projectsDir,
    projectId,
    projectPath,
    sourceEntityId: sourceResource.id,
    targetEntityId: targetResource.id,
  };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

function makeGetRequest(projectId: string): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString());
}

function makePostRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeRemoveRequest(
  projectId: string,
  body: Record<string, unknown>,
): NextRequest {
  const url = new URL(
    `http://localhost/api/project/${projectId}/entity-relationships/remove`,
  );
  return new NextRequest(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function readRelationshipsFileRaw(projectPath: string): Promise<Buffer> {
  return fs.readFile(path.join(projectPath, "meta", "relationships.json"));
}

async function readRelationshipsFileParsed(
  projectPath: string,
): Promise<EntityRelationshipEdge[]> {
  const raw = await readRelationshipsFileRaw(projectPath);
  return JSON.parse(raw.toString("utf8")) as EntityRelationshipEdge[];
}

describe("entity relationships — fixture integration (FR-1, FR-11, FR-12, FR-16, FR-17)", () => {
  it("proves create/read fidelity, FR-17 idempotency, FR-12 targeted removal, and FR-16 soft-delete non-interference in one run", async () => {
    const {
      projectsDir,
      projectId,
      projectPath,
      sourceEntityId,
      targetEntityId,
    } = await buildFixtureProject();

    await withProjectsDirEnv(projectsDir, async () => {
      // --- (a) create via the route persists to meta/relationships.json,
      // and a subsequent list read (via the route) returns it. -------------
      const createRes = await POST(
        makePostRequest(projectId, {
          sourceEntityId,
          targetEntityId,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(createRes.status).toBe(201);
      const allyEdge = (await createRes.json()) as EntityRelationshipEdge;
      expect(allyEdge).toMatchObject({
        sourceEntityId,
        targetEntityId,
        relationshipType: "ally",
      });
      expect(typeof allyEdge.id).toBe("string");
      expect(typeof allyEdge.createdAt).toBe("string");

      const onDiskAfterCreate = await readRelationshipsFileParsed(projectPath);
      expect(onDiskAfterCreate).toEqual([allyEdge]);

      const listAfterCreate = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      expect(listAfterCreate.status).toBe(200);
      const listedAfterCreate =
        (await listAfterCreate.json()) as EntityRelationshipEdge[];
      expect(listedAfterCreate).toEqual([allyEdge]);

      // --- (b) creating the identical triple a second time is a no-op:
      // exactly one persisted edge, verified by reading the file directly,
      // not only the API response (FR-17). ----------------------------------
      const duplicateRes = await POST(
        makePostRequest(projectId, {
          sourceEntityId,
          targetEntityId,
          relationshipType: "ally",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect([200, 201]).toContain(duplicateRes.status);
      const duplicateEdge =
        (await duplicateRes.json()) as EntityRelationshipEdge;
      expect(duplicateEdge).toEqual(allyEdge);

      const onDiskAfterDuplicate =
        await readRelationshipsFileParsed(projectPath);
      expect(onDiskAfterDuplicate).toHaveLength(1);
      expect(onDiskAfterDuplicate).toEqual([allyEdge]);

      // --- Create a SECOND edge between the same two entities but of a
      // DIFFERENT relationship type, to prove (c) below removes only the
      // targeted edge. --------------------------------------------------
      const rivalRes = await POST(
        makePostRequest(projectId, {
          sourceEntityId,
          targetEntityId,
          relationshipType: "rival",
        }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(rivalRes.status).toBe(201);
      const rivalEdge = (await rivalRes.json()) as EntityRelationshipEdge;
      expect(rivalEdge.relationshipType).toBe("rival");
      expect(rivalEdge.id).not.toBe(allyEdge.id);

      const onDiskAfterSecondEdge =
        await readRelationshipsFileParsed(projectPath);
      expect(onDiskAfterSecondEdge).toHaveLength(2);

      // --- (c) removing the "ally" edge by id removes only that edge from
      // the file, leaving the "rival" edge between the same two entities
      // untouched (FR-12) — verified by reading the file directly. --------
      const removeRes = await REMOVE(
        makeRemoveRequest(projectId, { edgeId: allyEdge.id }),
        { params: Promise.resolve({ "project-id": projectId }) },
      );
      expect(removeRes.status).toBe(200);
      const removeJson = await removeRes.json();
      expect(removeJson.removed).toBe(true);

      const onDiskAfterRemove = await readRelationshipsFileParsed(projectPath);
      expect(onDiskAfterRemove).toEqual([rivalEdge]);
      expect(
        onDiskAfterRemove.find((edge) => edge.id === allyEdge.id),
      ).toBeUndefined();
      expect(
        onDiskAfterRemove.find((edge) => edge.id === rivalEdge.id),
      ).toEqual(rivalEdge);

      // --- (d) soft-deleting the source entity of the remaining edge
      // leaves meta/relationships.json byte-for-byte unchanged (FR-16).
      // Read raw bytes before and after the REAL deleteResourceCore call
      // (not a mock) and assert equality. ----------------------------------
      const rawBytesBeforeDelete = await readRelationshipsFileRaw(projectPath);

      await deleteResourceCore(projectId, sourceEntityId);

      // Confirm the delete actually happened (the entity was really
      // soft-deleted, not a no-op that would trivially leave the file
      // unchanged) by checking the sidecar is gone from its live location.
      const sourceSidecarAfterDelete = await readSidecar(
        projectPath,
        sourceEntityId,
      );
      expect(sourceSidecarAfterDelete).toBeNull();

      const rawBytesAfterDelete = await readRelationshipsFileRaw(projectPath);
      expect(rawBytesAfterDelete.equals(rawBytesBeforeDelete)).toBe(true);

      // A subsequent read (via the list route) still contains the edge
      // naming the now-deleted source entity — the edge is left in place,
      // not cleaned up, so a UI reading it would need to render the FR-11
      // placeholder for the deleted side.
      const listAfterDelete = await GET(makeGetRequest(projectId), {
        params: Promise.resolve({ "project-id": projectId }),
      });
      expect(listAfterDelete.status).toBe(200);
      const listedAfterDelete =
        (await listAfterDelete.json()) as EntityRelationshipEdge[];
      expect(listedAfterDelete).toEqual([rivalEdge]);
      expect(
        listedAfterDelete.find(
          (edge) => edge.sourceEntityId === sourceEntityId,
        ),
      ).toEqual(rivalEdge);
    });
  });
});
