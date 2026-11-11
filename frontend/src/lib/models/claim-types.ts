/**
 * @module claim-types
 *
 * Types and constants for the claim ledger (Feature 108, FR-7, FR-9, FR-10,
 * FR-21). Types and one constant only: no behaviour, no React, no JSON, so it
 * is reachable from `core.ts`.
 *
 * A claim is an annotation carrying an optional `claim` marker
 * (`{ status, statusChangedAt }`); there is no new record kind. The status
 * list is a constant of the module: not writer-editable and independent of
 * `config.statuses`.
 */
import type { Annotation, AnnotationTarget } from "./types";

/** The four stored status identifiers, in display order (FR-9). */
export const CLAIM_STATUSES = [
  "unverified",
  "verified",
  "disputed",
  "needs-review",
] as const;

/** One of the four status identifiers. */
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** The label shown for each status identifier. */
export const CLAIM_STATUS_LABELS: Readonly<Record<ClaimStatus, string>> = {
  unverified: "Unverified",
  verified: "Verified",
  disputed: "Disputed",
  "needs-review": "Needs review",
};

/**
 * What a client supplies to mark a claim. The status and its date are never
 * supplied: the core starts every claim as `unverified` (FR-7, FR-10).
 */
export interface NewClaimInput {
  id: string;
  /** The claim statement; stored as the annotation body. */
  statement: string;
  /** The selected passage; stored as the annotation quote (at most 500). */
  quote: string;
  target?: AnnotationTarget;
}

/**
 * What a client supplies to change a claim (FR-11). Every key is optional;
 * a `target` of `null` clears the Source link. The status date is never
 * supplied.
 */
export interface UpdateClaimInput {
  status?: ClaimStatus;
  statement?: string;
  target?: AnnotationTarget | null;
}

/** The stored annotation of a created or updated claim. */
export type ClaimRecord = Annotation;

/** One claim in the project-wide list, with the resource it sits in. */
export interface ClaimListEntry {
  resourceId: string;
  resourceName: string;
  annotation: Annotation;
}

/**
 * A resource whose annotations could not be read. Listed beside the claims so
 * a failed read never renders as "no claims" (docs/standards/failure-visibility.md).
 */
export interface ClaimReadFailure {
  resourceId: string;
  resourceName: string;
  message: string;
}

/** Result of the project-wide claim list. */
export interface ClaimListResult {
  claims: ClaimListEntry[];
  failures: ClaimReadFailure[];
}

/** Callback the editor control calls to mark the current selection as a claim. */
export type OnMarkClaim = (statement: string) => Promise<void>;
