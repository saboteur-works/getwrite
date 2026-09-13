// Last Updated: 2026-09-13

/**
 * `handleImportRequest` (DOCX) unit tests. Uses fakes only — no `@gw/core`
 * or `frontend/` import anywhere in this file, so it exercises the worker's
 * discriminated outcome protocol (FR-17) without pulling any frontend
 * module into the electron `tsc` program. Mirrors
 * `electron/tests/scrivener-import/handle-import-request.test.ts`'s own
 * test pattern against the DOCX pipeline's four non-success outcome kinds
 * instead.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleImportRequest,
  type ImportOutcomeData,
  type ImportRequest,
} from "../../src/docx-import/handle-import-request";

const request: ImportRequest = {
  sourcePath: "/source/My Novel.docx",
  projectRoot: "/destination/my-novel",
  name: "My Novel",
};

const outcomeData: ImportOutcomeData = {
  projectId: "11111111-1111-4111-8111-111111111111",
  projectRoot: "/destination/my-novel",
  folderCount: 0,
  resourceCount: 5,
  report: "Skipped Items\n(none)\n",
};

function fakeDeps(overrides?: {
  runImport?: ReturnType<typeof vi.fn>;
  isUnsupportedSourceError?: ReturnType<typeof vi.fn>;
  isNonEmptyDestinationError?: ReturnType<typeof vi.fn>;
  isUnknownProjectTypeError?: ReturnType<typeof vi.fn>;
}) {
  return {
    runImport: overrides?.runImport ?? vi.fn().mockResolvedValue(outcomeData),
    isUnsupportedSourceError:
      overrides?.isUnsupportedSourceError ?? vi.fn().mockReturnValue(false),
    isNonEmptyDestinationError:
      overrides?.isNonEmptyDestinationError ?? vi.fn().mockReturnValue(false),
    isUnknownProjectTypeError:
      overrides?.isUnknownProjectTypeError ?? vi.fn().mockReturnValue(false),
  };
}

describe("handleImportRequest (docx)", () => {
  it("resolves a success outcome carrying the runImport result, with projectId overridden to the destination directory basename (FR-7)", async () => {
    const deps = fakeDeps();

    const outcome = await handleImportRequest(request, deps);

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
    const deps = fakeDeps({ runImport: vi.fn().mockResolvedValue(data) });

    const outcome = await handleImportRequest(request, deps);

    expect(outcome.kind).toBe("success");
    expect(outcome.kind === "success" && outcome.projectId).toBe("my-novel");
    expect(outcome.kind === "success" && outcome.projectId).not.toBe(
      data.projectId,
    );
  });

  it("resolves a refusal-no-docx-found outcome when isUnsupportedSourceError matches, with a fixed, path-free message (FR-1)", async () => {
    const err = new Error(
      'No .docx files found under "/private/tmp/foo/Empty Folder"',
    );
    const deps = fakeDeps({
      runImport: vi.fn().mockRejectedValue(err),
      isUnsupportedSourceError: vi.fn().mockReturnValue(true),
    });

    const outcome = await handleImportRequest(request, deps);

    expect(outcome.kind).toBe("refusal-no-docx-found");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
  });

  it("resolves a refusal-destination-not-empty outcome when isNonEmptyDestinationError matches, with a fixed, path-free message (FR-7)", async () => {
    const err = new Error(
      'Destination "/private/tmp/foo/existing-project" is not empty',
    );
    const deps = fakeDeps({
      runImport: vi.fn().mockRejectedValue(err),
      isNonEmptyDestinationError: vi.fn().mockReturnValue(true),
    });

    const outcome = await handleImportRequest(request, deps);

    expect(outcome.kind).toBe("refusal-destination-not-empty");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
  });

  it("resolves a refusal-unknown-project-type outcome when isUnknownProjectTypeError matches (FR-8)", async () => {
    const err = new Error(
      'Cannot import DOCX project: unknown project type "not-a-real-type".',
    );
    const deps = fakeDeps({
      runImport: vi.fn().mockRejectedValue(err),
      isUnknownProjectTypeError: vi.fn().mockReturnValue(true),
    });

    const outcome = await handleImportRequest(request, deps);

    expect(outcome.kind).toBe("refusal-unknown-project-type");
  });

  it("resolves a fatal outcome when the error matches no predicate, with a fixed, path-free message", async () => {
    const err = new Error(
      'ENOENT: no such file or directory, open "/private/tmp/foo/My Novel.docx/disk-full"',
    );
    const deps = fakeDeps({ runImport: vi.fn().mockRejectedValue(err) });

    const outcome = await handleImportRequest(request, deps);

    expect(outcome.kind).toBe("fatal");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp/foo");
    expect(JSON.stringify(outcome)).not.toContain("/private/tmp");
  });

  it("only calls runImport(request) on the success path — no predicate calls", async () => {
    const deps = fakeDeps();

    await handleImportRequest(request, deps);

    expect(deps.runImport).toHaveBeenCalledTimes(1);
    expect(deps.runImport).toHaveBeenCalledWith(request);
    expect(deps.isUnsupportedSourceError).not.toHaveBeenCalled();
    expect(deps.isNonEmptyDestinationError).not.toHaveBeenCalled();
    expect(deps.isUnknownProjectTypeError).not.toHaveBeenCalled();
  });
});
