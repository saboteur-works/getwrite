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
  type StoredProject,
} from "../../src/store/projectsSlice";
import CaptureBoxHost from "../../components/Capture/CaptureBoxHost";
import { LAST_CAPTURED_PROJECT_STORAGE_KEY } from "../../src/lib/capture-preferences";
import { LimitRefusalError } from "../../src/lib/api/limit-refusal";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type {
  CaptureCreated,
  CaptureRequest,
  CaptureResult,
} from "../../src/lib/api/inbox-capture-types";

const listProjects = vi.fn();
vi.mock("../../src/lib/api/projects", () => ({
  listProjects: (...args: unknown[]) => listProjects(...args),
}));

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

const entry = (id: string, name: string) => ({
  project: { id, name, createdAt: "2026-01-01T00:00:00.000Z" },
  folders: [],
  resources: [],
});

const created = (
  notices: CaptureCreated["notices"] = [],
  inboxFolderId = "inbox-1",
): CaptureResult => ({
  status: "created",
  resourceId: "r1",
  inboxFolderId,
  notices,
});

function makeStore(project?: Partial<StoredProject>) {
  const store = configureStore({ reducer: { projects: projectsReducer } });
  if (project) {
    store.dispatch(
      setProject({
        id: ID_A,
        name: "Alpha",
        createdAt: "2026-01-01T00:00:00.000Z",
        folders: [],
        resources: [],
        ...project,
      } as StoredProject),
    );
  }
  return store;
}

type CaptureFn = (r: CaptureRequest) => Promise<CaptureResult>;

async function setup(capture: CaptureFn, store = makeStore()) {
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <CaptureBoxHost isOpen onClose={onClose} capture={capture} />
    </Provider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Project")).toBeInTheDocument(),
  );
  return { onClose, store };
}

function type(text: string): HTMLTextAreaElement {
  const box = screen.getByLabelText("Text to capture") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  return box;
}

function submit(): void {
  fireEvent.click(screen.getByRole("button", { name: "Capture" }));
}

