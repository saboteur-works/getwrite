/**
 * Feature 108 Task 2 (FR-7, FR-9, FR-10, FR-21): the claim contract. The
 * status constant, the optional `claim` field on the annotation schemas, and
 * the inert core stubs other tasks import.
 */
import { describe, expect, it } from "vitest";
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
} from "../../src/lib/models/claim-types";
import { AnnotationSchema } from "../../src/lib/models/schemas";
import { AnnotationResponseSchema } from "../../src/lib/api/schemas";
import { addClaimCore } from "../../src/lib/models/claims-add-core";
import { updateClaimCore } from "../../src/lib/models/claims-update-core";

const ID = "11111111-1111-4111-8111-111111111111";
const STAMP = "2026-11-11T10:00:00.000Z";

const plain = {
  id: ID,
  body: "note",
  quote: "passage",
  createdAt: STAMP,
  updatedAt: STAMP,
};
const withClaim = {
  ...plain,
  claim: { status: "unverified", statusChangedAt: STAMP },
};

describe("claim status constant", () => {
  it("has exactly the four identifiers, in order", () => {
    expect([...CLAIM_STATUSES]).toEqual([
      "unverified",
      "verified",
      "disputed",
      "needs-review",
    ]);
  });

  it("has exactly the four labels", () => {
    expect(Object.keys(CLAIM_STATUS_LABELS).sort()).toEqual(
      [...CLAIM_STATUSES].sort(),
    );
    expect(CLAIM_STATUS_LABELS).toEqual({
      unverified: "Unverified",
      verified: "Verified",
      disputed: "Disputed",
      "needs-review": "Needs review",
    });
  });
});

describe.each([
  ["AnnotationSchema", AnnotationSchema],
  ["AnnotationResponseSchema", AnnotationResponseSchema],
])("%s and the claim field", (_name, schema) => {
  it("keeps a valid claim", () => {
    const parsed = schema.parse(withClaim);
    expect(parsed.claim).toEqual({
      status: "unverified",
      statusChangedAt: STAMP,
    });
  });

  it("leaves an annotation without a claim unchanged", () => {
    const parsed = schema.parse(plain);
    expect(parsed).toEqual(plain);
    expect("claim" in parsed).toBe(false);
  });

  it("keeps a stored status that is not on the list, as stored", () => {
    const parsed = schema.parse({
      ...plain,
      claim: { status: "from-a-newer-build", statusChangedAt: STAMP },
    });
    expect(parsed.claim?.status).toBe("from-a-newer-build");
  });

  it("rejects a claim without a status date", () => {
    expect(
      schema.safeParse({ ...plain, claim: { status: "verified" } }).success,
    ).toBe(false);
  });
});

describe("inert core stubs", () => {
  it("each rejects with not implemented until its own task lands", async () => {
    await expect(addClaimCore("p", "r", {})).rejects.toThrow("not implemented");
    await expect(updateClaimCore("p", "r", ID, {})).rejects.toThrow(
      "not implemented",
    );
  });
});
