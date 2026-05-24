import React from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AppShell from "../../components/Layout/AppShell";
import { setResources, setFolders } from "../../src/store/resourcesSlice";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import type {
  AnyResource,
  Folder,
  Project as CanonicalProject,
} from "../../src/lib/models";

const meta: Meta<typeof AppShell> = {
  title: "Layout/AppShellAfterOpen",
  component: AppShell,
};

export default meta;

type Story = StoryObj<typeof AppShell>;

interface OpenedResource {
  id: string;
  name: string;
  revisionId: string;
  contentJson: string;
}

const folderId = "after-open-folder-1";

const openedResources: OpenedResource[] = [
  {
    id: "after-open-res-1",
    name: "Opening Chapter",
    revisionId: "rev-open-1",
    contentJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Opening chapter body." }],
        },
      ],
    }),
  },
  {
    id: "after-open-res-2",
    name: "Second Chapter",
    revisionId: "rev-open-2",
    contentJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second chapter body." }],
        },
      ],
    }),
  },
];

function buildSeededResources(): AnyResource[] {
  const now = new Date().toISOString();
  return openedResources.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.id,
    type: "text",
    folderId,
    createdAt: now,
    plainText: "",
    wordCount: 0,
    charCount: 0,
    paragraphCount: 0,
    orderIndex: openedResources.indexOf(r),
  })) as AnyResource[];
}

function buildSeededFolders(): Folder[] {
  return [
    {
      id: folderId,
      slug: folderId,
      name: "Chapters",
      orderIndex: 0,
      type: "folder",
      createdAt: new Date().toISOString(),
      parentId: null,
    },
  ];
}

const seededProject: CanonicalProject = {
  id: "after-open-proj",
  name: "After-Open Project",
  // Leave rootPath empty so useRevisionContent skips the HTTP load path and
  // we drive content via dispatched revision-fulfilled actions instead.
  rootPath: "",
  createdAt: new Date().toISOString(),
};

function installAppShellFetchMock(): void {
  const w = window as unknown as { __appShellMockInstalled?: boolean };
  if (w.__appShellMockInstalled) return;
  w.__appShellMockInstalled = true;
  const origFetch = window.fetch;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    // loadSavedQueries fires on project mount.
    if (url.endsWith("/api/project/query/saved")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return origFetch(input, init);
  };
}

function AppShellAfterOpenStory(): JSX.Element {
  installAppShellFetchMock();
  const dispatch = useDispatch();
  const [ready, setReady] = React.useState(false);
  const seededResources = React.useMemo(buildSeededResources, []);
  const seededFolders = React.useMemo(buildSeededFolders, []);

  // ResourceTree dispatches setSelectedResourceId directly via Redux, so we
  // watch the slice rather than relying on AppShell's onResourceSelect prop.
  const selectedResourceId = useSelector(
    (state: { resources: { selectedResourceId: string | null } }) =>
      state.resources.selectedResourceId,
  );

  const seedRevisionFor = React.useCallback(
    (resource: OpenedResource) => {
      dispatch({
        type: "revisions/loadRevisionsForSelectedResource/pending",
        meta: { arg: { resourceId: resource.id } },
      });
      dispatch({
        type: "revisions/loadRevisionsForSelectedResource/fulfilled",
        payload: {
          resourceId: resource.id,
          revisions: [
            {
              id: resource.revisionId,
              resourceId: resource.id,
              versionNumber: 1,
              createdAt: new Date().toISOString(),
              filePath: `/tmp/${resource.revisionId}.json`,
              isCanonical: true,
              displayName: "Canonical",
            },
          ],
          currentRevisionId: resource.revisionId,
        },
      });
      dispatch({
        type: "revisions/fetchRevisionContentForSelectedResource/fulfilled",
        payload: {
          resourceId: resource.id,
          revisionId: resource.revisionId,
          content: resource.contentJson,
        },
      });
    },
    [dispatch],
  );

  // Seed revision content whenever the tree selects a new resource.
  React.useEffect(() => {
    if (!selectedResourceId) return;
    const match = openedResources.find((r) => r.id === selectedResourceId);
    if (match) seedRevisionFor(match);
  }, [selectedResourceId, seedRevisionFor]);

  React.useEffect(() => {
    dispatch(
      setProject({
        id: seededProject.id,
        name: seededProject.name,
        rootPath: seededProject.rootPath ?? "",
        folders: seededFolders,
        resources: seededResources.map((r) => ({
          id: r.id,
          name: r.name,
          folderId: r.folderId ?? null,
          userMetadata: r.userMetadata ?? {},
        })),
      }),
    );
    dispatch(setSelectedProjectId(seededProject.id));
    dispatch(setResources(seededResources));
    dispatch(setFolders(seededFolders));
    setReady(true);
  }, [dispatch, seededFolders, seededResources]);

  if (!ready) return <div data-testid="seeding">Seeding…</div>;

  return (
    <div style={{ height: "100vh" }}>
      <AppShell
        showSidebars
        resources={seededResources}
        folders={seededFolders}
        project={seededProject}
        selectedResourceId={selectedResourceId}
      />
      <div
        data-testid="last-selected-resource"
        aria-hidden
        style={{ display: "none" }}
      >
        {selectedResourceId ?? ""}
      </div>
    </div>
  );
}

/**
 * Renders the real AppShell with a seeded project + resources, the same way
 * page.tsx renders it after a successful open. The story drives resource
 * selection through Redux so e2e tests can verify project name, tree
 * contents, and editor content-switch in one place.
 */
export const Default: Story = { render: () => <AppShellAfterOpenStory /> };
