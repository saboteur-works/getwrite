/**
 * Feature 103 Task 43 (FR-16): a Source created from the Sources view reaches
 * the page's local `selectedProject` state (`app/(app)/page.tsx`) as one
 * created through the resource tree does, not only redux. The real page and
 * the real AppShell are mounted; a wrapper only records the props the page
 * hands the shell, so the tree's create path (`onResourceAction("create")`)
 * and the view's create run on the same input. `selectedProject` is local
 * `useState`, observed as the `resources` and `folders` props it feeds.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import type { AppShellProps } from "../components/Layout/AppShell";
import type { AnyResource } from "../src/lib/models/types";

const createResourceMock = vi.fn();

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
    createResource: (...args: unknown[]) => createResourceMock(...args),
  };
});

vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: async () => [],
}));

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock("../src/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "Created Source Project",
        rootPath: "/projects/proj-dir-id",
        config: {},
      },
      folders: [],
      resources: [
        {
          id: "src-1",
          name: "Interview",
          type: "source",
          folderId: null,
          orderIndex: 0,
          userMetadata: {},
        },
      ],
    }),
}));

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

let shellProps: AppShellProps | null = null;
const currentProps = (): AppShellProps | null => shellProps;
vi.mock("../components/Layout/AppShell", async () => {
  const actual = await vi.importActual<
    typeof import("../components/Layout/AppShell")
  >("../components/Layout/AppShell");
  const Actual = actual.default;
  return {
    ...actual,
    default: (props: AppShellProps) => {
      shellProps = props;
      return <Actual {...props} />;
    },
  };
});

setupAppShellFetchStub();

const CREATED: AnyResource = {
  id: "new-source",
  name: "Field notes",
  type: "source",
  folderId: null,
  orderIndex: 1,
  userMetadata: {},
} as AnyResource;

async function mountPage() {
  const { default: Page } = await import("../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() => expect(shellProps?.resources?.length).toBe(1));
  return store;
}

const localResourceIds = (): string[] =>
  (shellProps?.resources ?? []).map((r) => r.id);

beforeEach(() => {
  shellProps = null;
  createResourceMock.mockReset();
  createResourceMock.mockResolvedValue({ resource: CREATED });
});

describe("page selectedProject after a Source is created (Task 43, FR-16)", () => {
  it("the tree's create path puts the Source in the page's local state", async () => {
    const store = await mountPage();
    await act(async () => {
      await shellProps?.onResourceAction?.("create", undefined, {
        type: "source",
        title: "Field notes",
      });
    });
    expect(localResourceIds()).toEqual(["src-1", "new-source"]);
    expect(
      store
        .getState()
        .resources.resources.some((r: { id: string }) => r.id === "new-source"),
    ).toBe(true);
  });

  it("a Source created from the Sources view is in the page's local state and redux, as the tree's create leaves it", async () => {
    // The tree's result for the same input, on a fresh page.
    const treeStore = await mountPage();
    await act(async () => {
      await shellProps?.onResourceAction?.("create", undefined, {
        type: "source",
        title: "Field notes",
      });
    });
    const treeLocal = shellProps?.resources;
    const treeRedux = treeStore.getState().resources.resources;
    cleanup();

    const store = await mountPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Sources" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "New Source" }),
    );
    await userEvent.type(screen.getByLabelText("Source name"), "Field notes");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(localResourceIds()).toContain("new-source"));

    expect(currentProps()?.resources).toEqual(treeLocal);
    expect(currentProps()?.folders).toEqual([]);
    expect(store.getState().resources.resources).toEqual(treeRedux);
    expect(createResourceMock.mock.calls[1]).toEqual(
      createResourceMock.mock.calls[0],
    );
  });
});
