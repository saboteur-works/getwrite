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
import {
  StaticSharingLimitsProvider,
  type StaticSharingLimitsValue,
} from "../../components/Sharing/SharingLimitsContext";
import { runAxe } from "../a11y/helpers/axe";
import { LAST_CAPTURED_PROJECT_STORAGE_KEY } from "../../src/lib/capture-preferences";
import { LimitRefusalError } from "../../src/lib/api/limit-refusal";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/locked-errors";
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
type UnlockFn = (passphrase: string) => Promise<void>;

interface SetupOptions {
  store?: ReturnType<typeof makeStore>;
  unlock?: UnlockFn;
  limits?: StaticSharingLimitsValue;
}

function renderHost(
  capture: CaptureFn,
  { store = makeStore(), unlock, limits }: SetupOptions = {},
) {
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <StaticSharingLimitsProvider value={limits}>
        <CaptureBoxHost
          isOpen
          onClose={onClose}
          capture={capture}
          unlock={unlock}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  return { onClose, store };
}

async function setup(capture: CaptureFn, options: SetupOptions = {}) {
  const { onClose, store } = renderHost(capture, options);
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
      const { onClose, store } = await setup(capture, { store: makeStore({}) });
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
      const { onClose, store } = await setup(capture, {
        store: makeStore({ inboxFolderId: "inbox-old" }),
      });
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
      const { store } = await setup(capture, { store: makeStore({}) });
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
    renderHost(vi.fn<CaptureFn>());
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
    renderHost(vi.fn<CaptureFn>());
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

  describe("locked project", () => {
    const locked = () => new ProjectLockedError(ID_A);
    const lockedCapture = (): ReturnType<typeof vi.fn<CaptureFn>> =>
      vi
        .fn<CaptureFn>()
        .mockRejectedValueOnce(locked())
        .mockResolvedValueOnce(created());

    async function openPrompt(
      capture: CaptureFn,
      options: SetupOptions = {},
    ): Promise<ReturnType<typeof renderHost>> {
      const result = await setup(capture, options);
      type("held text");
      submit();
      await screen.findByLabelText("Passphrase");
      return result;
    }

    function enterPassphrase(value = "pw"): void {
      fireEvent.change(screen.getByLabelText("Passphrase"), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    }

    it("opens the unlock prompt on a locked-access error and sends nothing else", async () => {
      const capture = lockedCapture();
      await openPrompt(capture);
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it("recognises a missing-key locked-access error too", async () => {
      const capture = vi
        .fn<CaptureFn>()
        .mockRejectedValue(new MissingProjectKeyError(ID_A));
      await openPrompt(capture);
    });

    it("retries exactly once with the held text after a successful unlock and shows success", async () => {
      const capture = lockedCapture();
      const unlock = vi.fn<UnlockFn>().mockResolvedValue(undefined);
      const { onClose } = await openPrompt(capture, { unlock });
      enterPassphrase("secret");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(unlock).toHaveBeenCalledWith("secret");
      expect(capture).toHaveBeenCalledTimes(2);
      expect(capture.mock.calls[1][0]).toEqual({
        projectId: ID_A,
        text: "held text",
        origin: "typed",
      });
      expect(screen.getByTestId("capture-confirmation")).toHaveTextContent(
        "Captured to Alpha",
      );
    });

    it("does not retry a second time when the project is still locked after unlocking", async () => {
      const capture = vi.fn<CaptureFn>().mockRejectedValue(locked());
      const unlock = vi.fn<UnlockFn>().mockResolvedValue(undefined);
      const { onClose } = await openPrompt(capture, { unlock });
      enterPassphrase();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Nothing was captured",
      );
      expect(capture).toHaveBeenCalledTimes(2);
      expect(screen.queryByLabelText("Passphrase")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText("Text to capture") as HTMLTextAreaElement).value,
      ).toBe("held text");
    });

    it("keeps the prompt open with the failure when the unlock fails", async () => {
      const capture = lockedCapture();
      const unlock = vi
        .fn<UnlockFn>()
        .mockRejectedValue(new Error("Incorrect passphrase."));
      const { onClose } = await openPrompt(capture, { unlock });
      enterPassphrase();
      expect(await screen.findByText("Incorrect passphrase.")).toBeTruthy();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("writes nothing and says so when the unlock is declined, keeping the text", async () => {
      const capture = lockedCapture();
      const { onClose } = await openPrompt(capture);
      fireEvent.click(
        screen.getByRole("button", { name: "Continue without unlocking" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Nothing was captured: the project is locked and was not unlocked.",
      );
      expect(capture).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText("Text to capture") as HTMLTextAreaElement).value,
      ).toBe("held text");
      expect(screen.getByTestId("capture-confirmation")).toHaveTextContent("");
    });

    it("does not open the prompt on a paired device with unlocking limited", async () => {
      const capture = lockedCapture();
      await setup(capture, {
        limits: {
          state: {
            state: "paired",
            limits: {
              projectDeletion: false,
              unlocking: true,
              locking: false,
              encryptionChanges: false,
              permanentDeletion: false,
            },
          },
        },
      });
      const box = type("held text");
      submit();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "unlocking is not allowed from this device",
      );
      expect(screen.queryByLabelText("Passphrase")).toBeNull();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(box.value).toBe("held text");
    });

    it("never writes the held text to localStorage or the console", async () => {
      const log = vi.spyOn(console, "log");
      const warn = vi.spyOn(console, "warn");
      const error = vi.spyOn(console, "error");
      const capture = lockedCapture();
      await openPrompt(capture);
      expect(JSON.stringify({ ...window.localStorage })).not.toContain(
        "held text",
      );
      for (const spy of [log, warn, error]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain("held text");
      }
    });

    it("leads a locked project chosen from the picker to the prompt before any capture", async () => {
      listProjects.mockResolvedValue([
        {
          project: { id: ID_A, createdAt: "2026-02-03T00:00:00.000Z" },
          folders: [],
          resources: [],
          isLocked: true,
          isEncrypted: true,
        },
      ]);
      const capture = vi.fn<CaptureFn>().mockResolvedValue(created());
      const unlock = vi.fn<UnlockFn>().mockResolvedValue(undefined);
      const { onClose } = await setup(capture, { unlock });
      type("for locked");
      submit();
      await screen.findByLabelText("Passphrase");
      expect(capture).not.toHaveBeenCalled();
      enterPassphrase();
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][0].text).toBe("for locked");
    });

    it("has no axe violations and the prompt is keyboard reachable", async () => {
      await openPrompt(lockedCapture());
      await runAxe(document.body);
      expect(screen.getByLabelText("Passphrase")).toHaveFocus();
    });
  });

  describe("Inbox in Trash choice", () => {
    const needsChoice: CaptureResult = {
      status: "needs-choice",
      state: "inbox-in-trash",
    };

    async function openChoice(capture: CaptureFn) {
      const result = await setup(capture);
      type("trash text");
      submit();
      await screen.findByRole("button", { name: "Restore it" });
      return result;
    }

    it("offers restore and new, announced as a dialog, keyboard operable", async () => {
      const capture = vi.fn<CaptureFn>().mockResolvedValue(needsChoice);
      await openChoice(capture);
      expect(
        screen.getByRole("dialog", { name: /Inbox is in Trash/ }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Make a new one" }),
      ).toBeTruthy();
      const restore = screen.getByRole("button", { name: "Restore it" });
      restore.focus();
      expect(restore).toHaveFocus();
      expect(capture).toHaveBeenCalledTimes(1);
      await runAxe(document.body);
    });

    it.each([
      ["Restore it", "restore"],
      ["Make a new one", "new"],
    ] as const)(
      "%s sends the second call with inboxChoice %s",
      async (label, choice) => {
        const capture = vi
          .fn<CaptureFn>()
          .mockResolvedValueOnce(needsChoice)
          .mockResolvedValueOnce(created());
        const { onClose } = await openChoice(capture);
        fireEvent.click(screen.getByRole("button", { name: label }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(capture).toHaveBeenCalledTimes(2);
        expect(capture.mock.calls[1][0]).toEqual({
          projectId: ID_A,
          text: "trash text",
          origin: "typed",
          inboxChoice: choice,
        });
      },
    );

    it("reports where a restore landed (relocated and renamed notices)", async () => {
      const capture = vi
        .fn<CaptureFn>()
        .mockResolvedValueOnce(needsChoice)
        .mockResolvedValueOnce(
          created([
            {
              code: "inbox-relocated",
              severity: "info",
              message: "The Inbox was moved to the top level.",
            },
            {
              code: "inbox-renamed",
              severity: "info",
              message: "The Inbox was renamed Inbox 2.",
            },
          ]),
        );
      await openChoice(capture);
      fireEvent.click(screen.getByRole("button", { name: "Restore it" }));
      await waitFor(() =>
        expect(screen.getByTestId("capture-confirmation")).toHaveTextContent(
          "The Inbox was moved to the top level",
        ),
      );
      expect(screen.getByTestId("capture-confirmation")).toHaveTextContent(
        "renamed Inbox 2",
      );
    });

    it("writes nothing and keeps the text when the choice is cancelled", async () => {
      const capture = vi.fn<CaptureFn>().mockResolvedValue(needsChoice);
      const { onClose } = await openChoice(capture);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Nothing was captured",
      );
      expect(capture).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText("Text to capture") as HTMLTextAreaElement).value,
      ).toBe("trash text");
      expect(screen.queryByRole("button", { name: "Restore it" })).toBeNull();
    });

    it("shows the choice again on a second needs-choice, not a loop", async () => {
      const capture = vi.fn<CaptureFn>().mockResolvedValue(needsChoice);
      await openChoice(capture);
      fireEvent.click(screen.getByRole("button", { name: "Restore it" }));
      await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByRole("button", { name: "Restore it" }),
      ).toBeTruthy();
      expect(capture).toHaveBeenCalledTimes(2);
    });

    it("shows its own message when the second call fails and keeps the text", async () => {
      const capture = vi
        .fn<CaptureFn>()
        .mockResolvedValueOnce(needsChoice)
        .mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await openChoice(capture);
      fireEvent.click(screen.getByRole("button", { name: "Make a new one" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "app could not be reached",
      );
      expect(
        (screen.getByLabelText("Text to capture") as HTMLTextAreaElement).value,
      ).toBe("trash text");
    });
  });
});
