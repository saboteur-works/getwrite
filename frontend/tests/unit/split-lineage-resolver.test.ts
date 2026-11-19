/**
 * Feature 120, Task 14: the pure lineage-state resolver (FR-15). The fixtures
 * are sets of stored paths laid out as `experiments/task-3.md` measured them
 * (live sidecar, live revision folder, `.trash/meta` sidecar, `.trash/revisions`
 * folder); a helper turns a set into the probe results the resolver takes, so
 * the resolver itself does no I/O.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveSplitLineageState,
  type SplitLineageProbe,
  type SplitLineageResolverInput,
} from "../../src/lib/models/split-lineage-resolver";
import {
  SPLIT_LINEAGE_STATES,
  type SplitLineageRecord,
} from "../../src/lib/models/split-types";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

const RECORD: SplitLineageRecord = {
  sourceDocumentId: SOURCE_ID,
  sourceRevisionId: "rev-snapshot",
  sourceRevisionNumber: 3,
  operation: "split",
  date: "2026-11-16T10:00:00.000Z",
};

const LIVE_SIDECAR = `meta/resource-${SOURCE_ID}.meta.json`;
const LIVE_REVISION = `revisions/${SOURCE_ID}/v-3`;
const TRASH_SIDECAR = `.trash/meta/resource-${SOURCE_ID}.meta.json`;
const TRASH_REVISIONS = `.trash/revisions/${SOURCE_ID}`;

/** A stored-path set stands in for a project directory. */
function probeOf(
  stored: ReadonlySet<string>,
  target: string,
  failing: ReadonlySet<string>,
): SplitLineageProbe {
  if (failing.has(target)) {
    return { read: "failed", cause: `read of ${target} failed` };
  }
  return stored.has(target) ? { read: "present" } : { read: "absent" };
}

function inputFor(
  paths: string[],
  failing: string[] = [],
): SplitLineageResolverInput {
  const stored = new Set(paths);
  const bad = new Set(failing);
  return {
    record: RECORD,
    liveDocument: probeOf(stored, LIVE_SIDECAR, bad),
    liveSnapshotRevision: probeOf(stored, LIVE_REVISION, bad),
    trashedDocument: probeOf(stored, TRASH_SIDECAR, bad),
    trashedRevisions: probeOf(stored, TRASH_REVISIONS, bad),
  };
}

describe("resolveSplitLineageState", () => {
  it("is available when the document and its snapshot revision are stored", () => {
    expect(
      resolveSplitLineageState(inputFor([LIVE_SIDECAR, LIVE_REVISION])),
    ).toEqual({ state: "available" });
  });

  it("reports the revision no longer kept when the document is live and the snapshot revision is deleted", () => {
    expect(resolveSplitLineageState(inputFor([LIVE_SIDECAR]))).toEqual({
      state: "revision-no-longer-kept",
    });
  });

  it("reports the document in Trash when its sidecar and revisions are under .trash", () => {
    expect(
      resolveSplitLineageState(inputFor([TRASH_SIDECAR, TRASH_REVISIONS])),
    ).toEqual({ state: "document-in-trash" });
  });

  it("reports the document in Trash when only its trashed revisions remain", () => {
    expect(resolveSplitLineageState(inputFor([TRASH_REVISIONS]))).toEqual({
      state: "document-in-trash",
    });
  });

  it("reports the document permanently removed when nothing of it is stored", () => {
    expect(resolveSplitLineageState(inputFor([]))).toEqual({
      state: "document-permanently-removed",
    });
  });

  it("reports could-not-be-checked with a cause when a read failed, never as removed", () => {
    const failed = resolveSplitLineageState(inputFor([], [LIVE_SIDECAR]));
    const empty = resolveSplitLineageState(inputFor([]));
    expect(failed).toEqual({
      state: "could-not-be-checked",
      cause: `read of ${LIVE_SIDECAR} failed`,
    });
    expect(failed.state).not.toBe(empty.state);
  });

  it("does not report a failed trash read as removed, nor a failed revision read as available", () => {
    expect(
      resolveSplitLineageState(inputFor([], [TRASH_REVISIONS])).state,
    ).toBe("could-not-be-checked");
    expect(
      resolveSplitLineageState(inputFor([LIVE_SIDECAR], [LIVE_REVISION])).state,
    ).toBe("could-not-be-checked");
  });

  it("does not let a failed trash read hide a live, available document", () => {
    expect(
      resolveSplitLineageState(
        inputFor([LIVE_SIDECAR, LIVE_REVISION], [TRASH_SIDECAR]),
      ),
    ).toEqual({ state: "available" });
  });

  it("returns exactly the five states of FR-15 across the fixtures", () => {
    const outcomes = [
      inputFor([LIVE_SIDECAR, LIVE_REVISION]),
      inputFor([LIVE_SIDECAR]),
      inputFor([TRASH_SIDECAR]),
      inputFor([]),
      inputFor([], [LIVE_SIDECAR]),
    ].map((input) => resolveSplitLineageState(input).state);
    expect(new Set(outcomes)).toEqual(new Set(SPLIT_LINEAGE_STATES));
  });

  it("is a pure file: no I/O, rendering or display imports", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/lib/models/split-lineage-resolver.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](?:node:|fs|react)/);
    expect(source).not.toMatch(/readFile|writeFile|toast|JSX/i);
  });
});
