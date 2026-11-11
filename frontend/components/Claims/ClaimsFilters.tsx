"use client";

import React from "react";
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  type ClaimStatus,
} from "../../src/lib/models/claim-types";
import {
  describeActiveClaimFilters,
  type ClaimFilters,
  type ClaimSourcedFilter,
  type ClaimStatusFilter,
} from "../../src/lib/claim-display";
import Select from "../common/UI/Select/Select";

export interface ClaimsFiltersProps {
  filters: ClaimFilters;
  onChange: (filters: ClaimFilters) => void;
}

/**
 * Status and sourced filters of the Claims tab (FR-16). The two combine, and
 * the active filters are also stated in text so the state is not carried by
 * the controls alone.
 */
export default function ClaimsFilters({
  filters,
  onChange,
}: ClaimsFiltersProps): JSX.Element {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-4 text-gw-label text-gw-secondary">
        <label className="flex items-center gap-2">
          <span>Status</span>
          <Select
            className="py-1"
            value={filters.status}
            onChange={(e) =>
              onChange({
                ...filters,
                status: e.target.value as ClaimStatusFilter,
              })
            }
          >
            <option value="all">All</option>
            {CLAIM_STATUSES.map((status: ClaimStatus) => (
              <option key={status} value={status}>
                {CLAIM_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <span>Source</span>
          <Select
            className="py-1"
            value={filters.sourced}
            onChange={(e) =>
              onChange({
                ...filters,
                sourced: e.target.value as ClaimSourcedFilter,
              })
            }
          >
            <option value="all">All</option>
            <option value="sourced">Sourced</option>
            <option value="unsourced">Unsourced</option>
          </Select>
        </label>
      </div>
      <p className="mt-2 text-gw-label text-gw-secondary">
        {`Showing: ${describeActiveClaimFilters(filters)}`}
      </p>
    </div>
  );
}
