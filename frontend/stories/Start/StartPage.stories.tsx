import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
            id: "open-folder-1",
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
            id: "open-res-1",
            slug: "open-res-1",
            name: "Opening Scene",
            type: "text",
            folderId: "open-folder-1",
            createdAt: new Date().toISOString(),
            orderIndex: 0,
          },
          {
            id: "open-res-2",
            slug: "open-res-2",
            name: "Inciting Incident",
            type: "text",
            folderId: "open-folder-1",
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
  installOpenFlowFetchMock("opened-proj");
  const dispatch = useDispatch();
  const [openedName, setOpenedName] = React.useState<string | null>(null);
  const [openedResources, setOpenedResources] = React.useState<AnyResource[]>(
    [],
  );
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [openInFlight, setOpenInFlight] = React.useState<boolean>(false);

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
        {String(openInFlight)}
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
