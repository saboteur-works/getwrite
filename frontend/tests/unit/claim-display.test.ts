/**
 * Feature 108, Task 20 (FR-6, FR-9, FR-10, FR-12, FR-13, FR-16): the pure
 * claim display model and filters.
 */
import { describe, expect, it } from "vitest";
import {
  applyClaimFilters,
  describeActiveClaimFilters,
  describeEmptyClaimResult,
  deriveClaimDisplay,
  formatLocalDate,
  NO_CLAIM_FILTERS,
  type ClaimDisplay,
  type ClaimDisplayModel,
  type ClaimSourceFacts,
} from "../../src/lib/claim-display";
import { CLAIM_STATUSES } from "../../src/lib/models/claim-types";
import type { Annotation } from "../../src/lib/models/types";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function claim(
  over: Partial<Omit<Annotation, "claim">> & { status?: string } = {},
): Annotation {
  const { status, ...rest } = over;
  return {
    id: "a1",
    body: "Water boils at 90C here",
    quote: "boils",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    claim: {
      status: status ?? "unverified",
      statusChangedAt: new Date(2026, 10, 11, 23, 30).toISOString(),
    },
    ...rest,
  } as Annotation;
}

const ON = { moduleEnabled: true } as const;

function asClaim(d: ClaimDisplay): ClaimDisplayModel {
  if (d.kind !== "claim") throw new Error("expected a claim display");
  return d;
}

describe("deriveClaimDisplay: unsourced (FR-12)", () => {
  it("is unsourced when there is no target", () => {
    const d = asClaim(deriveClaimDisplay(claim(), ON));
    expect(d.isUnsourced).toBe(true);
    expect(d.sourceState).toBe("none");
  });

  it("is derived, not stored: the annotation is not changed", () => {
    const a = claim();
    const before = JSON.stringify(a);
    deriveClaimDisplay(a, ON);
    expect(JSON.stringify(a)).toBe(before);
  });

  it("reports both facts for a Verified unsourced claim", () => {
    const d = asClaim(deriveClaimDisplay(claim({ status: "verified" }), ON));
    expect(d.statusLabel).toBe("Verified");
    expect(d.isUnsourced).toBe(true);
  });

  it("is sourced when a target is present", () => {
    const d = asClaim(
      deriveClaimDisplay(
        claim({ target: { sourceId: SOURCE_ID, sourceName: "Ada" } }),
        { ...ON, sourceFacts: { source: "present" } },
      ),
    );
    expect(d.isUnsourced).toBe(false);
    expect(d.isSourced).toBe(true);
    expect(d.sourceState).toBe("present");
    expect(d.sourceName).toBe("Ada");
  });
});

describe("deriveClaimDisplay: status (FR-9)", () => {
  it("labels each of the four statuses, not marked", () => {
    for (const s of CLAIM_STATUSES) {
      const d = asClaim(deriveClaimDisplay(claim({ status: s }), ON));
      expect(d.statusId).toBe(s);
      expect(d.isStatusOffList).toBe(false);
    }
    expect(
      asClaim(deriveClaimDisplay(claim({ status: "needs-review" }), ON))
        .statusLabel,
    ).toBe("Needs review");
  });

  it("reports an off-list status as stored and marked", () => {
    const d = asClaim(deriveClaimDisplay(claim({ status: "Probably" }), ON));
    expect(d.statusId).toBe("Probably");
    expect(d.statusLabel).toBe("Probably");
    expect(d.isStatusOffList).toBe(true);
  });

  it("treats prototype names as off-list", () => {
    const d = asClaim(deriveClaimDisplay(claim({ status: "toString" }), ON));
    expect(d.isStatusOffList).toBe(true);
    expect(d.statusLabel).toBe("toString");
  });
});

describe("formatLocalDate (FR-10)", () => {
  it("shows the local calendar date of the ISO timestamp", () => {
    expect(formatLocalDate(new Date(2026, 10, 11, 23, 30).toISOString())).toBe(
      "2026-11-11",
    );
    expect(formatLocalDate(new Date(2026, 0, 2, 0, 5).toISOString())).toBe(
      "2026-01-02",
    );
  });

  it("returns undefined for an unreadable timestamp, never a made-up date", () => {
    expect(formatLocalDate("not a date")).toBeUndefined();
    expect(formatLocalDate("")).toBeUndefined();
  });

  it("is carried on the display model", () => {
    expect(asClaim(deriveClaimDisplay(claim(), ON)).statusDate).toBe(
      "2026-11-11",
    );
  });
});

