import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

import {
  reportTransportReadFailure,
  reportTransportValidationFailure,
} from "../../src/lib/api/transport-validation";
import { httpEntityMentionCountsTransport } from "../../src/lib/api/entity-mention-counts";
import { httpEntityCooccurrenceTransport } from "../../src/lib/api/entity-cooccurrence";
import { httpEntityAliasTableTransport } from "../../src/lib/api/entity-alias-table";
import { httpMentionsTransport } from "../../src/lib/api/mentions";
import { httpEntityRelationshipsTransport } from "../../src/lib/api/entity-relationships";

/**
 * These five transports degrade to an empty value on failure by design
 * (Features 48/50), and that contract is unchanged. What was missing is that
 * only a MALFORMED BODY was reported — a non-2xx response and a thrown request
 * produced an empty roster, graph or mention list with nothing logged and
 * nothing shown, which a writer reads as "there is nothing here"
 * (`docs/standards/failure-visibility.md`).
 */
const reads: Array<{
  name: string;
  run: () => Promise<unknown>;
  empty: unknown;
}> = [
  {
    name: "entity-mention-counts.getEntityMentionCounts",
    run: () => httpEntityMentionCountsTransport.getEntityMentionCounts("p"),
    empty: {},
  },
  {
    name: "entity-cooccurrence.getEntityCooccurrence",
    run: () => httpEntityCooccurrenceTransport.getEntityCooccurrence("p"),
    empty: {},
  },
  {
    name: "entity-alias-table.getEntityAliasTable",
    run: () => httpEntityAliasTableTransport.getEntityAliasTable("p"),
    empty: { entities: {}, claimedBy: {} },
  },
  {
    name: "mentions.getResourceMentions",
    run: () => httpMentionsTransport.getResourceMentions("p", "r"),
    empty: [],
  },
  {
    name: "mentions.getEntityMentionedIn",
    run: () => httpMentionsTransport.getEntityMentionedIn("p", "e"),
    empty: [],
  },
  {
    name: "entity-relationships.list",
    run: () => httpEntityRelationshipsTransport.list("p"),
    empty: [],
  },
];

describe("entity transports — a failed read is reported, not silent", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  for (const { name, run, empty } of reads) {
    it(`reports a server error from ${name}`, async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({}),
          } as Response),
      );

      // Still degrades — callers rely on it.
      await expect(run()).resolves.toEqual(empty);

      expect(reportTransportReadFailure).toHaveBeenCalledWith(name, {
        kind: "http",
        status: 500,
      });
    });

    it(`reports a dropped connection from ${name}`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );

      await expect(run()).resolves.toEqual(empty);

      expect(reportTransportReadFailure).toHaveBeenCalledWith(name, {
        kind: "network",
      });
    });
  }

  it("still reports a malformed body through the validation path", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ unexpected: true }),
        } as Response),
    );

    await httpEntityMentionCountsTransport.getEntityMentionCounts("p");

    expect(reportTransportValidationFailure).toHaveBeenCalled();
    expect(reportTransportReadFailure).not.toHaveBeenCalled();
  });
});
