import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import MetadataSidebar from "../components/Sidebar/MetadataSidebar";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
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
        <TrashRefreshProvider>
          <MetadataSidebar />
        </TrashRefreshProvider>
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

// Feature 116, Task 64: the Citation fields section calls /api/citations/fields
// with the project DIRECTORY id (trailing segment of rootPath), not with the
// Redux selectedProjectId, which holds project.json's `id`.
describe("MetadataSidebar Citation fields ids (Feature 116, Task 64)", () => {
  const PROJECT_JSON_ID = "eab25dde-0000-4000-8000-000000000001";
  const DIRECTORY_ID = "d278b38b-0000-4000-8000-000000000002";
  const STORED = { referenceType: "book", title: "Stored Title" };

  type Call = { method: string; projectId: string | null };
  const calls: Call[] = [];

  function stubFetch(): void {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname !== "/api/citations/fields") {
          return new Response("{}", { status: 200 });
        }
        const method = init?.method ?? "GET";
        const projectId =
          method === "GET"
            ? url.searchParams.get("projectId")
            : (JSON.parse(String(init?.body)) as { projectId: string })
                .projectId;
        calls.push({ method, projectId });
        // Same behaviour as the measured packaged server: only the directory
        // id resolves a project root.
        if (projectId !== DIRECTORY_ID) {
          return new Response(
            JSON.stringify({ error: "The resource was not found." }),
            { status: 404 },
          );
        }
        const body =
          method === "GET"
            ? { kind: "fields", fields: STORED }
            : {
                fields: (JSON.parse(String(init?.body)) as { fields: unknown })
                  .fields,
              };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mount(): ReturnType<typeof makeStore> {
    stubFetch();
    const source = createSourceResource({ name: "Book" }) as AnyResource;
    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_JSON_ID,
        rootPath: `/projects/${DIRECTORY_ID}`,
        modules: { citations: true },
        metadataSchema: { groups: [] },
      } as unknown as Parameters<typeof setProject>[0]),
    );
    store.dispatch(setSelectedProjectId(PROJECT_JSON_ID));
    store.dispatch(setResources([source]));
    store.dispatch(setSelectedResourceId(source.id));
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <MetadataSidebar />
        </TrashRefreshProvider>
      </Provider>,
    );
    return store;
  }

  it("records what the Redux selectedProjectId holds", () => {
    const store = mount();
    const state = store.getState() as {
      projects: { selectedProjectId: string | null };
    };
    // Measured: the value set from project.json's id, not the directory id.
    expect(state.projects.selectedProjectId).toBe(PROJECT_JSON_ID);
    expect(state.projects.selectedProjectId).not.toBe(DIRECTORY_ID);
  });

  it("reads the fields with the directory id", async () => {
    mount();
    expect(await screen.findByDisplayValue("Stored Title")).toBeVisible();
    expect(
      screen.queryByText(/The citation fields could not be loaded/),
    ).toBeNull();
    expect(calls[0]).toEqual({ method: "GET", projectId: DIRECTORY_ID });
  });

  it("saves the fields with the directory id", async () => {
    mount();
    const title = await screen.findByDisplayValue("Stored Title");
    fireEvent.change(title, { target: { value: "New Title" } });
    fireEvent.click(screen.getByText("Save citation fields"));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT")).toBe(true),
    );
    expect(calls.filter((c) => c.method === "PUT")).toEqual([
      { method: "PUT", projectId: DIRECTORY_ID },
    ]);
    expect(screen.queryByText(/could not be saved/)).toBeNull();
  });
});