describe("deriveClaimDisplay: Source state (FR-13)", () => {
  const target = { sourceId: SOURCE_ID, sourceName: "Ada" };
  const withFacts = (sourceFacts: ClaimSourceFacts): ClaimDisplayModel =>
    asClaim(deriveClaimDisplay(claim({ target }), { ...ON, sourceFacts }));

  it("reads removed for a Source in Trash, with the saved name", () => {
    const d = withFacts({ source: "in-trash" });
    expect(d.sourceState).toBe("removed");
    expect(d.sourceName).toBe("Ada");
    expect(d.isUnsourced).toBe(false);
  });

  it("reads permanently deleted for a purged Source", () => {
    expect(withFacts({ source: "absent" }).sourceState).toBe(
      "permanently-deleted",
    );
  });

  it("reports could-not-be-checked, neither sourced nor unsourced", () => {
    const d = withFacts("unreadable");
    expect(d.sourceState).toBe("unchecked");
    expect(d.isUnsourced).toBe(false);
    expect(d.isSourced).toBe(false);
  });

  it("is unchecked when a target exists but no facts were supplied", () => {
    const d = asClaim(deriveClaimDisplay(claim({ target }), ON));
    expect(d.sourceState).toBe("unchecked");
  });

  it("flags a removed excerpt of a present Source", () => {
    const d = asClaim(
      deriveClaimDisplay(
        claim({ target: { ...target, excerptId: SOURCE_ID } }),
        { ...ON, sourceFacts: { source: "present", excerpt: "removed" } },
      ),
    );
    expect(d.sourceState).toBe("present");
    expect(d.sourcePartRemoved).toBe(true);
  });

  it("keeps the status as stored in every state", () => {
    expect(withFacts({ source: "absent" }).statusId).toBe("unverified");
    expect(withFacts("unreadable").statusId).toBe("unverified");
  });
});

describe("deriveClaimDisplay: module off (FR-6)", () => {
  it("is an ordinary note with the statement as body", () => {
    const d = deriveClaimDisplay(claim({ target: { sourceId: SOURCE_ID } }), {
      moduleEnabled: false,
    });
    expect(d).toEqual({ kind: "note", body: "Water boils at 90C here" });
  });
});

describe("filters (FR-9, FR-12, FR-16)", () => {
  const mk = (
    status: string,
    hasTarget?: boolean,
    facts?: ClaimSourceFacts,
  ): ClaimDisplayModel =>
    asClaim(
      deriveClaimDisplay(
        claim({
          status,
          ...(hasTarget ? { target: { sourceId: SOURCE_ID } } : {}),
        }),
        {
          ...ON,
          sourceFacts: facts ?? (hasTarget ? { source: "present" } : undefined),
        },
      ),
    );
  const all: ClaimDisplayModel[] = [
    mk("unverified"),
    mk("verified", true),
    mk("verified"),
    mk("disputed", true),
    mk("needs-review"),
    mk("Probably", true),
    mk("unverified", true, "unreadable"),
  ];

  it("all returns every claim, including off-list", () => {
    expect(applyClaimFilters(all, NO_CLAIM_FILTERS)).toHaveLength(all.length);
  });

  it("filters by each status; off-list matches none of the four", () => {
    for (const s of CLAIM_STATUSES) {
      const r = applyClaimFilters(all, { status: s, sourced: "all" });
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((d) => d.statusId === s)).toBe(true);
    }
    const matched = CLAIM_STATUSES.flatMap((s) =>
      applyClaimFilters(all, { status: s, sourced: "all" }),
    );
    expect(matched.some((d) => d.statusId === "Probably")).toBe(false);
  });

  it("filters sourced and unsourced; could-not-be-checked is in neither", () => {
    const sourced = applyClaimFilters(all, {
      status: "all",
      sourced: "sourced",
    });
    const unsourced = applyClaimFilters(all, {
      status: "all",
      sourced: "unsourced",
    });
    expect(sourced).toHaveLength(3);
    expect(unsourced).toHaveLength(3);
    expect(sourced.some((d) => d.sourceState === "unchecked")).toBe(false);
    expect(unsourced.some((d) => d.sourceState === "unchecked")).toBe(false);
  });

  it("combines status and sourced", () => {
    const r = applyClaimFilters(all, {
      status: "verified",
      sourced: "unsourced",
    });
    expect(r).toHaveLength(1);
    expect(r[0].isUnsourced).toBe(true);
  });

  it("states active filters as text", () => {
    expect(describeActiveClaimFilters(NO_CLAIM_FILTERS)).toBe("All claims");
    expect(
      describeActiveClaimFilters({
        status: "needs-review",
        sourced: "unsourced",
      }),
    ).toBe("Status: Needs review; Unsourced");
    expect(
      describeActiveClaimFilters({ status: "all", sourced: "sourced" }),
    ).toBe("Sourced");
  });

  it("an empty result says no claim matches, not that there are none", () => {
    const filters = { status: "disputed", sourced: "unsourced" } as const;
    expect(applyClaimFilters(all, filters)).toHaveLength(0);
    expect(describeEmptyClaimResult(filters, all.length)).toMatch(
      /no claim matches/i,
    );
    expect(describeEmptyClaimResult(NO_CLAIM_FILTERS, 0)).toBe(
      "There are no claims.",
    );
  });
});
