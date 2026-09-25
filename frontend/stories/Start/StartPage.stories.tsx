import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { within, expect } from "storybook/test";
import StartPage, {
  StartPageProps,
  StartPageCreateResult,
  StartPageProjectEntry,
} from "../../../frontend/components/Start/StartPage";
import { AnyResource, Folder, Project } from "../../src/lib/models";
import { openProject } from "../../src/lib/api/projects";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources, setFolders } from "../../src/store/resourcesSlice";
import { setEditorConfig } from "../../src/store/editorConfigSlice";
import type {
  DesktopBridge,
  DocxImportOutcome,
} from "../../src/lib/desktop-bridge";

const meta: Meta<typeof StartPage> = {
  title: "Start/StartPage",
  component: StartPage,
};

export default meta;

type Story = StoryObj<typeof StartPage>;

const project: Project = {
  id: "abcd-1234-proj",
  name: "Example Project",
  createdAt: new Date().toISOString(),
};

const folders: Folder[] = [
  {
    id: "folder-1",
    slug: "folder-1",
    name: "Folder 1",
    orderIndex: 0,
    type: "folder",
    createdAt: new Date().toISOString(),
    parentId: null,
  },
];

const resources: AnyResource[] = [
  {
    id: "res-1",
    slug: "resource-1",
    name: "Resource 1",
    type: "text",
    folderId: "folder-1",
    createdAt: new Date().toISOString(),
    orderIndex: 0,
  },
  {
    id: "res-2",
    slug: "resource-2",
    name: "Resource 2",
    type: "image",
    folderId: "folder-1",
    createdAt: new Date().toISOString(),
    orderIndex: 1,
  },
  {
    id: "res-3",
    slug: "resource-3",
    name: "Resource 3",
    type: "audio",
    createdAt: new Date().toISOString(),
    orderIndex: 2,
  },
];

export const Default: Story = {
  args: {
    projects: [{ project, folders, resources }],
    onCreate: (name: string) => console.log("create", name),
    onOpen: (id: string) => console.log("open", id),
  },
  render: (args: StartPageProps) => <StartPage {...args} />,
};

export const NoProjects: Story = {
  args: {
    projects: [],
    onCreate: (name: string) => console.log("create", name),
    onOpen: (id: string) => console.log("open", id),
  },
  render: (args: StartPageProps) => <StartPage {...args} />,
};

const olderProject: Project = {
  id: "proj-old",
  name: "Older Project",
  rootPath: "/tmp/projects/proj-old",
  createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
  updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
};

const newerProject: Project = {
  id: "proj-new",
  name: "Newer Project",
  rootPath: "/tmp/projects/proj-new",
  createdAt: new Date("2025-06-01T00:00:00Z").toISOString(),
  updatedAt: new Date("2025-06-01T00:00:00Z").toISOString(),
};

const olderFolders: Folder[] = [
  {
    id: "old-folder-1",
    slug: "old-folder-1",
    name: "Chapters",
    orderIndex: 0,
    type: "folder",
    createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    parentId: null,
  },
];

const olderResources: AnyResource[] = [
  {
    id: "old-res-1",
    slug: "old-res-1",
    name: "Chapter 1",
    type: "text",
    folderId: "old-folder-1",
    createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    orderIndex: 0,
  },
];

const newerFolders: Folder[] = [
  {
    id: "new-folder-1",
    slug: "new-folder-1",
    name: "Scenes",
    orderIndex: 0,
    type: "folder",
    createdAt: new Date("2025-06-01T00:00:00Z").toISOString(),
    parentId: null,
  },
  {
    id: "new-folder-2",
    slug: "new-folder-2",
    name: "Notes",
    orderIndex: 1,
    type: "folder",
    createdAt: new Date("2025-06-01T00:00:00Z").toISOString(),
    parentId: null,
  },
];

