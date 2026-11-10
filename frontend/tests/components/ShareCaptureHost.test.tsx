import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import projectsReducer, {
  setProject,
  setSelectedProjectId,
  type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import ShareCaptureHost from "../../components/Capture/ShareCaptureHost";
import { toastService } from "../../src/lib/toast-service";
import TrashRefreshProvider, {
  useTrashRefresh,
} from "../../components/Layout/TrashRefreshContext";
import { runAxe } from "../a11y/helpers/axe";
import { LAST_CAPTURED_PROJECT_STORAGE_KEY } from "../../src/lib/capture-preferences";
import { EncryptedProjectCaptureRefusedError } from "../../src/lib/api/encrypted-project-refusal";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type {
  ShareReceivedEvent,
  ShareResult,
} from "../../src/lib/api/share-capture-types";
import type {
  ShareListenerOptions,
  ShareListenerSession,
} from "../../src/store/transport/native-share-in-plugin";
import type {
  ShareRunOptions,
  ShareRunOutcome,
} from "../../src/lib/share-runner";

/**
 * Feature 107, Task 12: the share host, with a fake plugin wrapper and a fake
 * runner. jsdom only: nothing here is evidence about the Android bridge or a
 * device.
 */

const listProjects = vi.fn();
const openProject = vi.fn();
vi.mock("../../src/lib/api/projects", () => ({
  listProjects: (...args: unknown[]) => listProjects(...args),
  openProject: (...args: unknown[]) => openProject(...args),
}));

// The directory basename differs from project.json's id on purpose.
const DIR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

const listed = (dir: string, manifestId: string, name: string) => ({
  project: {
    id: manifestId,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    rootPath: `/ws/projects/${dir}`,
  },
  folders: [],
  resources: [],
});

const stored = (dir: string, manifestId: string, name: string) =>
  ({
    id: manifestId,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    rootPath: `/ws/projects/${dir}`,
    folders: [],
    resources: [],
  }) as unknown as StoredProject;

const SHARE_1: ShareReceivedEvent = {
  shareId: "share-1",
  items: [
    { kind: "text", text: "a secret thought nobody may log" },
    {
      kind: "image",
      uri: "content://media/1",
      name: "pic.png",
      mimeType: "image/png",
      size: 10,
    },
  ],
};
const SHARE_2: ShareReceivedEvent = {
  shareId: "share-2",
  items: [{ kind: "text", text: "second share" }],
};

function doneResult(share: ShareReceivedEvent): ShareRunOutcome {
  const result: ShareResult = {
    shareId: share.shareId,
    items: share.items.map((item, index) => ({
      status: "captured" as const,
      index,
      kind: item.kind,
      resourceId: `r${index}`,
      inboxFolderId: "inbox-new",
    })),
    capturedCount: share.items.length,
  };
  return { status: "done", result };
}

type RunFn = (
  share: ShareReceivedEvent,
  projectId: string,
  options?: ShareRunOptions,
) => Promise<ShareRunOutcome>;

/** A fake of `startShareListener` that behaves like the wrapper: ack after take. */
function makeListener() {
  const acknowledge = vi.fn<(shareId: string) => void>();
  const stop = vi.fn(async () => undefined);
  let options: ShareListenerOptions | undefined;
  const start = vi.fn(
    async (o: ShareListenerOptions): Promise<ShareListenerSession> => {
      options = o;
      return { stop };
    },
  );
  return {
    start,
    stop,
    acknowledge,
    /** Delivers a share the way the wrapper does: await the take, then ack. */
    async deliver(share: ShareReceivedEvent): Promise<void> {
      await act(async () => {
        await options!.onShare(share);
        acknowledge(share.shareId);
      });
    },
    fail(message: string): void {
      act(() => options!.onFailure(message));
    },
  };
}

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer, resources: resourcesReducer },
  });
}

/** Shows the shared refresh token, so a test can see the project was re-read. */
function TokenProbe(): JSX.Element {
  return (
    <output data-testid="refresh-token">
      {useTrashRefresh().refreshToken}
    </output>
  );
}

