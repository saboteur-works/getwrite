import { vi, beforeEach, afterEach } from "vitest";
// Every constant below is imported from its own module rather than
// hand-typed here, deliberately: a hand-typed stand-in silently drifted
// from the real default once already (`entity-graph-settings` answered
// `[]` instead of `DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES`), and importing
// the real constant is what makes that class of bug impossible rather than
// merely unlikely.
import { DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES } from "../../src/lib/models/entity-graph-connection-types";
import { DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS } from "../../src/lib/models/entity-graph-settings-core";
import { EMPTY_ALIAS_TABLE } from "../../src/lib/api/entity-alias-table";
import {
  EMPTY_PROSE_DIAGNOSTICS,
  EMPTY_PROSE_DIAGNOSTICS_DETAIL,
} from "../../src/lib/api/prose-diagnostics";

/**
 * A plain `vi.fn()` `fetch` stub answering `{}` to every request is what
 * most `AppShell`-mounting tests use when they don't care about network
 * traffic — but several sidebar/editor sections `AppShell` always mounts
 * (noise-word lists, the entity alias table, prose diagnostics) validate
 * their own response shape (`transport-validation.ts`) and log a console
 * error when it doesn't match, so that catch-all `{}` makes every one of
 * those sections noisy on every single `AppShell` test, regardless of what
 * the test itself is checking.
 *
 * This stub answers those specific endpoints with a real, validating shape
 * and falls back to the same `{}` for everything else, so a test that
 * doesn't care about these sections doesn't have to say so file by file.
 *
 * The validating shape for each endpoint is deliberately the SAME value its
 * own transport module degrades to on a real read failure — imported from
 * that module's own exported `EMPTY_*`/`DEFAULT_*` constant wherever one
 * exists, not an arbitrary value hand-typed here, so this stub can't drift
 * from the real default the way it once did (see the import block's own
 * comment above). A schema-bare-array endpoint with no named constant
 * (`entity-backlink-edges`, `entity-relationships`, etc.) still hand-types
 * `[]` — there's only one plausible empty value for an array, so there's
 * nothing for a hand-typed `[]` to drift from. The risk is specific to a
 * default with more than one plausible "empty" shape, which is exactly
 * what `entity-graph-settings` has (`[]` was plausible-looking and wrong).
 * This way, a component fed through this stub renders the same thing it
 * would have shown if its own read had simply failed gracefully. One pair of
 * endpoints doesn't have a degrade-to-default: `getTodayWritingLog`
 * (writing-log) and `getProseDiagnosticsOrThrow` (prose-diagnostics) reject
 * on any failure, by design, rather than degrading — their callers
 * (`WritingLogFooterDisplay.tsx`, `ProseDiagnosticsSection.tsx`) catch that
 * rejection locally and render an explicit error state ("Today's count is
 * unavailable", "Couldn't load diagnostics."). This stub answers both with
 * a real, valid, zeroed response instead, so a test that incidentally
 * mounts either section (without its own mock) sees that section's genuine
 * ready state rather than an error state that was never an intentional test
 * scenario — only ever a side effect of the old, invalid `{}` catch-all.
 * Confirmed via a direct before/after render diff (not merely reasoned
 * about): the old stub rendered "Today's count is unavailable" / "Couldn't
 * load diagnostics. Try again later."; this one renders "Today: 0" /
 * "Dialogue ratio: 0% / Average sentence length: 0.0 / Top repeated words:
 * None". No test in this suite asserts on either string.
 *
 * Most callers want {@link setupAppShellFetchStub} instead of calling this
 * directly — it wires the `beforeEach`/`afterEach` pair below for you. Use
 * this lower-level function directly only when the stub needs to start
 * outside the normal per-test lifecycle (e.g. `TrashView.test.tsx` installs
 * it from inside its own, already-combined `beforeEach`, alongside other
 * per-test mock resets).
 */