const newerResources: AnyResource[] = [
  {
    id: "new-res-1",
    slug: "new-res-1",
    name: "Opening Scene",
    type: "text",
    folderId: "new-folder-1",
    createdAt: new Date("2025-06-01T00:00:00Z").toISOString(),
    orderIndex: 0,
  },
  {
    id: "new-res-2",
    slug: "new-res-2",
    name: "Character Sketch",
    type: "text",
    folderId: "new-folder-2",
    createdAt: new Date("2025-06-01T00:00:00Z").toISOString(),
    orderIndex: 1,
  },
];

const interactiveProjects: StartPageProjectEntry[] = [
  { project: olderProject, folders: olderFolders, resources: olderResources },
  { project: newerProject, folders: newerFolders, resources: newerResources },
];

function installStartPageFetchMock(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__startPageFetchMockInstalled) return;
  (window as any).__startPageFetchMockInstalled = true;
  const origFetch = window.fetch;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/api/project-types")) {
      return new Response(
        JSON.stringify([
          {
            id: "novel",
            name: "Novel",
            description: "Long form fiction",
            folders: [{ name: "Chapters" }],
          },
          {
            id: "blank",
            name: "Blank",
            description: "Empty workspace",
            folders: [{ name: "Root" }],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/api/projects") && init?.method === "POST") {
      try {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        const project = {
          id: `proj_${Date.now()}`,
          name: body.name,
          rootPath: `/tmp/projects/proj_${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        return new Response(
          JSON.stringify({ project, folders: [], resources: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (_e) {
        return new Response(null, { status: 500 });
      }
    }
    return origFetch(input, init);
  };
}

interface OpenFlowMockState {
  installed: boolean;
  lastOpenPayload: string | null;
  shouldFailNextOpen: boolean;
}

function getOpenFlowMockState(): OpenFlowMockState {
  if (typeof window === "undefined") {
    return {
      installed: false,
      lastOpenPayload: null,
      shouldFailNextOpen: false,
    };
  }
  const w = window as unknown as { __openFlowMockState?: OpenFlowMockState };
  if (!w.__openFlowMockState) {
    w.__openFlowMockState = {
      installed: false,
      lastOpenPayload: null,
      shouldFailNextOpen: false,
    };
  }
  return w.__openFlowMockState;
}

/**
 * Ids used by the open-project flow mock below.
 *
 * `openProject` validates its response against `ProjectApiEntrySchema`
 * (`src/lib/api/schemas.ts`), whose `project`, `folders` and `resources`
 * entries all require a real UUID `id`. The readable slugs these replace
 * ("opened-proj", "open-res-1", ...) fail that validation, so `openProject`
 * threw and the opened-project view never rendered.
 *
 * Fixed rather than generated so `start-to-editor-flow.e2e.spec.ts` can
 * address the rendered rows by `data-testid`; that spec repeats these literals
 * and the two must be kept in step.
 *
 * NOT exported: in CSF every named export of a `.stories.tsx` is treated as a
 * story, so exporting these made Storybook try to render four strings as
 * stories and broke the whole file.
 */
const OPENED_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OPENED_FOLDER_ID = "22222222-2222-4222-8222-222222222222";
const OPENED_RESOURCE_1_ID = "33333333-3333-4333-8333-333333333333";
const OPENED_RESOURCE_2_ID = "44444444-4444-4444-8444-444444444444";

function installOpenFlowFetchMock(openedProjectId: string): void {
  const state = getOpenFlowMockState();
  if (state.installed) return;
  state.installed = true;

  const origFetch = window.fetch;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/api/project") && init?.method === "POST") {
      try {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        state.lastOpenPayload = JSON.stringify(body);

        if (state.shouldFailNextOpen) {
          state.shouldFailNextOpen = false;
          return new Response(JSON.stringify({ error: "Project not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const respFolders: Folder[] = [
          {
            id: OPENED_FOLDER_ID,
            slug: "open-folder-1",
            name: "Chapters",
            orderIndex: 0,
            type: "folder",
            createdAt: new Date().toISOString(),
            parentId: null,
          },
        ];
        const respResources: AnyResource[] = [
          {
            id: OPENED_RESOURCE_1_ID,
            slug: "open-res-1",
            name: "Opening Scene",
            type: "text",
            folderId: OPENED_FOLDER_ID,
            createdAt: new Date().toISOString(),
            orderIndex: 0,
          },
          {
            id: OPENED_RESOURCE_2_ID,
            slug: "open-res-2",
            name: "Inciting Incident",
            type: "text",
            folderId: OPENED_FOLDER_ID,
            createdAt: new Date().toISOString(),
            orderIndex: 1,
          },
        ];
        const respProject: Project = {
          id: openedProjectId,
          name: "Opened Manuscript",
          rootPath: body.projectPath ?? "/tmp/opened",
          createdAt: new Date().toISOString(),
          config: {
            wordCountGoal: 50000,
            editorConfig: { headings: {}, body: { lineHeight: "1.8" } },
          } as any,
        };
        return new Response(
          JSON.stringify({
            project: respProject,
            folders: respFolders,
            resources: respResources,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (_e) {
        return new Response(null, { status: 500 });
      }
    }
    return origFetch(input, init);
  };
}

const openFlowSourceProjects: StartPageProjectEntry[] = [
  {
    project: {
      id: "src-proj-1",
      name: "Disk Project",
      rootPath: "/tmp/projects/disk-proj",
      createdAt: new Date().toISOString(),
    },
    folders: [],
    resources: [],
  },
];

function OpenProjectFlowStory(): JSX.Element {
  installOpenFlowFetchMock(OPENED_PROJECT_ID);
  const dispatch = useDispatch();
  const [openedName, setOpenedName] = React.useState<string | null>(null);
  const [openedResources, setOpenedResources] = React.useState<AnyResource[]>(
    [],
  );
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [isOpenInFlight, setOpenInFlight] = React.useState<boolean>(false);

  const handleOpen = async (projectPath: string) => {
    setOpenInFlight(true);
    setOpenError(null);
    try {
      const p = await openProject(projectPath);
      dispatch(
        setProject({
          id: p.project.id,
          name: p.project.name,
          rootPath: p.project.rootPath ?? "",
          folders: p.folders,
          resources: p.resources.map((r) => ({
            id: r.id,
            name: r.name,
            folderId: r.folderId ?? null,
            userMetadata: r.userMetadata ?? {},
          })),
          metadata: p.project.metadata,
          statuses: p.project.config?.statuses ?? [],
          metadataSchema: p.project.config?.metadataSchema,
        }),
      );
      dispatch(
        setEditorConfig({
          headings: p.project.config?.editorConfig?.headings ?? {},
          body: p.project.config?.editorConfig?.body,
        }),
      );
      dispatch(setSelectedProjectId(p.project.id));
      dispatch(setResources(p.resources));
      dispatch(setFolders(p.folders));
      setOpenedName(p.project.name);
      setOpenedResources(p.resources);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenInFlight(false);
    }
  };

  if (openedName) {
    return (
      <div data-testid="project-opened-marker">
        <h2 data-testid="opened-project-name">{openedName}</h2>
        <ul data-testid="opened-resource-list">
          {openedResources.map((r) => (
            <li key={r.id} data-testid={`opened-resource-${r.id}`}>
              {r.name}
            </li>
          ))}
        </ul>
        <span data-testid="opened-resource-count">
          {openedResources.length}
        </span>
      </div>
    );
  }

  return (
    <div>
      <StartPage projects={openFlowSourceProjects} onOpen={handleOpen} />
      <div data-testid="open-in-flight" aria-hidden style={{ display: "none" }}>
        {String(isOpenInFlight)}
      </div>
      <div data-testid="open-error" aria-hidden style={{ display: "none" }}>
        {openError ?? ""}
      </div>
    </div>
  );
}

/**
 * Drives the same handleOpen logic page.tsx uses when a user clicks "Open
 * Project" on a start-page card. Mocks POST /api/project, dispatches the
 * resulting project + resources into the store, and swaps the StartPage for
 * a small marker view so e2e tests can verify the transition.
 */
export const OpenProjectFlow: Story = {
  render: () => <OpenProjectFlowStory />,
};

interface PackageFlowMockState {
  installed: boolean;
  lastCompileUrl: string | null;
  lastCompileBody: string | null;
}

function getPackageFlowMockState(): PackageFlowMockState {
  const w = window as unknown as {
    __packageFlowMockState?: PackageFlowMockState;
  };
  if (!w.__packageFlowMockState) {
    w.__packageFlowMockState = {
      installed: false,
      lastCompileUrl: null,
      lastCompileBody: null,
    };
  }
  return w.__packageFlowMockState;
}

function installPackageFlowFetchMock(): void {
  const state = getPackageFlowMockState();
  if (state.installed) return;
  state.installed = true;
  const origFetch = window.fetch;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/compile/") && init?.method === "POST") {
      state.lastCompileUrl = url;
      state.lastCompileBody = init.body ? String(init.body) : null;
      if (url.endsWith("/text")) {
        return new Response(
          JSON.stringify({ text: "compiled body", filename: "compiled.txt" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // pdf/docx — return a small array buffer with a filename header.
      const headers = new Headers({
        "Content-Type": url.endsWith("/pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="compiled.${
          url.endsWith("/pdf") ? "pdf" : "docx"
        }"`,
      });
      return new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers,
      });
    }
    return origFetch(input, init);
  };
}

