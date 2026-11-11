/**
 * @module claim-display
 *
 * Pure display model and filters for the claim ledger (Feature 108, FR-6,
 * FR-9, FR-10, FR-12, FR-13, FR-16). No React, no I/O.
 *
 * - "Unsourced" is derived from there being no `target`; it is never stored.
 * - A stored status off the four-status list is reported as stored with
 *   `isStatusOffList: true`; it is never rewritten and matches no status
 *   filter except "all".
 * - The status date is the local calendar date of `claim.statusChangedAt`.
 * - Source state reuses `deriveCitationTargetState`. A claim with a target
 *   whose facts were not supplied or could not be read is `unchecked`: it is
 *   neither sourced nor unsourced.
 * - With the module off a claim is an ordinary note: its statement is the
 *   body and no marker, status or Source line is reported.
 */
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  type ClaimStatus,
} from "./models/claim-types";
import {
  deriveCitationTargetState,
  type CitationTargetFacts,
} from "./models/citation-target-state";
import type { Annotation } from "./models/types";

/** Where a claim's Source is, as shown to the writer. */
type ClaimSourceState =
  | "none"
  | "present"
  | "removed"
  | "permanently-deleted"
  | "unchecked";

/** Facts about the Source, or `"unreadable"` when they could not be read. */
export type ClaimSourceFacts = CitationTargetFacts | "unreadable";

export interface ClaimDisplayOptions {
  moduleEnabled: boolean;
  /** Needed to resolve a claim that has a `target`; absent reads as unchecked. */
  sourceFacts?: ClaimSourceFacts;
}

export interface ClaimDisplayModel {
  kind: "claim";
  statement: string;
  quote: string;
  /** The status exactly as stored. */
  statusId: string;
  /** The label for a listed status; the stored value for an off-list one. */
  statusLabel: string;
  isStatusOffList: boolean;
  /** Local calendar date (YYYY-MM-DD); undefined when the timestamp is unreadable. */
  statusDate: string | undefined;
  /** True only when there is no link at all. */
  isUnsourced: boolean;
  /** True when a link exists and its state was read. */
  isSourced: boolean;
  sourceState: ClaimSourceState;
  /** Saved name (or current name when none was saved); may be undefined. */
  sourceName: string | undefined;
  /** An attachment or excerpt of the Source is gone. */
  sourcePartRemoved: boolean;
}

interface NoteDisplayModel {
  kind: "note";
  body: string;
}

export type ClaimDisplay = ClaimDisplayModel | NoteDisplayModel;

export type ClaimStatusFilter = ClaimStatus | "all";
export type ClaimSourcedFilter = "all" | "sourced" | "unsourced";

export interface ClaimFilters {
  status: ClaimStatusFilter;
  sourced: ClaimSourcedFilter;
}

export const NO_CLAIM_FILTERS: ClaimFilters = { status: "all", sourced: "all" };

function isListedStatus(status: string): status is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(status);
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp, or undefined if unreadable. */
export function formatLocalDate(iso: string): string | undefined {
  const d = new Date(iso);
  if (iso === "" || Number.isNaN(d.getTime())) return undefined;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

interface SourceView {
  state: ClaimSourceState;
  name: string | undefined;
  partRemoved: boolean;
}

function deriveSource(
  annotation: Annotation,
  facts: ClaimSourceFacts | undefined,
): SourceView {
  const target = annotation.target;
  if (target === undefined) {
    return { state: "none", name: undefined, partRemoved: false };
  }
  if (facts === undefined || facts === "unreadable") {
    return { state: "unchecked", name: target.sourceName, partRemoved: false };
  }
  const view = deriveCitationTargetState(target, facts);
  const state: ClaimSourceState =
    view.state === "source-in-trash"
      ? "removed"
      : view.state === "source-purged"
        ? "permanently-deleted"
        : "present";
  return {
    state,
    name: view.displayName,
    partRemoved:
      view.state === "attachment-removed" || view.state === "excerpt-removed",
  };
}

/** Derive what the panel and the Claims tab show for one annotation. Pure. */
export function deriveClaimDisplay(
  annotation: Annotation,
  options: ClaimDisplayOptions,
): ClaimDisplay {
  if (!options.moduleEnabled || annotation.claim === undefined) {
    return { kind: "note", body: annotation.body };
  }
  const status = annotation.claim.status;
  const isListed = isListedStatus(status);
  const source = deriveSource(annotation, options.sourceFacts);
  return {
    kind: "claim",
    statement: annotation.body,
    quote: annotation.quote,
    statusId: status,
    statusLabel: isListed ? CLAIM_STATUS_LABELS[status] : status,
    isStatusOffList: !isListed,
    statusDate: formatLocalDate(annotation.claim.statusChangedAt),
    isUnsourced: source.state === "none",
    isSourced: source.state !== "none" && source.state !== "unchecked",
    sourceState: source.state,
    sourceName: source.name,
    sourcePartRemoved: source.partRemoved,
  };
}

/** Keep the claims that match every active filter. Pure; input is not changed. */
export function applyClaimFilters(
  claims: readonly ClaimDisplayModel[],
  filters: ClaimFilters,
): ClaimDisplayModel[] {
  return claims.filter((c) => {
    if (filters.status !== "all" && c.statusId !== filters.status) return false;
    if (filters.sourced === "sourced" && !c.isSourced) return false;
    if (filters.sourced === "unsourced" && !c.isUnsourced) return false;
    return true;
  });
}

/** The active filters as text, so the state is never colour alone. */
export function describeActiveClaimFilters(filters: ClaimFilters): string {
  const parts: string[] = [];
  if (filters.status !== "all") {
    parts.push(`Status: ${CLAIM_STATUS_LABELS[filters.status]}`);
  }
  if (filters.sourced === "sourced") parts.push("Sourced");
  if (filters.sourced === "unsourced") parts.push("Unsourced");
  return parts.length === 0 ? "All claims" : parts.join("; ");
}

/** The message for an empty list: no claims at all, or none matching the filters. */
export function describeEmptyClaimResult(
  filters: ClaimFilters,
  totalClaims: number,
): string {
  if (totalClaims === 0) return "There are no claims.";
  return `No claim matches the filters (${describeActiveClaimFilters(filters)}).`;
}
