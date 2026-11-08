import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import type { Project, AnyResource } from "../../src/lib/models/types";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanup } from "@testing-library/react";
import SourcesView from "../../components/Sources/SourcesView";
import {
  createResourceCore,
  renameResourceSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createAndAssertProject } from "../unit/helpers/project-creator";
import { removeDirRetry } from "../unit/helpers/fs-utils";

/**
 * Feature 102, Task 29 (FR-27): when creating or copying a Source could not
 * add it to the saved compile exclusions (the 5000-id cap), the response
 * carries a `notice` and `page.tsx` shows it as a visible toast. `AppShell`
 * is a test double exposing `onResourceAction`, as in
 * page-delete-failure.test.tsx.
 */

const createResourceMock = vi.fn();
const copyResourceMock = vi.fn();
const renameResourceMock = vi.fn();

vi.mock("../../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/resources")
  >("../../src/lib/api/resources");
  return {
    ...actual,
    createResource: (...args: unknown[]) => createResourceMock(...args),
    copyResource: (...args: unknown[]) => copyResourceMock(...args),
    renameResource: (...args: unknown[]) => renameResourceMock(...args),
  };
});

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    loading: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  },
}));

/** The on-disk directory id the mocked open project reports. */
const projectState = vi.hoisted(() => ({ dirId: "proj-dir-id" }));

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockImplementation(async () => ({
      project: {
        id: "project-internal-id",
        name: "Test Project",
        rootPath: `/projects/${projectState.dirId}`,
        config: {},
      } as Project,
      folders: [],
      resources: [
        {
          id: "src-1",
          name: "Interview",
          type: "source",
          folderId: null,
          orderIndex: 0,
        } as unknown as AnyResource,
      ],
    })),
}));

function MockStartPage(props: { onOpen?: (id: string) => Promise<void> }) {
  React.useEffect(() => {
    void props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => Promise<void> }) => (
    <MockStartPage {...props} />
  ),
}));

type CapturedAppShellProps = {
  children?: React.ReactNode;
  resources?: AnyResource[];
  onResourceAction?: (
    action: string,
    resourceId?: string,
    opts?: { title?: string; type?: string },
  ) => Promise<void>;
};

vi.mock("../../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: CapturedAppShellProps) => (
    <div>
      {props.children}
      <div data-testid="count">{(props.resources ?? []).length}</div>
      <button
        onClick={() =>
          props.onResourceAction?.("create", undefined, {
            title: "New Source",
            type: "source",
          })
        }
      >
        create-source
      </button>
      <button onClick={() => props.onResourceAction?.("copy", "src-1")}>
        copy-source
      </button>
      <SourcesView />
    </div>
  ),
}));

const NOTICE = "The Source was created, but it is not left out of compile.";
const created = {
  id: "new-1",
  name: "New Source",
  type: "source",
  folderId: null,
  orderIndex: 1,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("entity-alias-table")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ entities: {}, claimedBy: {} }),
        } as Response;
      }
      throw new Error("not available in test");
    }),
  );
  createResourceMock.mockReset();
  copyResourceMock.mockReset();
  renameResourceMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

async function renderPage() {
  const { default: Page } = await import("../../app/(app)/page");
  render(
    <Provider store={makeStore()}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("count").textContent).toBe("1"),
  );
}

describe("page.tsx Source not-excluded notice (Feature 102, Task 29)", () => {
  it("shows the notice after creating a Source when the response carries one", async () => {
    createResourceMock.mockResolvedValue({ resource: created, notice: NOTICE });
    await renderPage();
    fireEvent.click(screen.getByText("create-source"));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0][1]).toBe(NOTICE);
    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("shows no notice toast when the response carries none", async () => {
    createResourceMock.mockResolvedValue({ resource: created });
    await renderPage();
    fireEvent.click(screen.getByText("create-source"));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("shows the notice after copying a Source when the response carries one", async () => {
    copyResourceMock.mockResolvedValue({
      resource: { ...created, id: "copy-1", name: "Interview (Copy)" },
      notice: NOTICE,
    });
    await renderPage();
    fireEvent.click(screen.getByText("copy-source"));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0][1]).toBe(NOTICE);
  });
});

/**
 * Feature 103, Task 18 (FR-16, FR-19): the Sources view's create and rename
 * leave the same stored result as the tree's, on the same input, through the
 * real resource cores over a temporary project. The tree's create is
 * `page.tsx` (`onResourceAction("create")`); the tree's rename is
 * `AppShell`'s `handleRenameConfirm`, which is not mounted here: its call,
 * `renameResource(resourceId, directoryId, name, "resource")`, is made
 * directly for the tree side.
 */
const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

interface StoredResult {
  sidecar: Record<string, unknown>;
  excluded: string[];
  notices: string[];
}

async function freshProject(
  excludedIds?: string[],
): Promise<{ dir: string; root: string; dirId: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-view-parity-"));
  const dirId = generateUUID();
  projectState.dirId = dirId;
  const root = path.join(dir, dirId);
  await createAndAssertProject(SPEC_PATH, { projectRoot: root, name: "P" });
  if (excludedIds !== undefined) {
    const file = path.join(root, "project.json");
    const json = JSON.parse(await fs.readFile(file, "utf8"));
    json.config = {
      ...(json.config ?? {}),
      compileDefaults: { excludedResourceIds: excludedIds },
    };
    await fs.writeFile(file, JSON.stringify(json, null, 2));
  }
  return { dir, root, dirId };
}

