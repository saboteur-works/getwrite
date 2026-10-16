import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import {
  setSelectedResourceId as setResourceId,
  updateResource as updateResourceInSlice,
} from "../src/store/resourcesSlice";
import { computeStatusRollup } from "../src/lib/status-rollup";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import * as io from "../src/lib/models/io";
import { createMemoryAdapter } from "../src/lib/models/memoryAdapter";
import { readSidecar, writeSidecar } from "../src/lib/models/sidecar";
import { updateSidecarCore } from "../src/lib/models/resource-crud-core";
import { writeInitialCanonicalRevision } from "../src/lib/models/resource-initial-revision";
import {
  updateRevisionInPlace,
  resolveRevisionProjectRoot,
} from "../src/lib/models/revision-core";
import { listRevisions } from "../src/lib/models/revision";
import { plainTextToTipTapDocument } from "../src/lib/models/tiptap-doc";
import { openProject } from "../src/lib/api/projects";

/**
 * EXPERIMENT (Feature 87, Task 3, D-26/D-29). Measurement only; no fix.
 *
 * Question: after a canonical save of 10 words, what `wordCount` does the
 * payload `updateResource` sends for a Status choice carry, and what
 * `wordCount` does the sidecar hold after that Status choice?
 *
 * Setup: an in-memory storage adapter; a text resource created with a
 * zero-word initial canonical revision; the page opens the project with the
 * resource as loaded at that moment (wordCount 0, as `project-loader.ts` would
 * return for empty content). The real `updateRevisionInPlace` then saves a
 * 10-word document. `updateSidecar` is NOT mocked as a no-op: it forwards to
 * the real `updateSidecarCore` on the same adapter, so the stored sidecar is
 * observed. Observed values are written to the console as `F87 ...` lines.
 */

const PROJECT_ID = "6f1d3c5a-2b7e-4a1c-9d0e-5a8b7c6d4e3f";
const RESOURCE_ID = "b2c4d6e8-1a3b-4c5d-8e7f-9a0b1c2d3e4f";
const WORKSPACE = "/ws";
const PROJECT_ROOT = `${WORKSPACE}/${PROJECT_ID}`;

const updateSidecarMock = vi.fn();
const previousAdapter = io.getStorageAdapter();
const previousProjectsDirEnv = process.env.GETWRITE_PROJECTS_DIR;

vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

vi.mock("../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/api/resources")
  >("../src/lib/api/resources");
  return {
    ...actual,
    updateSidecar: (...args: unknown[]) => updateSidecarMock(...args),
  };
});

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock("../src/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi.fn(),
}));