const packageFolderId = "pack-folder-1";
const packageProjectEntry: StartPageProjectEntry = {
  project: {
    id: "pack-proj",
    name: "Packageable Project",
    rootPath: "/tmp/projects/pack",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // StartPage.compileResources iterates folders[].resources to build the
  // resource tree the modal renders, so resources live INSIDE the folder here.
  folders: [
    {
      id: packageFolderId,
      slug: packageFolderId,
      name: "Chapters",
      orderIndex: 0,
      type: "folder",
      createdAt: new Date().toISOString(),
      parentId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resources: [
        {
          id: "pack-res-1",
          slug: "pack-res-1",
          title: "Chapter One",
          type: "text",
          createdAt: new Date().toISOString(),
          _orderIndex: 0,
          content: "Once upon a time.",
        },
        {
          id: "pack-res-2",
          slug: "pack-res-2",
          title: "Chapter Two",
          type: "text",
          createdAt: new Date().toISOString(),
          _orderIndex: 1,
          content: "And then.",
        },
      ],
    } as any,
  ],
  // Top-level resources/folders counts still feed hero stats.
  resources: [
    {
      id: "pack-res-1",
      slug: "pack-res-1",
      name: "Chapter One",
      type: "text",
      folderId: packageFolderId,
      createdAt: new Date().toISOString(),
      orderIndex: 0,
    },
    {
      id: "pack-res-2",
      slug: "pack-res-2",
      name: "Chapter Two",
      type: "text",
      folderId: packageFolderId,
      createdAt: new Date().toISOString(),
      orderIndex: 1,
    },
  ],
};

function PackageFlowStory(): JSX.Element {
  installPackageFlowFetchMock();
  return <StartPage projects={[packageProjectEntry]} />;
}

/**
 * Variant of StartPage seeded with one project whose folder contains text
 * resources in the shape `compileResources` expects. Mocks /api/compile/*
 * so e2e tests can drive Package → CompilePreviewModal → compile and assert
 * the request URL and body.
 */
export const PackageFlow: Story = { render: () => <PackageFlowStory /> };

export const Interactive: Story = {
  args: { projects: interactiveProjects },
  render: (args: StartPageProps) => {
    installStartPageFetchMock();

    const Wrapper = () => {
      const [lastAction, setLastAction] = React.useState<string | null>(null);
      const [lastPayload, setLastPayload] = React.useState<string | null>(null);

      return (
        <div>
          <StartPage
            {...args}
            onOpen={(id) => {
              setLastAction("open");
              setLastPayload(id);
            }}
            onCreate={(result: StartPageCreateResult) => {
              setLastAction("create");
              setLastPayload(result.project.name ?? result.project.id);
            }}
          />
          <div
            data-testid="last-action"
            aria-hidden
            style={{ display: "none" }}
          >
            {lastAction ?? ""}
          </div>
          <div
            data-testid="last-payload"
            aria-hidden
            style={{ display: "none" }}
          >
            {lastPayload ?? ""}
          </div>
        </div>
      );
    };

    return <Wrapper />;
  },
};

/**
 * Installs a fake desktop bridge on `window`, mirroring the convention
 * `tests/component/StartPage.test.tsx` and
 * `tests/component/ImportScrivenerDialog.test.tsx` both use.
 */
function installScrivenerBridge(): void {
  const bridge: DesktopBridge = {
    getWorkspaceDir: async () => "/tmp",
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    restart: async () => {},
    chooseScrivenerSource: async () => ({
      ok: true,
      handle: "handle-1",
      displayName: "My Novel",
    }),
    startScrivenerImport: async () => ({
      kind: "success",
      projectId: "proj-1",
      projectRoot: "/tmp/proj-1",
      folderCount: 1,
      resourceCount: 1,
      tagCount: 0,
      report: "Report body",
    }),
    // Feature 45's three DOCX methods were missing here. StartPage renders
    // "Import Word Document" whenever a bridge is present, so the button was
    // on screen with `chooseDocxFile` undefined behind it.
    chooseDocxFile: async () => ({ ok: false, cancelled: true }),
    chooseDocxFolder: async () => ({ ok: false, cancelled: true }),
    startDocxImport: () => new Promise<DocxImportOutcome>(() => {}),
  };
  (window as unknown as Record<string, unknown>).getwriteDesktop = bridge;
}

/** Removes the fake desktop bridge, mimicking web/native (no bridge). */
function removeScrivenerBridge(): void {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
}

/**
 * The "Import from Scrivener" launcher renders only when a desktop bridge is
 * present (Task 9, Feature 43) — this story installs a fake one.
 */
export const ImportButtonVisible: Story = {
  args: { projects: [] },
  render: (args: StartPageProps) => {
    installScrivenerBridge();
    return <StartPage {...args} />;
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: /Import from Scrivener/i });
  },
};

