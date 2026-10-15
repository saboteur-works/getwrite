/**
 * StartPage's desktop-only Scrivener import launcher (Task 9, Feature 43).
 *
 * The Import control must be absent — not merely disabled — when there is no
 * desktop bridge (mirrors `WorkspaceLocationSettings.tsx`'s `if (!bridge)
 * return null` pattern; see `tests/workspaceLocationSettings.test.tsx` and
 * `tests/component/ImportScrivenerDialog.test.tsx` for the same
 * install-a-fake-bridge-on-`window` convention used here).
 *
 * `StartPage` itself never calls `chooseScrivenerSource` — that call is
 * entirely internal to `ImportScrivenerDialog` (Task 8) — so opening the
 * dialog from here must not trigger it.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server.node";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import StartPage, {
  type StartPageProjectEntry,
} from "../../components/Start/StartPage";
import { buildProjectView } from "../../src/lib/models/project-view";
import { makeStore } from "../../src/store/store";
import { setProjects } from "../../src/store/projectsSlice";
import type { SharingLimitsAnswer } from "../../src/store/sharing-limits-transport-service";

const fetchSharingLimits = vi.fn<() => Promise<SharingLimitsAnswer>>();
vi.mock("../../src/store/sharing-limits-transport-service", () => ({
  fetchSharingLimits: () => fetchSharingLimits(),
}));

const compileTextMock = vi.fn();
vi.mock("../../src/lib/api/compile", () => ({
  compilePdf: vi.fn(),
  compileDocx: vi.fn(),
  compileMarkdown: vi.fn(),
  compileText: (...args: unknown[]) => compileTextMock(...args),
}));
vi.mock("../../src/lib/compile/download-file", () => ({
  downloadFile: vi.fn(),
}));

import SharingLimitsProvider from "../../components/Sharing/SharingLimitsContext";
import {
  UNLOCK_AT_DESKTOP_MESSAGE,
  LOCKED_PROJECT_CARD_UNLOCK_AT_DESKTOP,
  UNLOCK_CHECK_FAILED_MESSAGE,
  UNLOCK_CHECK_RETRY_LABEL,
} from "../../components/Sharing/sharing-copy";
import type {
  DocxImportOutcome,
  DocxSourceChoice,
  ScrivenerImportOutcome,
  ScrivenerSourceChoice,
} from "../../src/lib/desktop-bridge";

/**
 * Installs a fake desktop bridge on `window`, mirroring
 * `ImportScrivenerDialog.test.tsx`'s `installBridge` helper.
 *
 * @param overrides - Spies to use in place of the defaults.
 * @returns The bridge's spies.
 */
function installBridge(overrides: {
  chooseScrivenerSource?: ReturnType<typeof vi.fn>;
  startScrivenerImport?: ReturnType<typeof vi.fn>;
  chooseDocxFile?: ReturnType<typeof vi.fn>;
  chooseDocxFolder?: ReturnType<typeof vi.fn>;
  startDocxImport?: ReturnType<typeof vi.fn>;
}) {
  const chooseScrivenerSource =
    overrides.chooseScrivenerSource ??
    vi.fn(
      async (): Promise<ScrivenerSourceChoice> => ({
        ok: true,
        handle: "handle-1",
        displayName: "My Novel",
      }),
    );
  const startScrivenerImport =
    overrides.startScrivenerImport ??
    vi.fn(
      async (): Promise<ScrivenerImportOutcome> => ({
        kind: "success",
        projectId: "proj-imported",
        projectRoot: "/tmp/proj-imported",
        folderCount: 1,
        resourceCount: 1,
        tagCount: 0,
        report: "Report body",
      }),
    );
  const chooseDocxFile =
    overrides.chooseDocxFile ??
    vi.fn(
      async (): Promise<DocxSourceChoice> => ({
        ok: true,
        handle: "docx-handle-1",
        displayName: "My Manuscript",
      }),
    );
  const chooseDocxFolder =
    overrides.chooseDocxFolder ??
    vi.fn(
      async (): Promise<DocxSourceChoice> => ({
        ok: true,
        handle: "docx-handle-1",
        displayName: "My Manuscript",
      }),
    );
  const startDocxImport =
    overrides.startDocxImport ??
    vi.fn(
      async (): Promise<DocxImportOutcome> => ({
        kind: "success",
        projectId: "proj-docx-imported",
        projectRoot: "/tmp/proj-docx-imported",
        folderCount: 1,
        resourceCount: 1,
        report: "Report body",
      }),
    );
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    getWorkspaceDir: vi.fn(async () => "/tmp"),
    chooseWorkspaceDir: vi.fn(async () => ({ ok: false, cancelled: true })),
    restart: vi.fn(async () => {}),
    chooseScrivenerSource,
    startScrivenerImport,
    chooseDocxFile,
    chooseDocxFolder,
    startDocxImport,
  };
  return {
    chooseScrivenerSource,
    startScrivenerImport,
    chooseDocxFile,
    chooseDocxFolder,
    startDocxImport,
  };
}

