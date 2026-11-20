/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DataView from "../../components/WorkArea/DataView";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import type { AnyResource, Folder, Project } from "../../src/lib/models/types";

afterEach(cleanup);

const MARK = {
  targetId: "target",
  snapshotRevisionId: "rev-opaque",
  date: "2026-11-15T00:00:00.000Z",
};

function doc(
  id: string,
  words: number,
  options: { marked?: boolean; folderId?: string | null } = {},
): AnyResource {
  return {
    id,
    name: id,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    folderId: options.folderId ?? null,
    wordCount: words,
    userMetadata: {},
    ...(options.marked ? { [MERGED_MARK_SIDECAR_KEY]: MARK } : {}),
  } as unknown as AnyResource;
}

function project(goal?: number): Project {
  return {
    id: "p",
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config: goal ? { wordCountGoal: goal } : {},
  } as unknown as Project;
}

function stat(label: string): string | null {
  const el = screen
    .getAllByText(label)
    .find((e: HTMLElement) => e.parentElement?.querySelector(".text-gw-h1"));
  return el?.parentElement?.querySelector(".text-gw-h1")?.textContent ?? null;
}

describe("Feature 121 FR-20: Data view", () => {
  it("Total words skips a marked document", () => {
    render(
      <DataView
        project={project()}
        resources={[doc("target", 140), doc("absorbed", 100, { marked: true })]}
      />,
    );
    expect(stat("Total words")).toBe("140");
  });

  it("the project goal total on the client skips a marked document", () => {
    render(
      <DataView
        project={project(1000)}
        resources={[doc("target", 140), doc("absorbed", 100, { marked: true })]}
      />,
    );
    expect(screen.getByText(/140\s*\/\s*1,?000/)).toBeTruthy();
  });

  it("the folder breakdown skips a marked document's words", () => {
    const folders = [
      { id: "f1", name: "F1" },
      { id: "f2", name: "F2" },
    ] as unknown as Folder[];
    render(
      <DataView
        project={project()}
        folders={folders}
        resources={[
          doc("a", 140, { folderId: "f1" }),
          doc("b", 100, { folderId: "f2", marked: true }),
        ]}
      />,
    );
    const label = screen.getByText("F2");
    expect(label.parentElement?.textContent).not.toMatch(/\b100\b/);
  });

  it("the by-status roll-up in the Data view skips a marked document's words", () => {
    render(
      <DataView
        project={project()}
        resources={[doc("target", 140), doc("absorbed", 100, { marked: true })]}
      />,
    );
    expect(screen.queryByText(/\b240\b/)).toBeNull();
  });

  it("the stub flag is unaffected: a marked document with text is not a stub", () => {
    render(
      <DataView
        project={project()}
        resources={[doc("absorbed", 100, { marked: true })]}
      />,
    );
    expect(screen.queryByText(/Needs content/i)).toBeNull();
    expect(screen.getAllByText("absorbed").length).toBeGreaterThan(0);
  });

  it("the stub flag is unaffected: a marked empty document stays a stub", () => {
    render(
      <DataView
        project={project()}
        resources={[doc("empty-absorbed", 0, { marked: true })]}
      />,
    );
    expect(screen.getByText(/Needs content/i)).toBeTruthy();
  });
});
