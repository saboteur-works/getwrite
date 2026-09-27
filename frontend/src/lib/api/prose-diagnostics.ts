/**
 * @module api/prose-diagnostics
 *
 * Client transport for a resource's persisted prose diagnostics summary
 * (FR-7 of Feature 62, prose diagnostics): dialogue ratio, average sentence
 * length, and top repeated words. Degrades gracefully: any failure yields
 * {@link EMPTY_PROSE_DIAGNOSTICS} rather than throwing, matching how
 * `mentions.ts`/`entity-alias-table.ts` degrade on read failure, since a
 * diagnostics summary is advisory.
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