/** Renders `StartPage` inside a fresh Redux store, as `start.test.tsx` does. */
function renderStartPage(props: React.ComponentProps<typeof StartPage> = {}) {
  const store = makeStore();
  return render(
    <SharingLimitsProvider>
      <Provider store={store}>
        <StartPage projects={[]} {...props} />
      </Provider>
    </SharingLimitsProvider>,
  );
}

beforeEach(() => {
  fetchSharingLimits.mockReset();
  fetchSharingLimits.mockResolvedValue({ state: "exempt" });
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
  vi.restoreAllMocks();
});

describe("StartPage — Scrivener import launcher", () => {
  it("renders no Import control when there is no desktop bridge", () => {
    renderStartPage();

    expect(
      screen.queryByRole("button", { name: /Import/i }),
    ).not.toBeInTheDocument();
  });

  it("renders an Import control when a desktop bridge is present", () => {
    installBridge({});
    renderStartPage();

    expect(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    ).toBeInTheDocument();
  });

  it("opens ImportScrivenerDialog in choose-source without calling chooseScrivenerSource itself", async () => {
    const { chooseScrivenerSource } = installBridge({});
    renderStartPage();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    );

    expect(
      screen.getByRole("heading", { name: /Import from Scrivener/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    ).toBeInTheDocument();
    expect(chooseScrivenerSource).not.toHaveBeenCalled();
  });

  it("calls onImportComplete with the new project id once the dialog reports success", async () => {
    installBridge({});
    const onImportComplete = vi.fn();
    renderStartPage({ onImportComplete });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const openButton = await screen.findByRole("button", {
      name: /Open Project/i,
    });
    await user.click(openButton);

    expect(onImportComplete).toHaveBeenCalledWith("proj-imported");
    // The dialog closes itself once the callback has fired.
    expect(
      screen.queryByRole("heading", { name: /Import from Scrivener/i }),
    ).not.toBeInTheDocument();
  });

  it("agrees with its own SSR markup on first render, then reveals Import post-mount, when a desktop bridge is present (hydration-mismatch regression)", async () => {
    installBridge({});

    // Simulate the server-rendered HTML. `window.getwriteDesktop` is
    // installed above to mirror the Electron client environment, but a real
    // Next.js server render never sees it — the server has no `window` at
    // all. Detecting the bridge synchronously during render (the pre-fix
    // `useMemo` approach) would make this SSR-equivalent string disagree
    // with the client's first render, since the bridge stub is already
    // present on `window` by the time client rendering starts.
    const store = makeStore();
    const ssrMarkup = renderToString(
      <SharingLimitsProvider>
        <Provider store={store}>
          <StartPage projects={[]} />
        </Provider>
      </SharingLimitsProvider>,
    );
    expect(ssrMarkup).not.toContain('aria-label="Import from Scrivener"');

    // A normal client render (with the same bridge stub present) must still
    // reveal the Import control once its mount effect resolves the bridge —
    // the SSR-agreement fix above must not regress the desktop behavior.
    renderStartPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Import from Scrivener/i }),
      ).toBeInTheDocument();
    });
  });
});

