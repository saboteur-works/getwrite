import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ProjectTypesManagerPage from "../../components/project-types/ProjectTypesManagerPage";
import { LINE_HEIGHT_FLOOR_MESSAGE } from "../../src/lib/editor-body-settings";
import type {
  ProjectTypeList,
  ProjectTypesTransport,
  ProjectTypeWriteOutcome,
} from "../../src/lib/api/project-types";
import type {
  ProjectTypeDefinition,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";
import { runAxe } from "../a11y/helpers/axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("../../src/store/hooks", () => ({ default: () => null }));

const def = (id: string, name: string): ProjectTypeDefinition => ({
  id,
  name,
  description: "",
  folders: [{ name: "Workspace" }],
  defaultFolders: [],
  defaultResources: [],
  statuses: [],
});

const builtIn: ProjectTypeTemplateFile = {
  fileName: "novel.json",
  definition: def("novel", "Novel"),
  source: "built-in",
};
const saved: ProjectTypeTemplateFile = {
  fileName: "mine.json",
  definition: def("mine", "Mine"),
  source: "saved",
};

function listOf(...files: ProjectTypeTemplateFile[]): ProjectTypeList {
  return {
    entries: files.map((f) => ({
      spec: f.definition,
      fileName: f.fileName,
      source: f.source ?? "built-in",
    })),
    unusable: [],
    savedStatus: "ok",
  };
}

function makeTransport(
  overrides: Partial<ProjectTypesTransport> = {},
): ProjectTypesTransport {
  return {
    list: vi.fn(async () => listOf(builtIn, saved)),
    create: vi.fn(
      async (
        spec: ProjectTypeDefinition,
      ): Promise<ProjectTypeWriteOutcome> => ({
        ok: true,
        fileName: `${spec.id}.json`,
        spec,
      }),
    ),
    update: vi.fn(
      async (
        id: string,
        spec: ProjectTypeDefinition,
      ): Promise<ProjectTypeWriteOutcome> => ({
        ok: true,
        fileName: `${id}.json`,
        spec,
      }),
    ),
    remove: vi.fn(
      async (): Promise<ProjectTypeWriteOutcome> => ({
        ok: true,
        fileName: "mine.json",
      }),
    ),
    ...overrides,
  };
}

function renderManager(
  transport: ProjectTypesTransport,
  props: { listNotice?: string | null } = {},
): ReturnType<typeof render> {
  return render(
    <ProjectTypesManagerPage
      initialTemplates={[builtIn, saved]}
      resolveTransport={async () => transport}
      {...props}
    />,
  );
}

function select(title: string): void {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
}

function startDraft(id: string, name: string): void {
  fireEvent.click(screen.getByRole("button", { name: "New Project Type" }));
  fireEvent.change(screen.getByLabelText("ID"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
}

describe("ProjectTypesManagerPage labels and controls", () => {
  it("built-in: labelled Built-in, Save reads Save as copy, no Delete, id read-only", () => {
    renderManager(makeTransport());
    const bar = screen.getByRole("group", { name: "Project type actions" });
    expect(within(bar).getByText("Built-in")).toBeInTheDocument();
    expect(
      within(bar).getAllByRole("button", { name: "Save as copy" }),
    ).toHaveLength(1);
    expect(within(bar).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByLabelText("ID")).toHaveAttribute("readonly");
  });

  it("saved: labelled Saved with Save, Save as copy and Delete as native buttons; id read-only", () => {
    renderManager(makeTransport());
    select("Mine");
    const bar = screen.getByRole("group", { name: "Project type actions" });
    expect(within(bar).getByText("Saved")).toBeInTheDocument();
    for (const name of ["Save", "Save as copy", "Delete"]) {
      const button = within(bar).getByRole("button", { name });
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toBeDisabled();
    }
    expect(screen.getByLabelText("ID")).toHaveAttribute("readonly");
  });

  it("draft: id editable, Save only", () => {
    renderManager(makeTransport());
    fireEvent.click(screen.getByRole("button", { name: "New Project Type" }));
    expect(screen.getByLabelText("ID")).not.toHaveAttribute("readonly");
    const bar = screen.getByRole("group", { name: "Project type actions" });
    expect(
      within(bar).getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("marks list rows with Built-in / Saved text", () => {
    renderManager(makeTransport());
    const list = screen.getByRole("list");
    expect(within(list).getByText("Built-in")).toBeInTheDocument();
    expect(within(list).getByText("Saved")).toBeInTheDocument();
  });
});

describe("ProjectTypesManagerPage Save", () => {
  it("is disabled and says so while the request is in flight", async () => {
    let release: (o: ProjectTypeWriteOutcome) => void = () => undefined;
    const transport = makeTransport({
      create: vi.fn(
        () =>
          new Promise<ProjectTypeWriteOutcome>((resolve) => {
            release = resolve;
          }),
      ),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const busy = await screen.findByRole("button", { name: "Saving…" });
    expect(busy).toBeDisabled();

    await act(async () => {
      release({
        ok: true,
        fileName: "fresh.json",
        spec: def("fresh", "Fresh"),
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull(),
    );
  });

  it("on success shows Saved, refreshes the list from the server and announces politely", async () => {
    const transport = makeTransport({
      list: vi.fn(async () =>
        listOf(builtIn, saved, {
          fileName: "fresh.json",
          definition: def("fresh", "Fresh"),
          source: "saved",
        }),
      ),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(/Saved .*Fresh/));
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(transport.list).toHaveBeenCalledTimes(1);
    const bar = screen.getByRole("group", { name: "Project type actions" });
    expect(within(bar).getByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("ID")).toHaveAttribute("readonly");
  });

  it("refuses a Line Height below 1.8 with the message shown and sends nothing", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.change(screen.getByLabelText("Line Height"), {
      target: { value: "1.7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((a: HTMLElement) =>
        a.textContent?.includes(LINE_HEIGHT_FLOOR_MESSAGE),
      ),
    ).toBe(true);
    expect(transport.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Line Height")).toHaveValue("1.7");
  });
});

describe("ProjectTypesManagerPage refusals", () => {
  it("id clash (409) shows an alert next to the id field and keeps the draft", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "id-clash" as const,
        message: "A project type with the id novel already exists.",
      })),
    });
    renderManager(transport);
    startDraft("novel", "Another");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("already exists");
    expect(screen.getByLabelText("ID")).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
    expect(screen.getByLabelText("ID")).toHaveValue("novel");
    expect(screen.getByLabelText("Name")).toHaveValue("Another");
  });

  it("name clash shows an alert next to the name field", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "name-clash" as const,
        message: "A project type named Novel already exists.",
      })),
    });
    renderManager(transport);
    startDraft("fresh", "Novel");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
    expect(screen.getByLabelText("ID")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Name")).toHaveValue("Novel");
  });

  it("built-in: typing a name and choosing Save as copy posts that name", async () => {
    const transport = makeTransport();
    renderManager(transport);
    select("Novel");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Probe Novel" },
    });
    const bar = screen.getByRole("group", { name: "Project type actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Save as copy" }));

    await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
    const posted = (transport.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as ProjectTypeDefinition;
    expect(posted.name).toBe("Probe Novel");
    expect(posted.id).not.toBe("novel");
  });

  it("built-in: a typed name that clashes with another type is refused and stays in the Name field", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "name-clash" as const,
        message: "A project type with this name already exists.",
      })),
    });
    renderManager(transport);
    select("Novel");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "mine" },
    });
    const bar = screen.getByRole("group", { name: "Project type actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Save as copy" }));

    await screen.findByRole("alert");
    const posted = (transport.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as ProjectTypeDefinition;
    expect(posted.name).toBe("mine");
    expect(screen.getByLabelText("Name")).toHaveValue("mine");
  });

  it("saving-unavailable shows an alert and leaves the draft as written", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "saving-unavailable" as const,
        message: "Saving project types is not available here.",
      })),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not available");
    expect(screen.getByLabelText("ID")).toHaveValue("fresh");
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
    expect(transport.list).not.toHaveBeenCalled();
  });

  it("a failed write (thrown) shows an alert and keeps the draft", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => {
        throw new Error("Network down");
      }),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });
});