function renderHost(
  listener: ReturnType<typeof makeListener>,
  run: RunFn,
  store = makeStore(),
) {
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <TokenProbe />
        <ShareCaptureHost startListener={listener.start} run={run} />
      </TrashRefreshProvider>
    </Provider>,
  );
}

const SHEET = { name: "Share to GetWrite" };

describe("ShareCaptureHost", () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listProjects.mockReset();
    openProject.mockReset();
    listProjects.mockResolvedValue([
      listed(DIR_A, ID_A, "Alpha"),
      listed(DIR_B, ID_B, "Beta"),
    ]);
    window.localStorage.clear();
    setItem = vi.spyOn(Storage.prototype, "setItem");
  });
  afterEach(() => vi.restoreAllMocks());

  it("adds the listener at mount, before any share or Capture open, and removes it on unmount", async () => {
    const listener = makeListener();
    const view = renderHost(listener, vi.fn<RunFn>());
    await waitFor(() => expect(listener.start).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    await waitFor(() => expect(listener.stop).toHaveBeenCalledTimes(1));
  });

  it("opens the sheet with the open project by directory id and writes nothing until confirm", async () => {
    const store = makeStore();
    store.dispatch(setProject(stored(DIR_A, ID_A, "Alpha")));
    store.dispatch(setProject(stored(DIR_B, ID_B, "Beta")));
    store.dispatch(setSelectedProjectId(ID_B));
    const run = vi.fn<RunFn>();
    const listener = makeListener();
    renderHost(listener, run, store);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());

    await listener.deliver(SHARE_1);

    await screen.findByRole("dialog", SHEET);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Project") as HTMLSelectElement).value,
      ).toBe(DIR_B),
    );
    expect(run).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(listener.acknowledge).toHaveBeenCalledWith("share-1");
  });

  it("confirm runs every item for the directory id and shows the one result", async () => {
    const run = vi.fn<RunFn>(async (share) => doneResult(share));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");

    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: DIR_B },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(
      await screen.findByText(/2 of 2 items became resources/),
    ).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe(SHARE_1);
    expect(run.mock.calls[0]![1]).toBe(DIR_B);
    expect(window.localStorage.getItem(LAST_CAPTURED_PROJECT_STORAGE_KEY)).toBe(
      DIR_B,
    );
  });

  it("refuses an encrypted-marked project: one message, nothing written, no unlock prompt", async () => {
    const refusal = new EncryptedProjectCaptureRefusedError("encrypted");
    const run = vi.fn<RunFn>(async () => ({
      status: "refused",
      reason: refusal.reason,
      message: refusal.message,
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Nothing was captured/);
    expect(alert.textContent).toMatch(/encrypted/);
    expect(alert.textContent).not.toMatch(
      /Nothing was captured: Nothing was captured/,
    );
    expect(screen.queryByText(/unlock/i)).toBeNull();
    expect(screen.queryByLabelText(/passphrase/i)).toBeNull();
    expect(
      window.localStorage.getItem(LAST_CAPTURED_PROJECT_STORAGE_KEY),
    ).toBeNull();
  });

  it("holds the share in memory only: no storage, console or timer write of its text", async () => {
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    const run = vi.fn<RunFn>(async () => ({
      status: "refused",
      reason: "encrypted",
      message: new EncryptedProjectCaptureRefusedError("encrypted").message,
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("alert");

    expect(setItem).not.toHaveBeenCalled();
    const logged = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(logged).not.toContain("secret thought");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("queues a second share with a visible count; cancel of the first offers the second, writing nothing", async () => {
    const run = vi.fn<RunFn>();
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    await listener.deliver(SHARE_2);

    expect((await screen.findByRole("status")).textContent).toMatch(
      /1 more share waiting/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText(/1 item shared/)).toBeTruthy());
    expect(screen.getByText("Text: second share")).toBeTruthy();
    expect(screen.queryByText(/more share/)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("after a refusal of the first, Done offers the queued share", async () => {
    const run = vi.fn<RunFn>(async () => ({
      status: "refused",
      reason: "encrypted",
      message: new EncryptedProjectCaptureRefusedError("encrypted").message,
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    await listener.deliver(SHARE_2);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Text: second share")).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("asks once for an Inbox in Trash and applies the choice to the whole share", async () => {
    const run = vi
      .fn<RunFn>()
      .mockResolvedValueOnce({
        status: "needs-choice",
        state: "inbox-in-trash",
        progress: { results: [] },
      })
      .mockImplementationOnce(async (share) => doneResult(share));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await screen.findByRole("dialog", {
      name: "This project's Inbox is in Trash",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore it" }));

    expect(
      await screen.findByText(/2 of 2 items became resources/),
    ).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![2]).toEqual({
      inboxChoice: "restore",
      progress: { results: [] },
    });
  });

  it("cancelling the Inbox choice captures nothing and says so", async () => {
    const run = vi
      .fn<RunFn>()
      .mockResolvedValueOnce({
        status: "needs-choice",
        state: "inbox-in-trash",
        progress: { results: [] },
      });
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("dialog", {
      name: "This project's Inbox is in Trash",
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Nothing was captured/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("says a project is needed and writes nothing when there is none", async () => {
    listProjects.mockResolvedValue([]);
    const run = vi.fn<RunFn>();
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);

    expect(await screen.findByText(/A project is needed/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Capture" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shows an empty-share failure as a failure, never as a result", async () => {
    const run = vi.fn<RunFn>(async () => ({
      status: "failed",
      message: "The share held nothing to capture. Nothing was saved.",
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/held nothing to capture/);
    expect(screen.queryByText(/became resource/)).toBeNull();
  });

  it("shows a thrown run as a failure, never as success or empty", async () => {
    const run = vi.fn<RunFn>(async () => {
      throw new Error("disk exploded");
    });
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/disk exploded/);
    expect(alert.textContent).toMatch(/0 of 2 items became resources/);
    expect(alert.textContent).toMatch(/failed/);
  });

  it("a captured share sets the stored project's inboxFolderId, found by directory id", async () => {
    const store = makeStore();
    store.dispatch(setProject(stored(DIR_A, ID_A, "Alpha")));
    store.dispatch(setProject(stored(DIR_B, ID_B, "Beta")));
    const run = vi.fn<RunFn>(async (share) => doneResult(share));
    const listener = makeListener();
    renderHost(listener, run, store);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    const select = await screen.findByLabelText("Project");
    fireEvent.change(select, { target: { value: DIR_A } });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("button", { name: "Done" });

    const projects = store.getState().projects.projects;
    expect(projects[ID_A]?.inboxFolderId).toBe("inbox-new");
    expect(projects[ID_B]?.inboxFolderId).toBeUndefined();
  });

  it("leaves the stored project unchanged when nothing was captured", async () => {
    const store = makeStore();
    store.dispatch(setProject(stored(DIR_A, ID_A, "Alpha")));
    const run = vi.fn<RunFn>(async () => ({
      status: "stopped",
      error: new Error("disk exploded"),
      held: SHARE_1.items,
      results: [],
    }));
    const listener = makeListener();
    renderHost(listener, run, store);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("alert");

    expect(
      store.getState().projects.projects[ID_A]?.inboxFolderId,
    ).toBeUndefined();
  });

  it("a run stopped by a locked error names the uncaptured items as failed and shows no unlock prompt", async () => {
    const run = vi.fn<RunFn>(async () => ({
      status: "stopped",
      error: new ProjectLockedError("locked"),
      held: [SHARE_1.items[1]!],
      results: [
        {
          status: "captured",
          index: 0,
          kind: "text",
          resourceId: "r0",
          inboxFolderId: "inbox-new",
        },
      ],
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/1 of 2 items became a resource|1 of 2/);
    expect(alert.textContent).toMatch(/pic\.png/);
    expect(screen.queryByLabelText(/passphrase/i)).toBeNull();
  });

  it("reports a listener failure instead of dropping it", async () => {
    const listener = makeListener();
    renderHost(listener, vi.fn<RunFn>());
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    listener.fail("The shared content could not be read.");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not be read/);
  });

  it("reports a listener that failed to start", async () => {
    const start = vi.fn(async () => {
      throw new Error("plugin missing");
    });
    render(
      <Provider store={makeStore()}>
        <ShareCaptureHost startListener={start} run={vi.fn<RunFn>()} />
      </Provider>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/plugin missing/);
  });

  it("Escape in the picker cancels and writes nothing", async () => {
    const run = vi.fn<RunFn>();
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");

    fireEvent.keyDown(screen.getByRole("dialog", SHEET), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });

  it("has no axe violations in the picker and the refusal view", async () => {
    const run = vi.fn<RunFn>(async () => ({
      status: "refused",
      reason: "encrypted",
      message: new EncryptedProjectCaptureRefusedError("encrypted").message,
    }));
    const listener = makeListener();
    renderHost(listener, run);
    await waitFor(() => expect(listener.start).toHaveBeenCalled());
    await listener.deliver(SHARE_1);
    await screen.findByLabelText("Project");
    await runAxe(document.body);

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("alert");
    await runAxe(document.body);
  });

  describe("refreshing the open project's tree after a capture", () => {
    const INBOX_FOLDER = {
      id: "inbox-new",
      name: "Inbox",
      parentId: null,
      orderIndex: 0,
    };
    const CAPTURED = { id: "r0", name: "A note", type: "text" };

    function openWith(dir: string, manifestId: string) {
      const store = makeStore();
      store.dispatch(setProject(stored(dir, manifestId, "P")));
      store.dispatch(setSelectedProjectId(manifestId));
      return store;
    }

    async function captureInto(
      store: ReturnType<typeof makeStore>,
      dir: string,
    ): Promise<void> {
      const run = vi.fn<RunFn>(async (share) => doneResult(share));
      const listener = makeListener();
      renderHost(listener, run, store);
      await waitFor(() => expect(listener.start).toHaveBeenCalled());
      await listener.deliver(SHARE_2);
      await screen.findByLabelText("Project");
      fireEvent.change(screen.getByLabelText("Project"), {
        target: { value: dir },
      });
      fireEvent.click(screen.getByRole("button", { name: "Capture" }));
      await screen.findByText(/1 of 1 item/);
    }

    it("re-reads the open project into the store and signals the page", async () => {
      openProject.mockResolvedValue({
        project: { id: ID_A },
        folders: [INBOX_FOLDER],
        resources: [CAPTURED],
      });
      const store = openWith(DIR_A, ID_A);
      store.dispatch({
        type: "resources/setSelectedResourceId",
        payload: "keep",
      });
      await captureInto(store, DIR_A);

      await waitFor(() =>
        expect(store.getState().resources.folders).toEqual([INBOX_FOLDER]),
      );
      expect(openProject).toHaveBeenCalledWith(DIR_A);
      expect(store.getState().resources.resources).toEqual([CAPTURED]);
      expect(store.getState().resources.selectedResourceId).toBe("keep");
      expect(screen.getByTestId("refresh-token").textContent).toBe("1");
    });

    it("does not re-read a project that is not the open one", async () => {
      const store = openWith(DIR_A, ID_A);
      store.dispatch(setProject(stored(DIR_B, ID_B, "Beta")));
      await captureInto(store, DIR_B);

      expect(openProject).not.toHaveBeenCalled();
      expect(store.getState().resources.folders).toEqual([]);
      expect(screen.getByTestId("refresh-token").textContent).toBe("0");
    });

    it("keeps the capture reported as done when the re-read fails, and says so", async () => {
      openProject.mockRejectedValue(new Error("read failed"));
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const toast = vi.spyOn(toastService, "error").mockReturnValue("t");
      const store = openWith(DIR_A, ID_A);
      await captureInto(store, DIR_A);

      await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
      expect(error).toHaveBeenCalled();
      expect(screen.getByText(/1 of 1 item/)).toBeTruthy();
      expect(store.getState().resources.folders).toEqual([]);
      expect(screen.getByTestId("refresh-token").textContent).toBe("0");
    });
  });
});
