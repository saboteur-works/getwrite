import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

// Same rationale as page-default-revision-name.test.tsx: this file is not
// about sharing limits, so they are fixed at "exempt".
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

/**
 * note_13ae633c: with the sidecar write failing (500) in the running app, a
 * Status change stayed on screen with no message and was gone after a
 * reload. A failed save now puts the changed keys back and shows an error.
 * `AppShell` and `StartPage` are stubbed (as in
 * page-default-revision-name.test.tsx) so the test drives `page.tsx`'s
 * `updateResource` through the captured `onChangeStatus` prop.
 */

const updateSidecar = vi.fn();
const toastError = vi.fn();

vi.mock("../../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/resources")
  >("../../src/lib/api/resources");
  return {
    ...actual,
    updateSidecar: (...args: unknown[]) => updateSidecar(...args),
  };
});

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "Test Project",
        rootPath: "/projects/proj-dir-id",
        config: {},
      },
      folders: [],
      resources: [
        {
          id: "res-1",
          name: "Scene 1",
          type: "text",
          folderId: null,
          orderIndex: 0,
          userMetadata: { status: "Outline" },
        },
      ],
    }),
}));

type ShellProps = {
  project?: {
    resources?: { id: string; userMetadata?: { status?: string } }[];
  } | null;
  onChangeStatus?: (status: string, resourceId: string) => void;
  children?: React.ReactNode;
};

let shellProps: ShellProps = {};

vi.mock("../../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: ShellProps) => {
    shellProps = props;
    const status = props.project?.resources?.find((r) => r.id === "res-1")
      ?.userMetadata?.status;
    return (
      <div>
        <div data-testid="shown-status">{status ?? "(none)"}</div>
        {props.children}
      </div>
    );
  },
}));

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  shellProps = {};
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
});

async function renderOpenedPage() {
  const { default: Page } = await import("../../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("shown-status")).toHaveTextContent("Outline"),
  );
  return store;
}

const storedStatus = (store: ReturnType<typeof makeStore>) =>
  (
    store.getState().resources.resources.find((r) => r.id === "res-1") as {
      userMetadata?: { status?: string };
    }
  )?.userMetadata?.status;

describe("page.tsx metadata save failure (note_13ae633c)", () => {
  it("puts the change back and tells the writer when the sidecar save fails", async () => {
    updateSidecar.mockRejectedValue(
      new Error("Failed to update sidecar (500)"),
    );
    const store = await renderOpenedPage();

    act(() => shellProps.onChangeStatus?.("Draft", "res-1"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe("Change not saved");
    expect(toastError.mock.calls[0][1]).toContain("Scene 1");
    await waitFor(() =>
      expect(screen.getByTestId("shown-status")).toHaveTextContent("Outline"),
    );
    expect(storedStatus(store)).toBe("Outline");
  });

  it("keeps the change and shows nothing when the save succeeds", async () => {
    updateSidecar.mockResolvedValue(undefined);
    const store = await renderOpenedPage();

    act(() => shellProps.onChangeStatus?.("Draft", "res-1"));

    await waitFor(() => expect(updateSidecar).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId("shown-status")).toHaveTextContent("Draft");
    expect(storedStatus(store)).toBe("Draft");
  });
});
