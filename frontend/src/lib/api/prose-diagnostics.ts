/**
 * @module api/prose-diagnostics
 *
 * Client transport for a resource's persisted prose diagnostics summary
 * (FR-7 of Feature 62, prose diagnostics): dialogue ratio, average sentence
 * length, and top repeated words. `getProseDiagnostics` degrades gracefully:
 * any failure yields {@link EMPTY_PROSE_DIAGNOSTICS} rather than throwing,
 * matching how `mentions.ts`/`entity-alias-table.ts` degrade on read
 * failure, since a diagnostics summary is advisory.
 *
 * `getProseDiagnosticsOrThrow` (Task 14, FR-4/FR-7) is the one exception to
 * that degrade-gracefully contract: it rejects on the identical set of
 * failures `getProseDiagnostics` degrades on (network error, non-2xx
 * response including a locked project's 401/409, or a malformed body),
 * mirroring `entity-relationships.ts`'s `listOrThrow` — added for the one
 * caller (`ProseDiagnosticsSection.tsx`) that must distinguish "this
 * resource genuinely has zero metrics" from "the read failed," so the two
 * cases can render distinguishably rather than both collapsing into the
 * same zeroed display. `getProseDiagnostics` itself is unchanged by this
 * addition, and `getProseDiagnosticsDetail` (a separate, unrelated read) is
 * out of scope and keeps its own degrade-only contract.
 */
import { createTransport } from "../../store/transport/create-transport";
import {
  ProseDiagnosticsDetailResponseSchema,
  ProseDiagnosticsResponseSchema,
} from "./schemas";
import {
  reportTransportReadFailure,
  reportTransportValidationFailure,
} from "./transport-validation";

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021 Phase 2 parity)
//
// One ProseDiagnosticsTransport contract with two implementations selected
// by the build-time runtime, mirroring lib/api/mentions.ts:
//
// - Web/hosted/desktop -> httpProseDiagnosticsTransport, which fetches the
//   Task 4 HTTP route.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-prose-diagnostics-backend`), dynamically
//   imported only when `runtime === "native"`, resolving the same
//   diagnostics-index/indexer-queue model functions directly rather than
//   over HTTP.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/** A resource's persisted prose diagnostics summary (FR-7). */
export interface ProseDiagnosticsSummary {
  dialogueRatio: number;
  averageSentenceLength: number;
  topRepeatedWords: { word: string; count: number }[];
}

/**
 * A resource's on-demand, never-persisted located repeated-word detail
 * (FR-5/FR-8): one entry per repeated-word phrase `topRepeatedWords`
 * surfaces, plus every character offset within the resource's persisted
 * plain text at which it occurs.
 */
export interface LocatedRepeatedWordResult {
  word: string;
  count: number;
  offsets: number[];
}

/**
 * The diagnostics-route-backed operations both platforms implement. Shared
 * with `../../store/transport/native-prose-diagnostics-backend`, which
 * imports this type rather than duplicating it.
 */
export interface ProseDiagnosticsTransport {
  /**
   * Fetches `resourceId`'s persisted prose diagnostics summary, rebuilding
   * it first if missing or stale. Degrades gracefully: any failure yields
   * {@link EMPTY_PROSE_DIAGNOSTICS} rather than throwing.
   */
  getProseDiagnostics(
    projectId: string,
    resourceId: string,
  ): Promise<ProseDiagnosticsSummary>;

  /**
   * Fetches `resourceId`'s persisted prose diagnostics summary, identically
   * to {@link getProseDiagnostics}, except it REJECTS on any failure
   * (network error, non-2xx response including a locked project's
   * 401/409, or a malformed body) instead of degrading to
   * {@link EMPTY_PROSE_DIAGNOSTICS} (Task 14, FR-4/FR-7). Exists so a caller
   * that must distinguish "zero metrics" from "the read failed" —
   * `ProseDiagnosticsSection.tsx` — has a way to do so.
   */
  getProseDiagnosticsOrThrow(
    projectId: string,
    resourceId: string,
  ): Promise<ProseDiagnosticsSummary>;

  /**
   * Fetches `resourceId`'s on-demand located repeated-word detail (FR-8),
   * computed fresh from its persisted plain text on every call and never
   * persisted. Degrades gracefully: any failure yields
   * {@link EMPTY_PROSE_DIAGNOSTICS_DETAIL} rather than throwing.
   */
  getProseDiagnosticsDetail(
    projectId: string,
    resourceId: string,
  ): Promise<LocatedRepeatedWordResult[]>;
}

/** The zeroed default returned on any read failure, or for a resource with no content. */
export const EMPTY_PROSE_DIAGNOSTICS: ProseDiagnosticsSummary = {
  dialogueRatio: 0,
  averageSentenceLength: 0,
  topRepeatedWords: [],
};

/** The empty default returned by {@link getProseDiagnosticsDetail} on any read failure. */
export const EMPTY_PROSE_DIAGNOSTICS_DETAIL: LocatedRepeatedWordResult[] = [];

/**
 * HTTP transport — the hosted/desktop path. Fetches the Task 4 route,
 * validates the response body against `ProseDiagnosticsResponseSchema`, and
 * degrades to {@link EMPTY_PROSE_DIAGNOSTICS} on any failure (non-2xx,
 * network error, or malformed body).
 */
