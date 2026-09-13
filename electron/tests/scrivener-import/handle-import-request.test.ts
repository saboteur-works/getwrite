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
  it("resolves a success outcome carrying the runImport result, with projectId overridden to the destination directory basename (FR-7)", async () => {
    const runImport = vi.fn().mockResolvedValue(outcomeData);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    // request.projectRoot is "/destination/my-novel" — the directory
    // basename is what the frontend's openProject/handleOpen expect, not
    // outcomeData.projectId (a deliberately different UUID here, mirroring
    // how a project's directory id and its project.json id differ in
    // practice).
    expect(outcome).toEqual({
      kind: "success",
      ...outcomeData,
      projectId: "my-novel",
    });
    expect(outcome.kind === "success" && outcome.report).toBe(
      outcomeData.report,
    );
  });

  it("derives the success outcome's projectId from the destination directory name, never from runImport's returned projectId (FR-7 regression)", async () => {
    const data: ImportOutcomeData = {
      ...outcomeData,
      projectId: "99999999-9999-4999-8999-999999999999",
    };
    const runImport = vi.fn().mockResolvedValue(data);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome.kind).toBe("success");
    expect(outcome.kind === "success" && outcome.projectId).toBe("my-novel");
    expect(outcome.kind === "success" && outcome.projectId).not.toBe(
      data.projectId,
    );
  });

  it("resolves a refusal-unsupported outcome when isUnsupportedSourceError matches, with a fixed, path-free message (FR-3)", async () => {
    const err = new Error(
      'Cannot import Scrivener project at "/private/tmp/foo/Old.scriv": unsupported Creator "SCRWIN-2.9"',
    );
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(true);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome.kind).toBe("refusal-unsupported");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
  });

  it("resolves a refusal-destination-not-empty outcome when isNonEmptyDestinationError matches, with a fixed, path-free message (FR-3)", async () => {
    const err = new Error(
      'Destination "/private/tmp/foo/existing-project" is not empty',
    );
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(true);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome.kind).toBe("refusal-destination-not-empty");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
  });

  it("resolves a fatal outcome when the error matches neither predicate, with a fixed, path-free message (FR-3)", async () => {
    const err = new Error(
      'ENOENT: no such file or directory, open "/private/tmp/foo/Old.scriv/disk-full"',
    );
    const runImport = vi.fn().mockRejectedValue(err);
    const isUnsupportedSourceError = vi.fn().mockReturnValue(false);
    const isNonEmptyDestinationError = vi.fn().mockReturnValue(false);

    const outcome = await handleImportRequest(request, {
      runImport,
      isUnsupportedSourceError,
      isNonEmptyDestinationError,
    });

    expect(outcome.kind).toBe("fatal");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
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
