/**
 * Contract test for `stubAppShellFetch`.
 *
 * `appShellFetchStub.ts` exists to answer each noisy endpoint with the same
 * value its own transport module would produce on a real read failure, so a
 * component mounted through it renders its genuine ready/degraded state
 * rather than an arbitrary stand-in. That equivalence is exactly the kind of
 * thing that can drift silently when the stub is next edited by hand — it
 * already did once (`entity-graph-settings` answered `[]` instead of the
 * real `DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES` default) with nothing to
 * catch it until a render was diffed by hand.
 *
 * This file calls each real `lib/api/*` function through the stub and
 * checks its result against that module's own exported default/empty
 * constant (not a second hand-typed copy of the value), so a future edit to
 * the stub that reintroduces a mismatch fails a test instead of only
 * showing up in an unrelated AppShell test's rendered output.
 *
 * Coverage is scoped to this stub specifically, not to every AppShell test:
 * a file that mocks the underlying `lib/api/*` module directly (several
 * `appShell*.test.tsx` files do, for their own per-test control) never
 * exercises this stub's branch for that endpoint at all, so a shape drift
 * there wouldn't be caught by an AppShell render either way — only by this
 * file, or by that test file's own assertions.
 */
import { describe, it, expect } from "vitest";
import { setupAppShellFetchStub } from "./appShellFetchStub";
import { getNoiseWordLists } from "../../src/lib/api/project-noise-words";
import { getGlobalNoiseWords } from "../../src/lib/api/global-noise-words";
import {
  getEntityAliasTable,
  EMPTY_ALIAS_TABLE,
} from "../../src/lib/api/entity-alias-table";
import { getEntityBacklinkEdges } from "../../src/lib/api/entity-backlink-edges";
import { getEntitySharedMetadataEdges } from "../../src/lib/api/entity-shared-metadata-edges";
import { listEntityRelationships } from "../../src/lib/api/entity-relationships";
import { getEntityGraphKindStyles } from "../../src/lib/api/entity-graph-kind-styles";
import { getEntityGraphSettings } from "../../src/lib/api/entity-graph-settings";
import { DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES } from "../../src/lib/models/entity-graph-connection-types";
import { DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS } from "../../src/lib/models/entity-graph-settings-core";
import { getTodayWritingLog } from "../../src/lib/api/writing-log";
import {
  getProseDiagnostics,
  getProseDiagnosticsOrThrow,
  getProseDiagnosticsDetail,
  EMPTY_PROSE_DIAGNOSTICS,
  EMPTY_PROSE_DIAGNOSTICS_DETAIL,
} from "../../src/lib/api/prose-diagnostics";

const PROJECT_ID = "proj-stub-contract";
const RESOURCE_ID = "res-stub-contract";

describe("stubAppShellFetch — each answer matches its module's own degrade-default", () => {
  setupAppShellFetchStub();

  it("project-noise-words: resolves to empty lists", async () => {
    await expect(getNoiseWordLists(PROJECT_ID)).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("global-noise-words: resolves to an empty list", async () => {
    await expect(getGlobalNoiseWords()).resolves.toEqual([]);
  });

  it("entity-alias-table: matches EMPTY_ALIAS_TABLE", async () => {
    await expect(getEntityAliasTable(PROJECT_ID)).resolves.toEqual(
      EMPTY_ALIAS_TABLE,
    );
  });

  it("entity-backlink-edges: resolves to an empty list", async () => {
    await expect(getEntityBacklinkEdges(PROJECT_ID)).resolves.toEqual([]);
  });

  it("entity-shared-metadata-edges: resolves to an empty list", async () => {
    await expect(getEntitySharedMetadataEdges(PROJECT_ID)).resolves.toEqual([]);
  });

  it("entity-relationships: resolves to an empty list", async () => {
    await expect(listEntityRelationships(PROJECT_ID)).resolves.toEqual([]);
  });

  it("entity-graph-kind-styles: resolves to an empty list", async () => {
    await expect(getEntityGraphKindStyles(PROJECT_ID)).resolves.toEqual([]);
  });

  it("entity-graph-settings: matches DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES and DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS — the actual bug this test file exists to catch", async () => {
    await expect(getEntityGraphSettings(PROJECT_ID)).resolves.toEqual({
      entityGraphConnectionTypes: DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
      entityGraphFocalHopRadius: DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS,
    });
  });

  // writing-log and prose-diagnostics' `OrThrow` variant reject rather than
  // degrade on a real failure (see appShellFetchStub.ts's own doc comment)
  // — there's no "empty default" for these two to match, so the contract
  // this stub owes them is narrower: resolve, rather than throw, with a
  // realistic zeroed value.
  it("writing-log: resolves (does not reject) with a zeroed aggregate", async () => {
    await expect(getTodayWritingLog(PROJECT_ID)).resolves.toMatchObject({
      totals: { added: 0, deleted: 0, net: 0 },
      incomplete: false,
    });
  });

  it("prose-diagnostics (degrading variant): matches EMPTY_PROSE_DIAGNOSTICS", async () => {
    await expect(getProseDiagnostics(PROJECT_ID, RESOURCE_ID)).resolves.toEqual(
      EMPTY_PROSE_DIAGNOSTICS,
    );
  });

  it("prose-diagnostics (OrThrow variant): resolves (does not reject)", async () => {
    await expect(
      getProseDiagnosticsOrThrow(PROJECT_ID, RESOURCE_ID),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS);
  });

  it("prose-diagnostics detail: matches EMPTY_PROSE_DIAGNOSTICS_DETAIL", async () => {
    await expect(
      getProseDiagnosticsDetail(PROJECT_ID, RESOURCE_ID),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS_DETAIL);
  });
});
