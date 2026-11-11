"use client";

import React from "react";
import type { ClaimReadFailure } from "../../src/lib/models/claim-types";
import {
  applyClaimFilters,
  describeEmptyClaimResult,
  NO_CLAIM_FILTERS,
  type ClaimDisplayModel,
  type ClaimFilters,
} from "../../src/lib/claim-display";
import Button from "../common/UI/Button/Button";
import ClaimsFiltersControl from "./ClaimsFilters";

/** One claim as the view shows it; the hook (Task 23) builds these. */
export interface ClaimViewItem {
  resourceId: string;
  resourceName: string;
  annotationId: string;
  display: ClaimDisplayModel;
  /** The passage is not marked in the document. */
  isDetached: boolean;
}

export type ClaimsViewState =
  | { status: "loading" }
  | { status: "failed"; isLocked: boolean; message: string }
  | { status: "ready"; items: ClaimViewItem[]; failures: ClaimReadFailure[] };

export interface ClaimsViewProps {
  state: ClaimsViewState;
  /** Reads the list again. */
  onRetry: () => void;
  /** Opens the claim in the editor; a detached claim opens its resource. */
  onOpenClaim: (item: ClaimViewItem) => void;
}

function sourceText(d: ClaimDisplayModel): string {
  const name = d.sourceName ?? "unnamed Source";
  let text: string;
  switch (d.sourceState) {
    case "none":
      text = "Unsourced";
      break;
    case "removed":
      text = `Source: ${name} (in Trash)`;
      break;
    case "permanently-deleted":
      text = `Source: ${name} (permanently deleted)`;
      break;
    case "unchecked":
      text = `Source: ${name} (could not be checked)`;
      break;
    default:
      text = `Source: ${name}`;
  }
  return d.sourcePartRemoved
    ? `${text}; an attachment or excerpt of it was removed`
    : text;
}

function statusText(d: ClaimDisplayModel): string {
  const base = d.statusDate
    ? `${d.statusLabel}, ${d.statusDate}`
    : d.statusLabel;
  return d.isStatusOffList ? `${base} (not a listed status)` : base;
}

function ClaimRow({
  item,
  onOpenClaim,
}: {
  item: ClaimViewItem;
  onOpenClaim: (item: ClaimViewItem) => void;
}): JSX.Element {
  const d = item.display;
  return (
    <li className="border-t border-gw-border py-2 text-sm">
      <p className="text-gw-primary">{d.statement}</p>
      <p className="text-gw-label text-gw-secondary">
        {`Passage: “${d.quote}”`}
      </p>
      <p className="text-gw-label text-gw-secondary">
        In <span className="text-gw-primary">{item.resourceName}</span>
      </p>
      <p className="text-gw-label text-gw-secondary">{`Status: ${statusText(d)}`}</p>
      <p className="text-gw-label text-gw-secondary">{sourceText(d)}</p>
      {item.isDetached && (
        <p className="text-gw-label text-gw-secondary">
          The passage is detached: it is no longer marked in the document.
        </p>
      )}
      <div className="mt-1">
        <Button
          variant="secondary"
          size="xs"
          aria-label={`Open claim: ${d.statement}`}
          onClick={() => onOpenClaim(item)}
        >
          Open
        </Button>
      </div>
    </li>
  );
}

function UnreadAlert({
  failures,
  onRetry,
}: {
  failures: ClaimReadFailure[];
  onRetry: () => void;
}): JSX.Element {
  return (
    <div role="alert" className="mb-3 text-gw-label text-gw-primary">
      <p className="mb-1">
        Some resources were not read, so their claims may be missing:
      </p>
      <ul className="mb-2 list-disc pl-5">
        {failures.map((f) => (
          <li key={f.resourceId}>{`${f.resourceName}: not read`}</li>
        ))}
      </ul>
      <Button variant="secondary" size="xs" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * The project-scope Claims tab (Feature 108, FR-16, FR-17). Presentational:
 * it lists, filters and opens; every write happens in the annotations panel.
 * A failed read is a failure, and a resource that could not be read is named
 * above the claims that were read; neither renders as "no claims".
 */
export default function ClaimsView({
  state,
  onRetry,
  onOpenClaim,
}: ClaimsViewProps): JSX.Element {
  const [filters, setFilters] = React.useState<ClaimFilters>(NO_CLAIM_FILTERS);

  return (
    <section aria-labelledby="claims-view-heading" className="p-4">
      <h2 id="claims-view-heading" className="mb-3 text-sm text-gw-primary">
        Claims
      </h2>
      {state.status === "loading" && (
        <p role="status" className="text-gw-label text-gw-secondary">
          Loading claims.
        </p>
      )}
      {state.status === "failed" && (
        <div role="alert" className="text-gw-label text-gw-primary">
          <p className="mb-2">
            {state.isLocked
              ? "This project is locked, so its claims cannot be listed. Unlock it to see them."
              : `The claims could not be listed. ${state.message}`}
          </p>
          <Button variant="secondary" size="xs" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <ReadyBody
          items={state.items}
          failures={state.failures}
          filters={filters}
          onFiltersChange={setFilters}
          onRetry={onRetry}
          onOpenClaim={onOpenClaim}
        />
      )}
    </section>
  );
}

function ReadyBody({
  items,
  failures,
  filters,
  onFiltersChange,
  onRetry,
  onOpenClaim,
}: {
  items: ClaimViewItem[];
  failures: ClaimReadFailure[];
  filters: ClaimFilters;
  onFiltersChange: (filters: ClaimFilters) => void;
  onRetry: () => void;
  onOpenClaim: (item: ClaimViewItem) => void;
}): JSX.Element {
  const matching = applyClaimFilters(
    items.map((i) => i.display),
    filters,
  );
  const shown = items.filter((i) => matching.includes(i.display));
  return (
    <>
      {failures.length > 0 && (
        <UnreadAlert failures={failures} onRetry={onRetry} />
      )}
      {items.length === 0 && failures.length === 0 && (
        <p className="text-gw-label text-gw-secondary">
          {describeEmptyClaimResult(filters, 0)}
        </p>
      )}
      {items.length === 0 && failures.length > 0 && (
        <p className="text-gw-label text-gw-secondary">No claims were read.</p>
      )}
      {items.length > 0 && (
        <>
          <ClaimsFiltersControl filters={filters} onChange={onFiltersChange} />
          {shown.length === 0 ? (
            <p className="text-gw-label text-gw-secondary">
              {describeEmptyClaimResult(filters, items.length)}
            </p>
          ) : (
            <ul aria-label="Claims in this project">
              {shown.map((item) => (
                <ClaimRow
                  key={`${item.resourceId}:${item.annotationId}`}
                  item={item}
                  onOpenClaim={onOpenClaim}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
