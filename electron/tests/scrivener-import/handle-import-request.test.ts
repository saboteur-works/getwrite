// Last Updated: 2026-09-12

/**
 * `handleImportRequest` unit tests. Uses fakes only — no `@gw/core` or
 * `frontend/` import anywhere in this file, so it exercises the worker's
 * discriminated outcome protocol (FR-12) without pulling any frontend module
 * into the electron `tsc` program.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleImportRequest,
  type ImportOutcomeData,
  type ImportRequest,
} from "../../src/scrivener-import/handle-import-request";

const request: ImportRequest = {
  scrivPath: "/source/My Novel.scriv",
  projectRoot: "/destination/my-novel",
  name: "My Novel",
};

const outcomeData: ImportOutcomeData = {
  projectId: "11111111-1111-4111-8111-111111111111",
  projectRoot: "/destination/my-novel",
  folderCount: 3,
  resourceCount: 12,
  tagCount: 4,
  report: "Skipped Items\n(none)\n",
};

describe("handleImportRequest", () => {
  it("resolves a success outcome carrying the runImport result verbatim", async () => {
    const runImport = vi.fn().mockResolvedValue(outcomeData);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome).toEqual({ kind: "success", ...outcomeData });
    expect(outcome.kind === "success" && outcome.report).toBe(
      outcomeData.report,
    );
  });

  it("resolves a refusal-unsupported outcome when isUnsupportedSourceError matches", async () => {
    const err = new Error("not a Scrivener 3, Mac-authored project");
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(true);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome).toEqual({
      kind: "refusal-unsupported",
      message: err.message,
    });
  });

  it("resolves a refusal-destination-not-empty outcome when isNonEmptyDestinationError matches", async () => {
    const err = new Error("destination is not empty");
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(true);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome).toEqual({
      kind: "refusal-destination-not-empty",
      message: err.message,
    });
  });

  it("resolves a fatal outcome when the error matches neither predicate", async () => {
    const err = new Error("disk full");
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome).toEqual({ kind: "fatal", message: err.message });
  });

  it("only calls runImport(request) on the success path — no predicate calls", async () => {
    const runImport = vi.fn().mockResolvedValue(outcomeData);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(runImport).toHaveBeenCalledTimes(1);
    expect(runImport).toHaveBeenCalledWith(request);
    expect(isUnsupportedSourceError).not.toHaveBeenCalled();
    expect(isNonEmptyDestinationError).not.toHaveBeenCalled();
  });
});