export function stubAppShellFetch(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    // Branches below are checked in order via unanchored `url.includes(...)`,
    // so a new branch whose path is a substring of (or contains) an
    // existing one must be ordered carefully — `/diagnostics-detail` is
    // checked before `/diagnostics` for exactly this reason, since the
    // latter would otherwise match first. `appShellFetchStub.contract.test
    // .ts` is what actually guards this: a branch that silently started
    // matching the wrong URL would answer the wrong shape, which that test
    // checks against each endpoint's own real default.
    if (url.includes("/api/project/noise-words")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          customNoiseWords: [],
          excludedGlobalNoiseWords: [],
        }),
        text: async () => "",
      } as Response;
    }
    if (url.includes("/api/global-noise-words")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "",
      } as Response;
    }
    if (url.includes("/entity-alias-table")) {
      return {
        ok: true,
        status: 200,
        json: async () => EMPTY_ALIAS_TABLE,
        text: async () => "",
      } as Response;
    }
    if (url.includes("/diagnostics-detail")) {
      // The HTTP response wraps the array (`ProseDiagnosticsDetailResponseSchema`
      // is `{ locatedRepeatedWords: [...] }`), unlike `getProseDiagnosticsDetail`'s
      // own unwrapped return type — answering the bare array here fails
      // validation. The contract test caught exactly this.
      return {
        ok: true,
        status: 200,
        json: async () => ({
          locatedRepeatedWords: EMPTY_PROSE_DIAGNOSTICS_DETAIL,
        }),
        text: async () => "",
      } as Response;
    }
    if (url.includes("/diagnostics")) {
      return {
        ok: true,
        status: 200,
        json: async () => EMPTY_PROSE_DIAGNOSTICS,
        text: async () => "",
      } as Response;
    }
    // The Graph tab (`EntityRelationshipGraphView.tsx`) pulls from several
    // more endpoints, each with its own response-validation schema — all
    // bare-array or small-object shapes, so an empty-but-valid stand-in for
    // each here keeps any AppShell test that happens to mount the Graph tab
    // from tripping the same noise as the sections above.
    if (url.includes("/entity-backlink-edges")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "",
      } as Response;
    }
    if (url.includes("/entity-shared-metadata-edges")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "",
      } as Response;
    }
    if (url.includes("/entity-relationships")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "",
      } as Response;
    }
    if (url.includes("/entity-graph-kind-styles")) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => "",
      } as Response;
    }
    if (url.includes("/entity-graph-settings")) {
      // Matches `DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES` — the same fallback
      // `EntityRelationshipGraphView.tsx`'s own catch block degrades to on a
      // real read failure, so a valid response here doesn't *also* need to
      // change what the graph shows by default (an empty list here would:
      // zero active connection types is a materially different graph than
      // the default authored+cooccurrence pair).
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entityGraphConnectionTypes: DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
          entityGraphFocalHopRadius: DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS,
        }),
        text: async () => "",
      } as Response;
    }
    if (url.includes("/writing-log")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totals: { added: 0, deleted: 0, net: 0 },
          imported: { added: 0, deleted: 0, net: 0 },
          incomplete: false,
        }),
        text: async () => "",
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    } as Response;
  }) as unknown as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Installs {@link stubAppShellFetch} for every test in the current suite —
 * the `beforeEach`/`afterEach` pair that was, until now, copy-pasted
 * identically into every `AppShell`-mounting test file. Call it once,
 * anywhere a `beforeEach`/`afterEach` call is valid (inside a `describe`,
 * or at a file's top level) — it's additive, so a file with its own extra
 * per-test setup (resetting an unrelated mock, seeding a variable) keeps
 * its own `beforeEach`/`afterEach` alongside this one rather than folding
 * everything into a single call.
 *
 *     setupAppShellFetchStub();
 *
 *     it("...", () => { ... });
 */
export function setupAppShellFetchStub(): void {
  let restoreFetch: () => void;
  beforeEach(() => {
    restoreFetch = stubAppShellFetch();
  });
  afterEach(() => {
    restoreFetch();
  });
}