function diskCreate(): void {
  createResourceMock.mockImplementation(
    async (projectId: string, data: Record<string, unknown>) => {
      let notice: string | undefined;
      const resource = await createResourceCore(projectId, data as never, {
        onCompileDefaultsNotice: (m) => {
          notice = m;
        },
      });
      return { resource, notice };
    },
  );
}

async function readStored(
  root: string,
  createdId: string,
): Promise<StoredResult> {
  const sidecar = { ...(await readSidecar(root, createdId)) } as Record<
    string,
    unknown
  >;
  for (const key of ["id", "createdAt", "updatedAt", "attachments"]) {
    delete sidecar[key];
  }
  const project = JSON.parse(
    await fs.readFile(path.join(root, "project.json"), "utf8"),
  );
  return {
    sidecar,
    excluded: project.config?.compileDefaults?.excludedResourceIds ?? [],
    notices: toastErrorMock.mock.calls.map((c) => String(c[1])),
  };
}

describe("Sources view create and rename match the tree (Feature 103, Task 18)", () => {
  let dirs: string[] = [];
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GETWRITE_PROJECTS_DIR;
    dirs = [];
  });

  afterEach(async () => {
    await flushIndexer();
    if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
    for (const dir of dirs) await removeDirRetry(dir);
  });

  async function createVia(
    kind: "tree" | "view",
    excludedIds?: string[],
  ): Promise<StoredResult & { payload: unknown }> {
    const { dir, root } = await freshProject(excludedIds);
    dirs.push(dir);
    process.env.GETWRITE_PROJECTS_DIR = dir;
    createResourceMock.mockReset();
    toastErrorMock.mockReset();
    diskCreate();
    await renderPage();
    if (kind === "tree") {
      fireEvent.click(screen.getByText("create-source"));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "New Source" }));
      fireEvent.change(screen.getByLabelText("Source name"), {
        target: { value: "New Source" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    }
    await waitFor(() => expect(createResourceMock).toHaveBeenCalledTimes(1));
    const created = (await createResourceMock.mock.results[0].value) as {
      resource: { id: string };
    };
    const stored = await readStored(root, created.resource.id);
    cleanup();
    return { ...stored, payload: createResourceMock.mock.calls[0].slice(1) };
  }

  it("create: same payload, same sidecar, and the Source is seeded out of compile", async () => {
    const tree = await createVia("tree");
    const view = await createVia("view");
    expect(view.payload).toEqual(tree.payload);
    expect(view.sidecar).toEqual(tree.sidecar);
    expect(view.sidecar.type).toBe("source");
    expect(view.excluded).toHaveLength(1);
    expect(tree.excluded).toHaveLength(1);
    expect(view.notices).toEqual([]);
    expect(tree.notices).toEqual([]);
  });

  it("create at the 5000-id cap: same stored result and the same notice", async () => {
    const full = Array.from({ length: 5000 }, (_, i) => `id-${i}`);
    const tree = await createVia("tree", full);
    const view = await createVia("view", full);
    expect(view.sidecar).toEqual(tree.sidecar);
    expect(view.excluded).toEqual(full);
    expect(tree.excluded).toEqual(full);
    expect(tree.notices).toHaveLength(1);
    expect(view.notices).toEqual(tree.notices);
  });

  it("rename: the stored sidecar after the view's rename equals the tree's call on the same input", async () => {
    const stored: Record<string, unknown>[] = [];
    for (const kind of ["tree", "view"] as const) {
      const { dir, root, dirId } = await freshProject();
      dirs.push(dir);
      process.env.GETWRITE_PROJECTS_DIR = dir;
      const made = await createResourceCore(dirId, {
        type: "source",
        name: "Interview",
        text: { plainText: "" },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
          if (String(input).includes("source-attachments")) {
            return { ok: true, status: 200, json: async () => [] } as Response;
          }
          throw new Error("not available in test");
        }),
      );
      renameResourceMock.mockReset();
      renameResourceMock.mockImplementation(
        async (id: string, projectId: string, name: string) =>
          (await renameResourceSidecarCore(projectId, id, name)) !== null,
      );
      if (kind === "tree") {
        await renameResourceMock(made.id, dirId, "Letters", "resource");
      } else {
        const { makeStore: make } = await import("../../src/store/store");
        const { setProject, setSelectedProjectId } =
          await import("../../src/store/projectsSlice");
        const { setResources } = await import("../../src/store/resourcesSlice");
        const store = make();
        store.dispatch(setProject({ id: "p", rootPath: `/projects/${dirId}` }));
        store.dispatch(setSelectedProjectId("p"));
        store.dispatch(setResources([made as AnyResource]));
        render(
          <Provider store={store}>
            <SourcesView />
          </Provider>,
        );
        fireEvent.click(
          await screen.findByRole("button", { name: "Rename Interview" }),
        );
        fireEvent.change(screen.getByLabelText("New name for Interview"), {
          target: { value: "Letters" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
          expect(renameResourceMock).toHaveBeenCalledTimes(1),
        );
        expect(renameResourceMock).toHaveBeenCalledWith(
          made.id,
          dirId,
          "Letters",
          "resource",
        );
        await waitFor(() =>
          expect(store.getState().resources.resources[0].name).toBe("Letters"),
        );
        cleanup();
      }
      const sidecar = { ...(await readSidecar(root, made.id)) } as Record<
        string,
        unknown
      >;
      for (const key of ["id", "createdAt", "updatedAt"]) delete sidecar[key];
      stored.push(sidecar);
    }
    expect(stored[1]).toEqual(stored[0]);
    expect(stored[1].name).toBe("Letters");
  });
});