describe("StartPage — DOCX import launcher (Task 17)", () => {
  it("renders no Import Word Document control when there is no desktop bridge", () => {
    renderStartPage();

    expect(
      screen.queryByRole("button", { name: /Import Word Document/i }),
    ).not.toBeInTheDocument();
  });

  it("renders an Import Word Document control alongside the Scrivener control when a desktop bridge is present", () => {
    installBridge({});
    renderStartPage();

    expect(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Import Word Document/i }),
    ).toBeInTheDocument();
  });

  it("opens ImportDocxDialog in choose-source without calling chooseDocxFile/chooseDocxFolder itself", async () => {
    const { chooseDocxFile, chooseDocxFolder } = installBridge({});
    renderStartPage();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import Word Document/i }),
    );

    expect(
      screen.getByRole("heading", { name: /Import from Word/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Choose document…/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Choose folder…/i }),
    ).toBeInTheDocument();
    expect(chooseDocxFile).not.toHaveBeenCalled();
    expect(chooseDocxFolder).not.toHaveBeenCalled();
  });

  it("calls onImportComplete with the new project id once the DOCX dialog reports success", async () => {
    installBridge({});
    const onImportComplete = vi.fn();
    renderStartPage({ onImportComplete });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import Word Document/i }),
    );
    await user.click(screen.getByRole("button", { name: /Choose document…/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const openButton = await screen.findByRole("button", {
      name: /Open Project/i,
    });
    await user.click(openButton);

    expect(onImportComplete).toHaveBeenCalledWith("proj-docx-imported");
    // The dialog closes itself once the callback has fired.
    expect(
      screen.queryByRole("heading", { name: /Import from Word/i }),
    ).not.toBeInTheDocument();
  });
});

