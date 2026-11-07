import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import MetadataSidebar from "../components/Sidebar/MetadataSidebar";
import { createTextResource } from "../src/lib/models/resource";
import { createSourceResource } from "../src/lib/models/resource-factory";
import { makeStore } from "../src/store/store";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type { AnyResource } from "../src/lib/models/types";
import { flushPendingEffects } from "./helpers/flushEffects";

vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
  addAttachment: vi.fn(),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

vi.mock("../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsOrThrow: vi
    .fn()
    .mockResolvedValue({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    }),
}));

// Feature 102, Task 33 (FR-24, FR-30): the sidebar for a selected Source.
describe("MetadataSidebar for a selected Source (Task 33)", () => {
  function mountSelected(
    res: AnyResource,
    features?: Record<string, boolean>,
  ): void {
    const store = makeStore();
    store.dispatch(
      setProject({
        id: "p",
        rootPath: "/test",
        subtypes: ["Interview"],
        ...(features ? { features } : {}),
        metadataSchema: {
          groups: [
            {
              id: "g",
              label: "Scoped Group",
              fields: [
                {
                  key: "interviewee",
                  label: "Interviewee",
                  type: "text",
                  appliesTo: ["Interview"],
                },
              ],
            },
          ],
        },
      } as Parameters<typeof setProject>[0]),
    );
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([res]));
    store.dispatch(setSelectedResourceId(res.id));
    render(
      <Provider store={store}>
        <MetadataSidebar />
      </Provider>,
    );
  }

  it("shows the standard sections, a subtype-scoped field and Attachments", async () => {
    mountSelected({
      ...createSourceResource({ name: "Call notes" }),
      resourceSubtype: "Interview",
    } as AnyResource);
    await flushPendingEffects();
    expect(
      screen.queryByText("Select a resource to view its metadata."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /subtype/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("interviewee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tags/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /attachments/i }),
    ).toBeInTheDocument();
  });

  it("hides a field scoped to another subtype for a Source with none", async () => {
    mountSelected(createSourceResource({ name: "Call notes" }));
    await flushPendingEffects();
    expect(screen.queryByLabelText("interviewee")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /attachments/i }),
    ).toBeInTheDocument();
  });

  it("shows no Attachments section for a text resource", async () => {
    mountSelected(createTextResource({ name: "Chapter", plainText: "" }));
    await flushPendingEffects();
    expect(
      screen.getByRole("button", { name: /subtype/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /attachments/i }),
    ).not.toBeInTheDocument();
  });

  // Owner decision 2026-11-07 (supersedes FR-21 OQ-9): a Source is declared
  // and removed as an entity like a text resource.
  it("shows the Entity section for a Source when the entities feature is on", async () => {
    mountSelected(createSourceResource({ name: "Call notes" }), {
      entities: true,
    });
    await flushPendingEffects();
    expect(
      screen.getByRole("button", { name: /^entity$/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("entity-kind-input")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Entity" }),
    ).not.toBeInTheDocument();
  });

  it("shows Remove Entity for a Source that has an entityKind", async () => {
    mountSelected(
      {
        ...createSourceResource({ name: "Call notes" }),
        entityKind: "interview",
      } as AnyResource,
      { entities: true },
    );
    await flushPendingEffects();
    expect(
      screen.getByRole("button", { name: "Remove Entity" }),
    ).toBeInTheDocument();
  });
});