export const httpProseDiagnosticsTransport: ProseDiagnosticsTransport = {
  async getProseDiagnostics(projectId, resourceId) {
    try {
      const response = await fetch(
        `/api/resource/${encodeURIComponent(resourceId)}/diagnostics?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!response.ok) {
        reportTransportReadFailure("prose-diagnostics.getProseDiagnostics", {
          kind: "http",
          status: response.status,
        });
        return EMPTY_PROSE_DIAGNOSTICS;
      }
      const data: unknown = await response.json();
      const result = ProseDiagnosticsResponseSchema.safeParse(data);
      if (!result.success) {
        reportTransportValidationFailure(
          "prose-diagnostics.getProseDiagnostics",
          result.error.issues,
        );
        return EMPTY_PROSE_DIAGNOSTICS;
      }
      return result.data;
    } catch {
      reportTransportReadFailure("prose-diagnostics.getProseDiagnostics", {
        kind: "network",
      });
      return EMPTY_PROSE_DIAGNOSTICS;
    }
  },

  async getProseDiagnosticsOrThrow(projectId, resourceId) {
    const response = await fetch(
      `/api/resource/${encodeURIComponent(resourceId)}/diagnostics?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to load prose diagnostics (status ${response.status}).`,
      );
    }
    const data: unknown = await response.json();
    const result = ProseDiagnosticsResponseSchema.safeParse(data);
    if (!result.success) {
      reportTransportValidationFailure(
        "prose-diagnostics.getProseDiagnosticsOrThrow",
        result.error.issues,
      );
      throw new Error("Malformed prose diagnostics response.");
    }
    return result.data;
  },

  async getProseDiagnosticsDetail(projectId, resourceId) {
    try {
      const response = await fetch(
        `/api/resource/${encodeURIComponent(resourceId)}/diagnostics-detail?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!response.ok) {
        reportTransportReadFailure(
          "prose-diagnostics.getProseDiagnosticsDetail",
          { kind: "http", status: response.status },
        );
        return EMPTY_PROSE_DIAGNOSTICS_DETAIL;
      }
      const data: unknown = await response.json();
      const result = ProseDiagnosticsDetailResponseSchema.safeParse(data);
      if (!result.success) {
        reportTransportValidationFailure(
          "prose-diagnostics.getProseDiagnosticsDetail",
          result.error.issues,
        );
        return EMPTY_PROSE_DIAGNOSTICS_DETAIL;
      }
      return result.data.locatedRepeatedWords;
    } catch {
      reportTransportReadFailure(
        "prose-diagnostics.getProseDiagnosticsDetail",
        { kind: "network" },
      );
      return EMPTY_PROSE_DIAGNOSTICS_DETAIL;
    }
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-prose-diagnostics-backend")`
 * specifier so Turbopack's `resolveAlias` (`next.config.mjs`) can substitute
 * a `node:*`-free web-stub for it at build time.
 */
export const resolveProseDiagnosticsTransport: () => Promise<ProseDiagnosticsTransport> =
  createTransport(httpProseDiagnosticsTransport, () =>
    import("../../store/transport/native-prose-diagnostics-backend").then(
      ({ createNativeProseDiagnosticsTransport }) =>
        createNativeProseDiagnosticsTransport(),
    ),
  );

/**
 * Fetches `resourceId`'s persisted prose diagnostics summary (FR-7),
 * rebuilding it first if missing or stale.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param resourceId - The resource whose diagnostics are being looked up.
 * @returns The diagnostics summary, or {@link EMPTY_PROSE_DIAGNOSTICS} on
 *   any failure.
 */
export async function getProseDiagnostics(
  projectId: string,
  resourceId: string,
): Promise<ProseDiagnosticsSummary> {
  const transport = await resolveProseDiagnosticsTransport();
  return transport.getProseDiagnostics(projectId, resourceId);
}

/**
 * Fetches `resourceId`'s persisted prose diagnostics summary (FR-7),
 * identically to {@link getProseDiagnostics}, except it REJECTS on any
 * failure (network error, non-2xx response, or a malformed body) instead of
 * resolving to {@link EMPTY_PROSE_DIAGNOSTICS} (Task 14, FR-4/FR-7).
 *
 * @param projectId - The project's on-disk directory basename.
 * @param resourceId - The resource whose diagnostics are being looked up.
 * @returns The diagnostics summary on success; rejects on any failure.
 */
export async function getProseDiagnosticsOrThrow(
  projectId: string,
  resourceId: string,
): Promise<ProseDiagnosticsSummary> {
  const transport = await resolveProseDiagnosticsTransport();
  return transport.getProseDiagnosticsOrThrow(projectId, resourceId);
}

/**
 * Fetches `resourceId`'s on-demand located repeated-word detail (FR-8),
 * computed fresh from its persisted plain text on every call and never
 * persisted.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param resourceId - The resource whose located detail is being looked up.
 * @returns The located repeated-word list, or
 *   {@link EMPTY_PROSE_DIAGNOSTICS_DETAIL} on any failure.
 */
export async function getProseDiagnosticsDetail(
  projectId: string,
  resourceId: string,
): Promise<LocatedRepeatedWordResult[]> {
  const transport = await resolveProseDiagnosticsTransport();
  return transport.getProseDiagnosticsDetail(projectId, resourceId);
}
