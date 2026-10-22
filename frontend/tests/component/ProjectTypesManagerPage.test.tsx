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
import userEvent from "@testing-library/user-event";
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

  it("blocks Save while a Line Height is refused and saves once it is valid (Task 24)", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    const field = screen.getByLabelText("Line Height");
    fireEvent.change(field, { target: { value: "1.79" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(transport.create).not.toHaveBeenCalled();
    expect(field).toHaveValue("1.79");
    fireEvent.change(field, { target: { value: "1.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
  });
});

describe("ProjectTypesManagerPage refused font names (Defect 1)", () => {
  it.each(["H3", "Body"])(
    "blocks Save while a typed %s font name is refused and saves once corrected",
    async (level) => {
      const user = userEvent.setup();
      const transport = makeTransport();
      renderManager(transport);
      startDraft("fresh", "Fresh");
      fireEvent.change(screen.getByLabelText(`${level} Font Family`), {
        target: { value: "__other__" },
      });
      const name = screen.getByLabelText(`${level} Font Family other name`);
      await user.type(name, "Q;R");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(transport.create).not.toHaveBeenCalled();
      expect(name).toHaveValue("Q;R");
      fireEvent.change(name, { target: { value: "Garamond" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
    },
  );
});

describe("ProjectTypesManagerPage refusals", () => {
  it("id clash (409) shows an alert next to the id field and keeps the draft", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "id-clash" as const,
        message: "Novel (built-in) already uses this id.",
      })),
    });
    renderManager(transport);
    startDraft("novel", "Another");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Novel (built-in) already uses this id.");
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
        message: "Novel (built-in) already uses this name.",
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
    expect(alert).toHaveTextContent("Novel (built-in) already uses this name.");
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

function sectionOf(title: string): HTMLElement {
  const section = screen
    .getByRole("heading", { name: title })
    .closest("section");
  if (!section) throw new Error(`no section for ${title}`);
  return section;
}

/** The input is flagged invalid and linked to an alert that reads `message`. */
function expectFieldAlert(input: HTMLElement, message: string): void {
  expect(input).toHaveAttribute("aria-invalid", "true");
  const id = input.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  const alert = document.getElementById(id ?? "");
  expect(alert).not.toBeNull();
  expect(alert).toHaveAttribute("role", "alert");
  expect(alert).toHaveTextContent(message);
}

function expectNoFieldAlert(input: HTMLElement): void {
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
}

function clickSave(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("ProjectTypesManagerPage intro text (FR-29 b)", () => {
  it("describes built-in types and your own, and no longer names the config folder", () => {
    renderManager(makeTransport());
    expect(
      screen.getByText(
        "View built-in project types, and create, edit and delete your own.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(
      "getwrite-config/templates/project-types",
    );
  });
});

describe("ProjectTypesManagerPage field errors (FR-28 f, g)", () => {
  it("empty status label: shown at the status input, edits kept, nothing sent, not repeated in the action bar", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    clickSave();

    const input = await screen.findByLabelText("Status Label");
    await waitFor(() =>
      expectFieldAlert(input, "Status label must not be blank."),
    );
    expect(transport.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ID")).toHaveValue("fresh");
    expect(screen.getByLabelText("Name")).toHaveValue("Fresh");
    expect(input).toHaveValue("");
    expect(screen.getAllByText("Status label must not be blank.")).toHaveLength(
      1,
    );
  });

  it("blank type name: shown at the Name input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "");
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getByLabelText("Name"),
        "Name must not be blank.",
      ),
    );
    expect(transport.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ID")).toHaveValue("fresh");
    expect(screen.getAllByText("Name must not be blank.")).toHaveLength(1);
  });

  it("duplicate status: the second input carries the message, the first does not", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    const [first, second] = screen.getAllByLabelText("Status Label");
    fireEvent.change(first, { target: { value: "Draft" } });
    fireEvent.change(second, { target: { value: "draft" } });
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getAllByLabelText("Status Label")[1],
        "Duplicate status label.",
      ),
    );
    expectNoFieldAlert(screen.getAllByLabelText("Status Label")[0]);
    expect(transport.create).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText("Status Label")[1]).toHaveValue("draft");
  });

  it("blank relationship type: the form has no input for it, so it is listed once in the action bar", async () => {
    const transport = makeTransport();
    render(
      <ProjectTypesManagerPage
        initialTemplates={[
          {
            ...saved,
            // The definition type has no relationshipTypes (the form has no
            // input for them), but a stored type can carry the list.
            definition: {
              ...saved.definition,
              relationshipTypes: ["Ally", ""],
            } as ProjectTypeDefinition,
          },
        ]}
        resolveTransport={async () => transport}
      />,
    );
    clickSave();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Relationship type must not be blank.");
    expect(
      screen.getAllByText("Relationship type must not be blank."),
    ).toHaveLength(1);
    expect(transport.update).not.toHaveBeenCalled();
  });

  it("blank folder name: shown at that folder's input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getAllByLabelText("Folder Name")[1],
        "Folder name must not be blank.",
      ),
    );
    expectNoFieldAlert(screen.getAllByLabelText("Folder Name")[0]);
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("blank subfolder name: shown at the subfolder Name input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Default Folder" }));
    clickSave();

    const section = sectionOf("Default Folders");
    await waitFor(() =>
      expectFieldAlert(
        within(section).getByLabelText("Name"),
        "Subfolder name must not be blank.",
      ),
    );
    expectNoFieldAlert(within(section).getByLabelText("Parent Folder"));
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("blank Parent Folder: 'Parent folder must not be blank.' at that input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Default Folder" }));
    const section = sectionOf("Default Folders");
    fireEvent.change(within(section).getByLabelText("Name"), {
      target: { value: "Act" },
    });
    fireEvent.change(within(section).getByLabelText("Parent Folder"), {
      target: { value: "" },
    });
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        within(section).getByLabelText("Parent Folder"),
        "Parent folder must not be blank.",
      ),
    );
    expectNoFieldAlert(within(section).getByLabelText("Name"));
    expect(within(section).getByLabelText("Name")).toHaveValue("Act");
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("blank starter document name: shown at that Name input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));
    clickSave();

    const section = sectionOf("Default Resources");
    await waitFor(() =>
      expectFieldAlert(
        within(section).getByLabelText("Name"),
        "Starter document name must not be blank.",
      ),
    );
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("slug-too-similar folders: the message names both and sits at the second folder's input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));
    fireEvent.change(screen.getAllByLabelText("Folder Name")[1], {
      target: { value: "Workspace!" },
    });
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getAllByLabelText("Folder Name")[1],
        "Folder name “Workspace!” is too similar to “Workspace”.",
      ),
    );
    expectNoFieldAlert(screen.getAllByLabelText("Folder Name")[0]);
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("slug-too-similar subfolders under one parent: at the second subfolder's input", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Default Folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Default Folder" }));
    const section = sectionOf("Default Folders");
    const [firstName, secondName] = within(section).getAllByLabelText("Name");
    fireEvent.change(firstName, { target: { value: "Chapter 1" } });
    fireEvent.change(secondName, { target: { value: "Chapter 1!" } });
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        within(section).getAllByLabelText("Name")[1],
        "Subfolder name “Chapter 1!” is too similar to “Chapter 1”.",
      ),
    );
    expectNoFieldAlert(within(section).getAllByLabelText("Name")[0]);
  });

  it("starter documents with the same slug are allowed (Task 37: no collision on disk)", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));
    const section = sectionOf("Default Resources");
    const [a, b] = within(section).getAllByLabelText("Name");
    fireEvent.change(a, { target: { value: "Chapter 1" } });
    fireEvent.change(b, { target: { value: "Chapter 1!" } });
    clickSave();

    await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starter document Folder shows the helper line and an empty value raises no error", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));
    const section = sectionOf("Default Resources");
    expect(
      within(section).getByText("Leave empty to use the first folder."),
    ).toBeInTheDocument();
    fireEvent.change(within(section).getAllByLabelText("Name")[0], {
      target: { value: "Opening" },
    });
    fireEvent.change(within(section).getByLabelText("Folder"), {
      target: { value: "" },
    });
    clickSave();

    await waitFor(() => expect(transport.create).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("two blank rows each show their own message; fixing one clears only its message and aria-invalid", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    clickSave();

    await waitFor(() => {
      const [first, second] = screen.getAllByLabelText("Status Label");
      expectFieldAlert(first, "Status label must not be blank.");
      expectFieldAlert(second, "Status label must not be blank.");
      expect(first.getAttribute("aria-describedby")).not.toBe(
        second.getAttribute("aria-describedby"),
      );
    });

    fireEvent.change(screen.getAllByLabelText("Status Label")[0], {
      target: { value: "Draft" },
    });

    const [first, second] = screen.getAllByLabelText("Status Label");
    expectNoFieldAlert(first);
    expectFieldAlert(second, "Status label must not be blank.");
    expect(screen.getAllByText("Status label must not be blank.")).toHaveLength(
      1,
    );
  });

  it("an error with no field (no folders) stays in the action bar; a field error is not also listed there", async () => {
    const transport = makeTransport();
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    fireEvent.click(
      within(sectionOf("Folders")).getByRole("button", { name: "Remove" }),
    );
    clickSave();

    const bar = (await screen.findAllByRole("alert")).find(
      (el: HTMLElement) => el.tagName === "DIV",
    );
    expect(bar).toBeDefined();
    expect(bar).not.toHaveTextContent("Status label must not be blank.");
    expectFieldAlert(
      screen.getByLabelText("Status Label"),
      "Status label must not be blank.",
    );
    expect(screen.getAllByText("Status label must not be blank.")).toHaveLength(
      1,
    );
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("Save as copy on a built-in follows the same path", async () => {
    const transport = makeTransport();
    renderManager(transport);
    select("Novel");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    const bar = screen.getByRole("group", { name: "Project type actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Save as copy" }));

    await waitFor(() =>
      expectFieldAlert(
        screen.getByLabelText("Status Label"),
        "Status label must not be blank.",
      ),
    );
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("Save as copy on a saved type follows the same path", async () => {
    const transport = makeTransport();
    renderManager(transport);
    select("Mine");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    const bar = screen.getByRole("group", { name: "Project type actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Save as copy" }));

    await waitFor(() =>
      expectFieldAlert(
        screen.getByLabelText("Status Label"),
        "Status label must not be blank.",
      ),
    );
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.update).not.toHaveBeenCalled();
  });

  it("a 400 whose path maps to a field is shown at that field, not in the action bar", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "invalid" as const,
        message: "The project type is not valid.",
        fieldErrors: { "statuses.0": "Status label must not be blank." },
      })),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    fireEvent.change(screen.getByLabelText("Status Label"), {
      target: { value: "Draft" },
    });
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getByLabelText("Status Label"),
        "Status label must not be blank.",
      ),
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByLabelText("Status Label")).toHaveValue("Draft");
  });

  it("a 400 whose path maps to no field is shown in the action bar", async () => {
    const transport = makeTransport({
      create: vi.fn(async () => ({
        ok: false as const,
        reason: "invalid" as const,
        message: "The project type is not valid.",
        fieldErrors: { folders: "Too small: expected at least 1 folder." },
      })),
    });
    renderManager(transport);
    startDraft("fresh", "Fresh");
    clickSave();

    const alert = await screen.findByRole("alert");
    expect(alert.tagName).toBe("DIV");
    expect(alert).toHaveTextContent("Too small: expected at least 1 folder.");
    expect(screen.getByLabelText("ID")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("has no axe violations with field errors showing", async () => {
    const transport = makeTransport();
    const { container } = renderManager(transport);
    startDraft("fresh", "");
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));
    fireEvent.change(screen.getAllByLabelText("Folder Name")[1], {
      target: { value: "Workspace!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Default Folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Resource" }));
    clickSave();

    await waitFor(() =>
      expectFieldAlert(
        screen.getByLabelText("Status Label"),
        "Status label must not be blank.",
      ),
    );
    expect(
      container.querySelectorAll('[role="alert"][id]').length,
    ).toBeGreaterThanOrEqual(5);
    await runAxe(container);
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