describe("CaptureBoxHost", () => {
  beforeEach(() => {
    listProjects.mockReset();
    listProjects.mockResolvedValue([entry(ID_A, "Alpha"), entry(ID_B, "Beta")]);
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("captures typed text once, remembers the project, closes and confirms", async () => {
    const capture = vi.fn<CaptureFn>().mockResolvedValue(created());
    const { onClose } = await setup(capture);
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: ID_B },
    });
    type("buy milk");
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      projectId: ID_B,
      text: "buy milk",
      origin: "typed",
    });
    expect(capture.mock.calls[0][0]).not.toHaveProperty("inboxChoice");
    expect(window.localStorage.getItem(LAST_CAPTURED_PROJECT_STORAGE_KEY)).toBe(
      ID_B,
    );
    expect(screen.getByTestId("capture-confirmation")).toHaveTextContent(
      "Captured to Beta",
    );
  });

  it("does not write the typed text to localStorage", async () => {
    const capture = vi.fn<CaptureFn>().mockResolvedValue(created());
    const { onClose } = await setup(capture);
    type("secret thought");
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const dump = JSON.stringify({ ...window.localStorage });
    expect(dump).not.toContain("secret thought");
  });

  it("refuses empty text without calling the client and keeps the box", async () => {
    const capture = vi.fn<CaptureFn>();
    const { onClose } = await setup(capture);
    type("   ");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "there is no text to capture",
    );
    expect(capture).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a server refusal for over-long text, naming the limit, and keeps the text", async () => {
    const capture = vi
      .fn<CaptureFn>()
      .mockResolvedValue({
        status: "refused",
        notices: [{ code: "text-too-long", severity: "error", message: "x" }],
      });
    const { onClose } = await setup(capture);
    const box = type("long");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("50,000");
    expect(box.value).toBe("long");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a server 'empty' refusal and keeps the text", async () => {
    const capture = vi
      .fn<CaptureFn>()
      .mockResolvedValue({
        status: "refused",
        notices: [{ code: "empty", severity: "error", message: "x" }],
      });
    await setup(capture);
    const box = type("a");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no text to capture",
    );
    expect(box.value).toBe("a");
  });

  it.each([
    ["seeding", "could not be left out of compile"],
    ["writing-log", "writing log was not updated"],
  ] as const)(
    "reports a %s notice as a capture made with a notice",
    async (code, fragment) => {
      const capture = vi
        .fn<CaptureFn>()
        .mockResolvedValue(
          created([{ code, severity: "error", message: "m" }]),
        );
      const { onClose } = await setup(capture);
      type("note");
      submit();
      await waitFor(() =>
        expect(
          screen
            .getAllByRole("status")
            .map((n: HTMLElement) => n.textContent)
            .join(" "),
        ).toContain(fragment),
      );
      expect(screen.getByRole("alert")).toHaveTextContent("");
      expect(screen.getByTestId("capture-confirmation")).toHaveTextContent(
        "Captured to Alpha",
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText("Text to capture") as HTMLTextAreaElement).value,
      ).toBe("");
    },
  );

  it.each([
    [
      "a network failure",
      new TypeError("Failed to fetch"),
      "app could not be reached",
    ],
    [
      "a server error",
      new Error("Failed to capture the note (HTTP 500)."),
      "reported an error",
    ],
    [
      "a project not found",
      new Error("Project not found."),
      "could not be found",
    ],
    [
      "a paired-device refusal",
      new LimitRefusalError("Not allowed", "projectDeletion"),
      "paired device is not allowed",
    ],
  ])(
    "shows its own message for %s and keeps the text",
    async (_name, error, fragment) => {
      const capture = vi.fn<CaptureFn>().mockRejectedValue(error);
      const { onClose } = await setup(capture);
      const box = type("keep me");
      submit();
      expect(await screen.findByRole("alert")).toHaveTextContent(fragment);
      expect(box.value).toBe("keep me");
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId("capture-confirmation")).toHaveTextContent("");
    },
  );

  it("returns an error message, not success, for a locked project (Task 19 handles it)", async () => {
    const capture = vi
      .fn<CaptureFn>()
      .mockRejectedValue(new ProjectLockedError(ID_A));
    const { onClose } = await setup(capture);
    type("x");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("locked");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns an error message, not success, for needs-choice (Task 19 handles it)", async () => {
    const capture = vi
      .fn<CaptureFn>()
      .mockResolvedValue({ status: "needs-choice", state: "inbox-in-trash" });
    const { onClose } = await setup(capture);
    type("x");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Trash");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends one request when submitted twice quickly", async () => {
    let resolve!: (r: CaptureResult) => void;
    const capture = vi.fn<CaptureFn>().mockReturnValue(
      new Promise<CaptureResult>((r) => {
        resolve = r;
      }),
    );
    await setup(capture);
    const box = type("once");
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(capture).toHaveBeenCalledTimes(1);
    await act(async () => resolve(created()));
  });

  it("can submit again after a failure", async () => {
    const capture = vi
      .fn<CaptureFn>()
      .mockRejectedValueOnce(
        new Error("Failed to capture the note (HTTP 500)."),
      )
      .mockResolvedValueOnce(created());
    const { onClose } = await setup(capture);
    type("retry");
    submit();
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Capture" })).toBeEnabled(),
    );
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capture).toHaveBeenCalledTimes(2);
  });

  describe("store update", () => {
    it("sets the project's inboxFolderId when the capture created the Inbox", async () => {
      const capture = vi
        .fn<CaptureFn>()
        .mockResolvedValue(created([], "inbox-9"));
      const { onClose, store } = await setup(capture, makeStore({}));
      type("x");
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(store.getState().projects.projects[ID_A]?.inboxFolderId).toBe(
        "inbox-9",
      );
    });

    it("replaces a different inboxFolderId and keeps the rest of the project", async () => {
      const capture = vi
        .fn<CaptureFn>()
        .mockResolvedValue(created([], "inbox-new"));
      const { onClose, store } = await setup(
        capture,
        makeStore({ inboxFolderId: "inbox-old" }),
      );
      type("x");
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      const p = store.getState().projects.projects[ID_A];
      expect(p?.inboxFolderId).toBe("inbox-new");
      expect(p?.name).toBe("Alpha");
    });

    it("does not add a project the store does not hold", async () => {
      const capture = vi.fn<CaptureFn>().mockResolvedValue(created());
      const { onClose, store } = await setup(capture);
      type("x");
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(store.getState().projects.projects[ID_A]).toBeUndefined();
    });

    it("leaves the store alone on failure", async () => {
      const capture = vi.fn<CaptureFn>().mockRejectedValue(new Error("boom"));
      const { store } = await setup(capture, makeStore({}));
      type("x");
      submit();
      await screen.findByRole("alert");
      expect(
        store.getState().projects.projects[ID_A]?.inboxFolderId,
      ).toBeUndefined();
    });
  });

  it("shows a failed state with Retry, never an empty picker", async () => {
    listProjects.mockReset();
    listProjects.mockRejectedValueOnce(new Error("down"));
    render(
      <Provider store={makeStore()}>
        <CaptureBoxHost
          isOpen
          onClose={() => undefined}
          capture={vi.fn<CaptureFn>()}
        />
      </Provider>,
    );
    expect(
      await screen.findByText(/Could not load your projects/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Project")).toBeNull();
    listProjects.mockResolvedValue([entry(ID_A, "Alpha")]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Project")).toBeTruthy();
  });

  it("says a project is needed when there are none", async () => {
    listProjects.mockResolvedValue([]);
    render(
      <Provider store={makeStore()}>
        <CaptureBoxHost
          isOpen
          onClose={() => undefined}
          capture={vi.fn<CaptureFn>()}
        />
      </Provider>,
    );
    expect(await screen.findByText(/A project is needed/)).toBeTruthy();
  });

  it("shows a locked project as 'Locked project'", async () => {
    listProjects.mockResolvedValue([
      {
        project: { id: ID_A, createdAt: "2026-02-03T00:00:00.000Z" },
        folders: [],
        resources: [],
        isLocked: true,
        isEncrypted: true,
      },
    ]);
    await setup(vi.fn<CaptureFn>());
    expect(screen.getByRole("option", { name: /Locked project/ })).toBeTruthy();
  });
});
