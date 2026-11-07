import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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

/**
 * Feature 102, Task 29 (FR-27): when creating or copying a Source could not
 * add it to the saved compile exclusions (the 5000-id cap), the response
 * carries a `notice` and `page.tsx` shows it as a visible toast. `AppShell`
 * is a test double exposing `onResourceAction`, as in
 * page-delete-failure.test.tsx.
 */

const createResourceMock = vi.fn();
const copyResourceMock = vi.fn();

vi.mock("../../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/resources")
  >("../../src/lib/api/resources");
  return {
    ...actual,
    createResource: (...args: unknown[]) => createResourceMock(...args),
    copyResource: (...args: unknown[]) => copyResourceMock(...args),
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
    }),
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