describe("ProjectTypesManagerPage Delete", () => {
  it("confirms with the consequences, then deletes a saved type", async () => {
    const transport = makeTransport({
      list: vi.fn(async () => listOf(builtIn)),
    });
    renderManager(transport);
    select("Mine");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/already made from/i);
    expect(dialog).toHaveTextContent(/not affected/i);
    expect(dialog).toHaveTextContent(/can no longer be chosen/i);
    expect(transport.remove).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(transport.remove).toHaveBeenCalledWith("mine"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Mine/ })).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Deleted/),
    );
  });

  it("Cancel in the confirmation deletes nothing", async () => {
    const transport = makeTransport();
    renderManager(transport);
    select("Mine");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(transport.remove).not.toHaveBeenCalled();
  });
});

describe("ProjectTypesManagerPage notice", () => {
  it("shows the list notice in an alert region when non-empty", () => {
    renderManager(makeTransport(), {
      listNotice: "2 saved project type files could not be used.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "2 saved project type files could not be used.",
    );
  });

  it("shows nothing when the notice is empty", () => {
    renderManager(makeTransport(), { listNotice: null });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has no axe violations with a notice and a refusal shown", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "id-clash" as const,
        message: "A project type with the id novel already exists.",
      })),
    });
    const { container } = renderManager(transport, {
      listNotice: "Saved project types could not be read.",
    });
    startDraft("novel", "Another");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findAllByRole("alert");
    await runAxe(container);
  });
});

