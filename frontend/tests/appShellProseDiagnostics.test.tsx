import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
vi.mock("../src/lib/api/prose-diagnostics", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/prose-diagnostics")>();
  return { ...actual, getProseDiagnostics: vi.fn() };
});

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import { getProseDiagnostics } from "../src/lib/api/prose-diagnostics";

const mockGetProseDiagnostics = vi.mocked(getProseDiagnostics);

// The project.json `id` deliberately differs from the directory basename in
// rootPath, mirroring appShellResourceWordCountGoal.test.tsx (Feature 61,
// Task 8) and appShellWordCountGoal.test.tsx (Feature 60) — the sidebar
// resolves its project id via `selectActiveProjectDirectoryId` (derived from
// `rootPath`), independent of `project.id`. `ProseDiagnosticsSection` reads
// the same selector, so a regression that passed `project.id` instead would
// be caught here.
const INTERNAL_ID = "9c1a4f20-internal-id-from-project-json";
const DIRECTORY_ID = "5e2b7d33-directory-basename";

describe("AppShell prose diagnostics wiring (Feature 62, Task 9)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;
    mockGetProseDiagnostics.mockReset();
    mockGetProseDiagnostics.mockResolvedValue({
      dialogueRatio: 0.42,
      averageSentenceLength: 12.3,
      topRepeatedWords: [{ word: "the", count: 7 }],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("mounts the sidebar for a page-shaped project/resource and renders the ready state with the directory-basename project id", async () => {
    const resource = createTextResource({ name: "Chapter One", plainText: "" });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    // Built the same shape `page.tsx`'s `selectedProject` state carries into
    // `AppShell`'s `project` prop — not a hand-crafted fixture pre-shaped to
    // already contain diagnostics data.
    const project = {
      id: INTERNAL_ID,
      name: "Mismatched Ids Prose Diagnostics",
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const store = makeStore();
    store.dispatch(
      setProject({
        id: INTERNAL_ID,
        name: project.name,
        rootPath,
        folders: [],
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId(INTERNAL_ID));
    store.dispatch(setResources([resource]));
    // Same store update page.tsx's handleResourceSelect produces when a
    // resource is opened from the resource tree.
    store.dispatch(setSelectedResourceId(resource.id));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
        />
      </Provider>,
    );

    expect(await screen.findByText("Prose diagnostics")).toBeInTheDocument();

    await waitFor(() =>
      expect(mockGetProseDiagnostics).toHaveBeenCalledTimes(1),
    );
    const [calledProjectId, calledResourceId] =
      mockGetProseDiagnostics.mock.calls[0]!;
    expect(calledProjectId).toBe(DIRECTORY_ID);
    expect(calledResourceId).toBe(resource.id);

    expect(
      await screen.findByText(/Dialogue ratio:\s*42%/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Average sentence length:\s*12\.3/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Top repeated words:\s*the \(7\)/),
    ).toBeInTheDocument();
  });

  it("shows the loading state before the mocked transport resolves", async () => {
    let resolveDiagnostics!: (value: {
      dialogueRatio: number;
      averageSentenceLength: number;
      topRepeatedWords: { word: string; count: number }[];
    }) => void;
    mockGetProseDiagnostics.mockReset();
    mockGetProseDiagnostics.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDiagnostics = resolve;
        }),
    );

    const resource = createTextResource({ name: "Chapter Two", plainText: "" });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    const project = {
      id: INTERNAL_ID,
      name: "Mismatched Ids Prose Diagnostics Loading",
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const store = makeStore();
    store.dispatch(
      setProject({
        id: INTERNAL_ID,
        name: project.name,
        rootPath,
        folders: [],
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId(INTERNAL_ID));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
        />
      </Provider>,
    );

    expect(await screen.findByText("Loading diagnostics…")).toBeInTheDocument();

    resolveDiagnostics({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Loading diagnostics…"),
      ).not.toBeInTheDocument(),
    );
  });
});