/**
 * With no desktop bridge (web/native), the Import control is absent
 * entirely — not merely disabled.
 */
export const ImportButtonAbsent: Story = {
  args: { projects: [] },
  render: (args: StartPageProps) => {
    removeScrivenerBridge();
    return <StartPage {...args} />;
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    // Wait a tick for StartPage's render to settle, then assert absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      canvas.queryByRole("button", { name: /Import from Scrivener/i }),
    ).not.toBeInTheDocument();
  },
};

/**
 * The "Import Word Document" launcher renders only when a desktop bridge is
 * present (Task 17, DOCX importer) — this story installs a fake one that
 * also satisfies the DOCX bridge methods `ImportDocxDialog` needs.
 */
export const ImportDocxButtonVisible: Story = {
  args: { projects: [] },
  render: (args: StartPageProps) => {
    installScrivenerBridge();
    return <StartPage {...args} />;
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: /Import Word Document/i });
  },
};

/**
 * With no desktop bridge (web/native), the Import Word Document control is
 * absent entirely — not merely disabled.
 */
export const ImportDocxButtonAbsent: Story = {
  args: { projects: [] },
  render: (args: StartPageProps) => {
    removeScrivenerBridge();
    return <StartPage {...args} />;
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    // Wait a tick for StartPage's render to settle, then assert absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      canvas.queryByRole("button", { name: /Import Word Document/i }),
    ).not.toBeInTheDocument();
  },
};