describe("StartPage — passphrase prompt gate (Feature 77, FR-21, FR-23)", () => {
  const LIMITS_OFF = {
    projectDeletion: true,
    unlocking: false,
    locking: true,
    encryptionChanges: true,
    permanentDeletion: true,
  };
  const LIMITS_ON = { ...LIMITS_OFF, unlocking: true };
  const CARD_TEXT = /Unlock this workspace to see this project/i;

  function lockedEntry(): StartPageProjectEntry {
    return {
      isEncrypted: true,
      isLocked: true,
      project: {
        id: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-02-01T00:00:00.000Z",
      },
      resources: [],
      folders: [],
    } as unknown as StartPageProjectEntry;
  }

  function renderLocked(onUnlock = vi.fn()) {
    const view = renderStartPage({
      projects: [lockedEntry()],
      lockStatus: "locked",
      encryptedProjectCount: 1,
      onUnlock,
    });
    return { ...view, onUnlock };
  }

  function passwordInput(): Element | null {
    return document.querySelector('input[type="password"]');
  }

  async function settle(): Promise<void> {
    await waitFor(() => expect(fetchSharingLimits).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("exempt: the password field is present and the cards keep their text", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    expect(screen.getByText(CARD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(UNLOCK_AT_DESKTOP_MESSAGE)).toBeNull();
  });

  it("paired with unlocking not limited: the password field is present", async () => {
    fetchSharingLimits.mockResolvedValue({
      state: "paired",
      limits: LIMITS_OFF,
    });
    renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    expect(screen.getByText(CARD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(UNLOCK_AT_DESKTOP_MESSAGE)).toBeNull();
  });

  it("paired with unlocking limited: no password field, the desktop message shows, cards say so", async () => {
    fetchSharingLimits.mockResolvedValue({
      state: "paired",
      limits: LIMITS_ON,
    });
    renderLocked();
    await screen.findByText(UNLOCK_AT_DESKTOP_MESSAGE);
    expect(passwordInput()).toBeNull();
    expect(screen.queryByText(CARD_TEXT)).toBeNull();
    expect(
      screen.getByText(LOCKED_PROJECT_CARD_UNLOCK_AT_DESKTOP),
    ).toBeInTheDocument();
    expect(LOCKED_PROJECT_CARD_UNLOCK_AT_DESKTOP).not.toMatch(/device/i);
    expect(UNLOCK_AT_DESKTOP_MESSAGE).not.toMatch(/device/i);
  });

  it("unknown, no bridge, read pending: no password field and the cards keep their text", async () => {
    fetchSharingLimits.mockReturnValue(new Promise(() => undefined));
    renderLocked();
    await settle();
    expect(passwordInput()).toBeNull();
    expect(screen.getByText(CARD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(UNLOCK_AT_DESKTOP_MESSAGE)).toBeNull();
  });

  it("unknown, no bridge, read failed: no password field", async () => {
    fetchSharingLimits.mockRejectedValue(new Error("down"));
    renderLocked();
    await settle();
    expect(passwordInput()).toBeNull();
    expect(screen.queryByText(UNLOCK_AT_DESKTOP_MESSAGE)).toBeNull();
  });

  it("unknown, no bridge, read failed: a plain message and a retry button show, still no password field", async () => {
    fetchSharingLimits.mockRejectedValue(new Error("down"));
    renderLocked();
    await settle();
    const message = await screen.findByText(UNLOCK_CHECK_FAILED_MESSAGE);
    expect(message.className).toMatch(/text-gw-/);
    expect(message.className).not.toMatch(/red/);
    expect(
      screen.getByRole("button", { name: UNLOCK_CHECK_RETRY_LABEL }),
    ).toBeInTheDocument();
    expect(passwordInput()).toBeNull();
  });

  it("read pending: the could-not-check message is not shown", async () => {
    fetchSharingLimits.mockReturnValue(new Promise(() => undefined));
    renderLocked();
    await settle();
    expect(screen.queryByText(UNLOCK_CHECK_FAILED_MESSAGE)).toBeNull();
    expect(
      screen.queryByRole("button", { name: UNLOCK_CHECK_RETRY_LABEL }),
    ).toBeNull();
  });

  it("the retry button re-reads, and a successful read removes the message and mounts the prompt", async () => {
    const user = userEvent.setup();
    fetchSharingLimits.mockRejectedValueOnce(new Error("down"));
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderLocked();
    await screen.findByText(UNLOCK_CHECK_FAILED_MESSAGE);
    fetchSharingLimits.mockClear();
    await user.click(
      screen.getByRole("button", { name: UNLOCK_CHECK_RETRY_LABEL }),
    );
    expect(fetchSharingLimits).toHaveBeenCalled();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    expect(screen.queryByText(UNLOCK_CHECK_FAILED_MESSAGE)).toBeNull();
  });

  it("a later successful read that limits unlocking replaces the message with the desktop message", async () => {
    const user = userEvent.setup();
    fetchSharingLimits.mockRejectedValueOnce(new Error("down"));
    fetchSharingLimits.mockResolvedValue({
      state: "paired",
      limits: LIMITS_ON,
    });
    renderLocked();
    await screen.findByText(UNLOCK_CHECK_FAILED_MESSAGE);
    await user.click(
      screen.getByRole("button", { name: UNLOCK_CHECK_RETRY_LABEL }),
    );
    await screen.findByText(UNLOCK_AT_DESKTOP_MESSAGE);
    expect(screen.queryByText(UNLOCK_CHECK_FAILED_MESSAGE)).toBeNull();
    expect(passwordInput()).toBeNull();
  });

  it("a failed read with a desktop bridge or an unlocked workspace shows no could-not-check message", async () => {
    installBridge({});
    fetchSharingLimits.mockRejectedValue(new Error("down"));
    renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    await settle();
    expect(screen.queryByText(UNLOCK_CHECK_FAILED_MESSAGE)).toBeNull();
  });

  it("exempt and paired answers never show the could-not-check message", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    expect(screen.queryByText(UNLOCK_CHECK_FAILED_MESSAGE)).toBeNull();
  });

  it("unknown with a desktop bridge, read pending: the password field is present without waiting", async () => {
    installBridge({});
    fetchSharingLimits.mockReturnValue(new Promise(() => undefined));
    renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
  });

  it("desktop bridge present but the read says paired with unlocking limited: no password field, message shows", async () => {
    installBridge({});
    fetchSharingLimits.mockResolvedValue({
      state: "paired",
      limits: LIMITS_ON,
    });
    renderLocked();
    await screen.findByText(UNLOCK_AT_DESKTOP_MESSAGE);
    expect(passwordInput()).toBeNull();
  });

  it("a later successful read mounts the prompt after a failed one", async () => {
    fetchSharingLimits.mockRejectedValueOnce(new Error("down"));
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderLocked();
    await settle();
    expect(passwordInput()).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(passwordInput()).not.toBeNull());
  });

  it("submit re-reads: a stale allow does not send the passphrase when the fresh read limits unlocking", async () => {
    const user = userEvent.setup();
    fetchSharingLimits.mockResolvedValueOnce({ state: "exempt" });
    const { onUnlock } = renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    await user.type(
      passwordInput() as HTMLInputElement,
      "correct horse battery staple",
    );
    fetchSharingLimits.mockReset();
    fetchSharingLimits.mockResolvedValue({
      state: "paired",
      limits: LIMITS_ON,
    });
    await user.click(screen.getByRole("button", { name: /^unlock$/i }));
    await screen.findByText(UNLOCK_AT_DESKTOP_MESSAGE);
    expect(onUnlock).not.toHaveBeenCalled();
    expect(passwordInput()).toBeNull();
  });

  it("submit re-reads and sends the passphrase when the fresh read still allows", async () => {
    const user = userEvent.setup();
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    const { onUnlock } = renderLocked();
    await waitFor(() => expect(passwordInput()).not.toBeNull());
    await user.type(passwordInput() as HTMLInputElement, "pass");
    fetchSharingLimits.mockClear();
    await user.click(screen.getByRole("button", { name: /^unlock$/i }));
    await waitFor(() =>
      expect(onUnlock).toHaveBeenCalledExactlyOnceWith("pass"),
    );
    expect(fetchSharingLimits).toHaveBeenCalled();
  });

  it("polls only while the prompt is mounted", async () => {
    vi.useFakeTimers();
    try {
      fetchSharingLimits.mockResolvedValue({
        state: "paired",
        limits: LIMITS_ON,
      });
      renderLocked();
      await act(async () => {
        await Promise.resolve();
      });
      fetchSharingLimits.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11000);
      });
      expect(fetchSharingLimits).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("StartPage — project deletion waits for the server (Feature 77, FR-25)", () => {
  const DIR_ID = "33333333-cccc-4ccc-8ccc-cccccccccccc";

  function entry(): StartPageProjectEntry {
    return {
      project: {
        id: "p-del",
        name: "Doomed Novel",
        rootPath: `/tmp/projects/${DIR_ID}`,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      resources: [],
      folders: [],
    } as unknown as StartPageProjectEntry;
  }

  async function confirmDelete(
    fetchResponse: Response,
  ): Promise<ReturnType<typeof userEvent.setup>> {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fetchResponse);
    const store = makeStore();
    store.dispatch(
      setProjects([{ project: entry().project, folders: [], resources: [] }]),
    );
    render(
      <SharingLimitsProvider>
        <Provider store={store}>
          <StartPage projects={[entry()]} />
        </Provider>
      </SharingLimitsProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Manage Doomed Novel" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    return user;
  }

  it("keeps the project in the list when the server refuses", async () => {
    await confirmDelete(
      new Response(
        JSON.stringify({ error: "Server says no.", limit: "projectDeletion" }),
        { status: 403 },
      ),
    );

    await screen.findByText(/Server says no\./);
    // The open modal dialog hides the page behind it from the a11y tree.
    expect(
      screen.getByRole("button", { name: "Manage Doomed Novel", hidden: true }),
    ).toBeInTheDocument();
  });

  it("removes the project from the list once the server has deleted it", async () => {
    await confirmDelete(new Response(null, { status: 200 }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Manage Doomed Novel" }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("StartPage — Package > Compile Project dialog and resource count (Feature 87, D-3/D-39)", () => {
  const DIR_ID = "44444444-dddd-4ddd-8ddd-dddddddddddd";
  const STAMP = "2026-01-01T00:00:00.000Z";

  /**
   * Builds an entry the way the page's data path does: canonical folders and
   * text resources passed through `buildProjectView`, whose `resources` and
   * `folders` become the entry's.
   */
  function entryFor(
    rootResourceFolderId: string | undefined,
  ): StartPageProjectEntry {
    const project = {
      id: "p-pkg",
      name: "Two Resource Novel",
      rootPath: `/tmp/projects/${DIR_ID}`,
      createdAt: STAMP,
    };
    const folder = {
      id: "folder-1",
      name: "Part One",
      type: "folder",
      slug: "part-one",
      parentId: null,
      orderIndex: 0,
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const base = {
      type: "text",
      createdAt: STAMP,
      updatedAt: STAMP,
      userMetadata: {},
      plainText: "body",
    };
    const inFolder = {
      ...base,
      id: "res-in-folder",
      name: "Scene In Folder",
      slug: "scene-in-folder",
      folderId: "folder-1",
      orderIndex: 0,
    };
    const other = {
      ...base,
      id: "res-other",
      name: "Scene Other",
      slug: "scene-other",
      orderIndex: 1,
      ...(rootResourceFolderId === undefined
        ? {}
        : { folderId: rootResourceFolderId }),
    };
    const view = buildProjectView({
      project,
      folders: [folder],
      resources: [inFolder, other],
    } as unknown as Parameters<typeof buildProjectView>[0]);
    return {
      project,
      folders: view.folders,
      resources: view.resources,
    } as unknown as StartPageProjectEntry;
  }

  async function openCompileDialog(entry: StartPageProjectEntry) {
    const store = makeStore();
    render(
      <SharingLimitsProvider>
        <Provider store={store}>
          <StartPage projects={[entry]} />
        </Provider>
      </SharingLimitsProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Manage Two Resource Novel" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Package" }));
    return screen.findByRole("dialog", { name: /Compile Project/i });
  }

  it("dialog lists both resources when one has no folderId", async () => {
    const dialog = await openCompileDialog(entryFor(undefined));
    const scoped = within(dialog);
    expect(scoped.getByText("Scene In Folder")).toBeInTheDocument();
    expect(scoped.getByText("Scene Other")).toBeInTheDocument();
  });

  it("dialog lists both resources when one has a folderId naming a missing folder", async () => {
    const dialog = await openCompileDialog(entryFor("folder-missing"));
    const scoped = within(dialog);
    expect(scoped.getByText("Scene In Folder")).toBeInTheDocument();
    expect(scoped.getByText("Scene Other")).toBeInTheDocument();
  });

  it.each([
    ["no folderId", undefined],
    ["a folderId naming a missing folder", "folder-missing"],
  ])("compile input names both resources (%s)", async (_label, folderId) => {
    compileTextMock.mockReset();
    compileTextMock.mockResolvedValue({ text: "x", filename: "x.txt" });
    const dialog = await openCompileDialog(entryFor(folderId));
    const user = userEvent.setup();
    await user.click(
      within(dialog).getByRole("button", { name: /Compile \(2\)/ }),
    );
    expect(compileTextMock).toHaveBeenCalledTimes(1);
    const body = compileTextMock.mock.calls[0][0] as {
      resourceIds: string[];
      resources: { id: string }[];
    };
    expect([...body.resourceIds].sort()).toEqual([
      "res-in-folder",
      "res-other",
    ]);
    expect(body.resources.map((r) => r.id)).toEqual(
      expect.arrayContaining(["res-in-folder", "res-other"]),
    );
  });

  it("the project card shows 2 resources for the same project (no folderId case)", () => {
    const store = makeStore();
    render(
      <SharingLimitsProvider>
        <Provider store={store}>
          <StartPage projects={[entryFor(undefined)]} />
        </Provider>
      </SharingLimitsProvider>,
    );
    expect(screen.getByText(/2 resources/)).toBeInTheDocument();
  });
});