describe("ProjectTypesManagerPage unsaved-changes prompt on every exit path", () => {
  const promptName = /unsaved changes/i;

  function renderWith(
    transport: ProjectTypesTransport,
    extra: {
      onClose?: () => void;
      registerCloseGuard?: (guard: (() => boolean) | null) => void;
    } = {},
  ): ReturnType<typeof render> {
    return render(
      <ProjectTypesManagerPage
        initialTemplates={[builtIn, saved]}
        resolveTransport={async () => transport}
        {...extra}
      />,
    );
  }

  it("select another item: prompts when an item has changes, Keep editing returns focus to the row", async () => {
    renderWith(makeTransport());
    startDraft("fresh", "Fresh");
    const row = screen.getByRole("button", { name: /Mine/ });
    row.focus();
    fireEvent.click(row);

    const dialog = await screen.findByRole("dialog", { name: promptName });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });

  it("select another item: no prompt when nothing has changed", () => {
    renderWith(makeTransport());
    select("Mine");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("ID")).toHaveValue("mine");
  });

  it("select another item: Discard drops every edit and moves to the chosen item", async () => {
    renderWith(makeTransport());
    select("Mine");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Mine edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Novel/ }));
    const dialog = await screen.findByRole("dialog", { name: promptName });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("ID")).toHaveValue("novel");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    select("Mine");
    expect(screen.getByLabelText("Name")).toHaveValue("Mine");
  });

  it("select another item: Save saves the draft, then moves to the chosen item", async () => {
    const transport = makeTransport();
    renderWith(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: /Novel/ }));
    const dialog = await screen.findByRole("dialog", { name: promptName });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByLabelText("ID")).toHaveValue("novel"),
    );
  });

  it("Escape in the prompt means Keep editing", async () => {
    renderWith(makeTransport());
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: /Novel/ }));
    const dialog = await screen.findByRole("dialog", { name: promptName });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });

  it("Escape on the page with unsaved changes opens the prompt, keeps the manager and the draft", async () => {
    renderWith(makeTransport());
    startDraft("fresh", "Fresh");
    const name = screen.getByLabelText("Name");
    name.focus();
    fireEvent.keyDown(name, { key: "Escape" });

    const dialog = await screen.findByRole("dialog", { name: promptName });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });

  it("Escape on the page does nothing new when nothing has changed", () => {
    const onClose = vi.fn();
    renderWith(makeTransport(), { onClose });
    const name = screen.getByLabelText("Name");
    fireEvent.keyDown(name, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape on the prompt closes only the prompt: the manager stays, the draft is intact, focus returns to the control that held it", async () => {
    const onClose = vi.fn();
    renderWith(makeTransport(), { onClose });
    startDraft("fresh", "Fresh");
    const name = screen.getByLabelText("Name");
    name.focus();
    fireEvent.keyDown(name, { key: "Escape" });
    const dialog = await screen.findByRole("dialog", { name: promptName });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
    expect(onClose).not.toHaveBeenCalled();
    // The same keystroke is not handled a second time by the manager.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("page Close: prompts when changed and calls onClose only after Discard", async () => {
    const onClose = vi.fn();
    renderWith(makeTransport(), { onClose });
    startDraft("fresh", "Fresh");
    const closeButton = screen.getByRole("button", { name: "Close" });
    closeButton.focus();
    fireEvent.click(closeButton);
    const dialog = await screen.findByRole("dialog", { name: promptName });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(closeButton);
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: promptName })).getByRole(
        "button",
        { name: "Discard" },
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("page Close: no prompt when nothing has changed", () => {
    const onClose = vi.fn();
    renderWith(makeTransport(), { onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("page Close: Save then closes", async () => {
    const onClose = vi.fn();
    const transport = makeTransport();
    renderWith(transport, { onClose });
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: promptName })).getByRole(
        "button",
        { name: "Save" },
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  it("modal dismissal: the registered guard blocks the dismissal and prompts when changed", async () => {
    let guard: (() => boolean) | null = null;
    const onClose = vi.fn();
    renderWith(makeTransport(), {
      onClose,
      registerCloseGuard: (next) => {
        guard = next;
      },
    });
    expect(guard).not.toBeNull();
    expect(guard!()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();

    startDraft("fresh", "Fresh");
    let isBlocked = false;
    act(() => {
      isBlocked = guard!();
    });
    expect(isBlocked).toBe(true);
    const dialog = await screen.findByRole("dialog", { name: promptName });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("browser back: prompts when changed, Keep editing stays, Discard goes back", async () => {
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    renderWith(makeTransport());
    startDraft("fresh", "Fresh");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const dialog = await screen.findByRole("dialog", { name: promptName });
    expect(back).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: promptName })).getByRole(
        "button",
        { name: "Discard" },
      ),
    );
    await waitFor(() => expect(back).toHaveBeenCalled());
    back.mockRestore();
  });

  it("browser back: nothing is intercepted when nothing has changed", () => {
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    renderWith(makeTransport());
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    back.mockRestore();
  });

  it("window or tab close: beforeunload is cancelled only while an item has changes", () => {
    renderWith(makeTransport());
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    startDraft("fresh", "Fresh");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("Save refused by a 409 keeps the writer in the manager with the draft intact", async () => {
    const onClose = vi.fn();
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "id-clash" as const,
        message: "A project type with the id fresh already exists.",
      })),
    });
    renderWith(transport, { onClose });
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: promptName })).getByRole(
        "button",
        { name: "Save" },
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ID")).toHaveValue("fresh");
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });

  it("Save refused as saving-unavailable keeps the writer on the draft instead of moving", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "saving-unavailable" as const,
        message: "Saving project types is not available here.",
      })),
    });
    renderWith(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: /Novel/ }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: promptName })).getByRole(
        "button",
        { name: "Save" },
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("not available");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("ID")).toHaveValue("fresh");
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
  });

  it("the prompt has no axe violations", async () => {
    renderWith(makeTransport());
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: /Novel/ }));
    await screen.findByRole("dialog", { name: promptName });
    await runAxe(document.body);
  });
});
