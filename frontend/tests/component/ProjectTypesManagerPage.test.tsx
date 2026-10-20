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