vi.mock("../components/Start/StartPage", () => ({
  __esModule: true,
  default: function MockStartPage(props: { onOpen?: (id: string) => void }) {
    React.useEffect(() => {
      props.onOpen?.(PROJECT_ID);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
}));

setupAppShellFetchStub();

beforeEach(async () => {
  const base = createMemoryAdapter();
  await base.mkdir(PROJECT_ROOT, { recursive: true });
  io.setStorageAdapter(base);
  process.env.GETWRITE_PROJECTS_DIR = WORKSPACE;

  await writeSidecar(PROJECT_ROOT, RESOURCE_ID, {
    id: RESOURCE_ID,
    name: "Chapter One",
    type: "text",
    folderId: null,
    orderIndex: 0,
    userMetadata: {},
    wordCount: 0,
  });
  await writeInitialCanonicalRevision(
    PROJECT_ROOT,
    RESOURCE_ID,
    plainTextToTipTapDocument(""),
  );

  const loaded = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
  vi.mocked(openProject).mockResolvedValue({
    project: {
      id: "project-internal-id",
      name: "F87 Project",
      rootPath: `/projects/${PROJECT_ID}`,
      config: {},
    },
    folders: [],
    resources: [{ ...loaded, plaintext: "", wordCount: 0 }],
  } as unknown as Awaited<ReturnType<typeof openProject>>);

  updateSidecarMock.mockReset();
  updateSidecarMock.mockImplementation(
    async (
      resourceId: string,
      projectId: string,
      resource: Record<string, unknown>,
      clearKeys?: string[],
    ) => {
      await updateSidecarCore(projectId, resourceId, resource, clearKeys);
      return { updatedAt: "2026-10-15T00:00:00.000Z" };
    },
  );
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  if (previousProjectsDirEnv === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = previousProjectsDirEnv;
  }
});

describe("F87 Task 3 experiment: Status choice after a 10-word canonical save", () => {
  it("records sidecar wordCount after save, payload wordCount for Status, sidecar wordCount after", async () => {
    const { default: Page } = await import("../app/(app)/page");
    const store = makeStore();
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );
    await waitFor(() =>
      expect(store.getState().resources.resources.length).toBe(1),
    );
    store.dispatch(setResourceId(RESOURCE_ID));
    const statusSelect = (await screen.findByLabelText(
      "status",
    )) as HTMLSelectElement;

    // Canonical save of a 10-word document through the real model function.
    const root = resolveRevisionProjectRoot(PROJECT_ID);
    expect(root).toBe(PROJECT_ROOT);
    const revisions = await listRevisions(PROJECT_ROOT, RESOURCE_ID);
    const canonical = revisions.find((r) => r.isCanonical);
    expect(canonical).toBeDefined();
    const tenWords = "one two three four five six seven eight nine ten";
    await updateRevisionInPlace(
      PROJECT_ROOT,
      RESOURCE_ID,
      canonical!.id,
      JSON.stringify(plainTextToTipTapDocument(tenWords)),
    );
    const afterSave = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
    console.log(
      `F87 (a) sidecar wordCount after canonical save: ${afterSave?.wordCount}`,
    );

    fireEvent.change(statusSelect, { target: { value: "Published" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    const payload = updateSidecarMock.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    console.log(
      `F87 (b) payload wordCount for Status choice: ${String(payload.wordCount)}`,
    );
    console.log(`F87 payload keys: ${Object.keys(payload).sort().join(",")}`);
    console.log(`F87 payload updatedAt: ${String(payload.updatedAt)}`);
    console.log(
      `F87 payload userMetadata: ${JSON.stringify(payload.userMetadata)}`,
    );
    console.log(
      `F87 sidecar updatedAt after save: ${String(afterSave?.updatedAt)}`,
    );

    await waitFor(async () => {
      const s = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
      expect(
        (s?.userMetadata as Record<string, unknown> | undefined)?.status,
      ).toBe("Published");
    });
    const afterStatus = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
    console.log(
      `F87 (c) sidecar wordCount after Status change: ${afterStatus?.wordCount}`,
    );
    console.log(
      `F87 sidecar updatedAt after Status change: ${String(afterStatus?.updatedAt)}`,
    );
  });
});

describe("D-26: Status choice after a 10-word canonical save", () => {
  // Covers the Status-change path only. It does not close, and says nothing
  // about the cause of, the wider stale-save family measured in
  // page-stale-sidecar-save.test.tsx.
  it("sends and stores the saved wordCount (10) when Status is chosen", async () => {
    const { default: Page } = await import("../app/(app)/page");
    const store = makeStore();
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );
    await waitFor(() =>
      expect(store.getState().resources.resources.length).toBe(1),
    );
    store.dispatch(setResourceId(RESOURCE_ID));
    const statusSelect = (await screen.findByLabelText(
      "status",
    )) as HTMLSelectElement;

    const revisions = await listRevisions(PROJECT_ROOT, RESOURCE_ID);
    const canonical = revisions.find((r) => r.isCanonical);
    expect(canonical).toBeDefined();
    await updateRevisionInPlace(
      PROJECT_ROOT,
      RESOURCE_ID,
      canonical!.id,
      JSON.stringify(
        plainTextToTipTapDocument(
          "one two three four five six seven eight nine ten",
        ),
      ),
    );
    expect((await readSidecar(PROJECT_ROOT, RESOURCE_ID))?.wordCount).toBe(10);
    // The editor is mocked, so the dispatch `useCanonicalAutosave` makes after
    // a successful canonical save is made here with the same payload shape.
    act(() => {
      store.dispatch(
        updateResourceInSlice({
          id: RESOURCE_ID,
          updatedAt: "2026-10-15T00:00:00.000Z",
          wordCount: 10,
        }),
      );
    });

    fireEvent.change(statusSelect, { target: { value: "Published" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    const payload = updateSidecarMock.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    await waitFor(async () => {
      const s = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
      expect(
        (s?.userMetadata as Record<string, unknown> | undefined)?.status,
      ).toBe("Published");
    });
    const stored = await readSidecar(PROJECT_ROOT, RESOURCE_ID);
    expect(payload.wordCount).toBe(10);
    expect(stored?.wordCount).toBe(10);
  });
});

describe("D-26/D-29: By status over the Redux resource list", () => {
  it("reports the 10 saved words for the resource after a canonical save and a Status choice", async () => {
    const { default: Page } = await import("../app/(app)/page");
    const store = makeStore();
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );
    await waitFor(() =>
      expect(store.getState().resources.resources.length).toBe(1),
    );
    store.dispatch(setResourceId(RESOURCE_ID));
    const statusSelect = (await screen.findByLabelText(
      "status",
    )) as HTMLSelectElement;

    // The editor is mocked, so the dispatch `useCanonicalAutosave` makes after
    // a successful canonical save is made here with the same payload shape.
    act(() => {
      store.dispatch(
        updateResourceInSlice({
          id: RESOURCE_ID,
          updatedAt: "2026-10-15T00:00:00.000Z",
          wordCount: 10,
        }),
      );
    });

    fireEvent.change(statusSelect, { target: { value: "Published" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));

    const rows = computeStatusRollup(store.getState().resources.resources, [
      "Published",
    ]);
    const published = rows.find((row) => row.label === "Published");
    expect(published?.resourceCount).toBe(1);
    expect(published?.words).toBe(10);
  });
});
