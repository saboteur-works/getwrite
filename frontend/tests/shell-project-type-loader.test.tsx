import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ShellProjectTypeLoader, {
  type ShellProjectTypeLoaderState,
} from "../components/Layout/ShellProjectTypeLoader";

const spec = (id: string) => ({
  id,
  name: id,
  folders: [{ name: "Workspace" }],
});

function stubList(body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

async function loaded(): Promise<ShellProjectTypeLoaderState> {
  let state: ShellProjectTypeLoaderState | null = null;
  render(
    <ShellProjectTypeLoader isOpen={true}>
      {(s) => {
        state = s;
        return null;
      }}
    </ShellProjectTypeLoader>,
  );
  await waitFor(() => {
    expect(state).not.toBeNull();
    expect(state!.isProjectTypesLoading).toBe(false);
    expect(
      state!.projectTypeTemplates.length > 0 || state!.projectTypesLoadError,
    ).toBeTruthy();
  });
  return state!;
}

describe("ShellProjectTypeLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the response's source and fileName instead of inventing them", async () => {
    stubList({
      entries: [
        { spec: spec("novel"), fileName: "novel.json", source: "built-in" },
        { spec: spec("mine"), fileName: "mine-copy-2.json", source: "saved" },
      ],
      unusable: [],
      savedStatus: "ok",
    });
    const state = await loaded();
    expect(
      state.projectTypeTemplates.map((t) => [t.fileName, t.source]),
    ).toEqual([
      ["novel.json", "built-in"],
      ["mine-copy-2.json", "saved"],
    ]);
  });

  it("carries the notice when saved files are unusable", async () => {
    stubList({
      entries: [
        { spec: spec("novel"), fileName: "novel.json", source: "built-in" },
      ],
      unusable: [{ fileName: "bad.json", reason: "invalid" }],
      savedStatus: "ok",
    });
    const state = await loaded();
    expect(state.projectTypesNotice).toMatch(/1 saved project type file/);
  });

  it("shows the error and an empty list on a load failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    const state = await loaded();
    expect(state.projectTypesLoadError).toMatch(/500/);
    expect(state.projectTypeTemplates).toEqual([]);
  });
});
