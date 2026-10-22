import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ProjectTypeEditorForm from "../../components/project-types/ProjectTypeEditorForm";
import type { ProjectTypeDefinition } from "../../src/types/project-types";
import { LINE_HEIGHT_FLOOR_MESSAGE } from "../../src/lib/editor-body-settings";
import { validateDraft } from "../../components/project-types/ProjectTypeDraftService";
import { runAxe } from "../a11y/helpers/axe";

const base: ProjectTypeDefinition = {
  id: "novel",
  name: "Novel",
  description: "",
  folders: [{ name: "Workspace" }],
  defaultFolders: [],
  defaultResources: [],
  statuses: [],
};

function Harness({
  initial,
  onDefinition,
  fieldErrors,
}: {
  initial: ProjectTypeDefinition;
  onDefinition?: (d: ProjectTypeDefinition) => void;
  fieldErrors?: Record<string, string>;
}): JSX.Element {
  const [definition, setDefinition] = React.useState(initial);
  const noop = vi.fn();
  return (
    <ProjectTypeEditorForm
      definition={definition}
      fieldErrors={fieldErrors}
      onChange={(d) => {
        setDefinition(d);
        onDefinition?.(d);
      }}
      onAddFolder={noop}
      onRemoveFolder={noop}
      onAddResource={noop}
      onRemoveResource={noop}
      onWordCountGoalChange={noop}
      onAddStatus={noop}
      onRemoveStatus={noop}
      onUpdateStatus={noop}
      onAddDefaultFolder={noop}
      onRemoveDefaultFolder={noop}
    />
  );
}

describe("ProjectTypeEditorForm Line Height floor (FR-23)", () => {
  it.each(["1.7", "normal"])(
    "shows the floor message linked to the field for %j and keeps the value",
    (value) => {
      let latest: ProjectTypeDefinition = base;
      render(<Harness initial={base} onDefinition={(d) => (latest = d)} />);

      const field = screen.getByLabelText("Line Height");
      fireEvent.change(field, { target: { value } });

      const message = screen.getByText(LINE_HEIGHT_FLOOR_MESSAGE);
      expect(field).toHaveAttribute("aria-describedby", message.id);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveValue(value);
      // The draft the manager would save is refused by validateDraft too.
      expect(validateDraft(latest).valid).toBe(false);
    },
  );

  it.each(["", "2"])("shows no message for %j", (value) => {
    let latest: ProjectTypeDefinition = base;
    render(<Harness initial={base} onDefinition={(d) => (latest = d)} />);

    const field = screen.getByLabelText("Line Height");
    fireEvent.change(field, { target: { value: "1.7" } });
    fireEvent.change(field, { target: { value } });

    expect(screen.queryByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeNull();
    expect(field).not.toHaveAttribute("aria-describedby");
    expect(validateDraft(latest).valid).toBe(true);
  });

  it("shows the message for an already-invalid stored value", () => {
    render(
      <Harness
        initial={{ ...base, editorConfig: { body: { lineHeight: "1.2" } } }}
      />,
    );
    expect(screen.getByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeInTheDocument();
  });

  it("has no axe violations with the linked message shown", async () => {
    const { container } = render(
      <Harness
        initial={{ ...base, editorConfig: { body: { lineHeight: "1.7" } } }}
      />,
    );
    await runAxe(container);
  });
});

describe("ProjectTypeEditorForm field errors (FR-28 f)", () => {
  const populated: ProjectTypeDefinition = {
    ...base,
    statuses: ["", "Draft"],
    folders: [{ name: "Workspace" }, { name: "Workspace!" }],
    defaultFolders: [{ folder: "", name: "" }],
    defaultResources: [{ folder: "Workspace", name: "", type: "text" }],
  };
  const fieldErrors = {
    name: "Name must not be blank.",
    "statuses.0": "Status label must not be blank.",
    "folders.1.name": "Folder name is too similar.",
    "defaultFolders.0.name": "Subfolder name must not be blank.",
    "defaultFolders.0.folder": "Parent folder must not be blank.",
    "defaultResources.0.name": "Starter document name must not be blank.",
  };

  it("places each keyed message beside its own input as an alert linked by aria-describedby", () => {
    render(<Harness initial={populated} fieldErrors={fieldErrors} />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(Object.keys(fieldErrors).length);

    const expectLinked = (input: HTMLElement, text: string): void => {
      const alert = alerts.find((a: HTMLElement) => a.textContent === text);
      expect(alert).toBeDefined();
      expect(input.getAttribute("aria-describedby")).toBe(alert?.id);
      expect(input).toHaveAttribute("aria-invalid", "true");
    };
    expectLinked(
      screen.getAllByLabelText("Name")[0],
      "Name must not be blank.",
    );
    expectLinked(
      screen.getAllByLabelText("Status Label")[0],
      "Status label must not be blank.",
    );
    expect(screen.getAllByLabelText("Status Label")[1]).not.toHaveAttribute(
      "aria-invalid",
    );
    expectLinked(
      screen.getAllByLabelText("Folder Name")[1],
      "Folder name is too similar.",
    );
    expectLinked(
      screen.getByLabelText("Parent Folder"),
      "Parent folder must not be blank.",
    );
  });

  it("shows no alert without field errors", () => {
    render(<Harness initial={populated} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the helper line under each starter document Folder field", () => {
    render(<Harness initial={populated} />);
    expect(
      screen.getByText("Leave empty to use the first folder."),
    ).toBeInTheDocument();
  });
});

describe("ProjectTypeEditorForm row names keep focus while typing", () => {
  const rows: ProjectTypeDefinition = {
    ...base,
    folders: [{ name: "Drafts" }],
    defaultFolders: [{ folder: "Workspace", name: "Part 1" }],
    defaultResources: [{ folder: "Workspace", name: "Opening", type: "text" }],
  };

  it.each([
    ["folder name", "Drafts"],
    ["subfolder name", "Part 1"],
    ["starter document name", "Opening"],
  ])("the %s input stays the focused element after a change", (_, start) => {
    render(<Harness initial={rows} />);

    const field = screen.getByDisplayValue(start);
    field.focus();
    fireEvent.change(field, { target: { value: `${start}x` } });

    const after = screen.getByDisplayValue(`${start}x`);
    expect(after).toBe(field);
    expect(document.activeElement).toBe(after);
  });
});

// ── Feature 91, Task 19 (FR-12, FR-15, FR-16): shared typography fields ────

const BUILT_IN_DIR = path.resolve(
  __dirname,
  "../../../getwrite-config/templates/project-types",
);
const BUILT_IN_FILES: readonly string[] = fs
  .readdirSync(BUILT_IN_DIR)
  .filter(
    (name: string) =>
      name.endsWith("_type.json") || name === "game_documentation.json",
  );

function loadBuiltIn(fileName: string): ProjectTypeDefinition {
  return JSON.parse(
    fs.readFileSync(path.join(BUILT_IN_DIR, fileName), "utf8"),
  ) as ProjectTypeDefinition;
}

describe("ProjectTypeEditorForm shared typography fields (FR-15)", () => {
  it("finds the six built-in project type files", () => {
    expect(BUILT_IN_FILES).toHaveLength(6);
  });

  it.each(BUILT_IN_FILES)(
    "%s validates and opens without any field changing",
    (fileName) => {
      const loaded = loadBuiltIn(fileName);
      expect(validateDraft(loaded).valid).toBe(true);

      const seen: ProjectTypeDefinition[] = [];
      render(<Harness initial={loaded} onDefinition={(d) => seen.push(d)} />);
      // No change callback fires on open, so the draft is the loaded spec.
      expect(seen).toEqual([]);
      expect(screen.getByLabelText("H1 Font Size")).toBeInTheDocument();
      expect(screen.getByLabelText("Body Font Size")).toBeInTheDocument();
    },
  );

  it("offers the stored 500 weight for IBM Plex Serif and keeps it", () => {
    const loaded = loadBuiltIn("novel_project_type.json");
    const weights = Object.values(loaded.editorConfig?.headings ?? {}).map(
      (h) => h?.fontWeight,
    );
    expect(weights).toContain("500");
    render(<Harness initial={loaded} />);
    const withFive = screen
      .getAllByRole("combobox")
      .filter((el: HTMLElement) => (el as HTMLSelectElement).value === "500");
    expect(withFive.length).toBeGreaterThan(0);
  });

  it("displays a stored keyword weight as 700 without rewriting it", () => {
    const seen: ProjectTypeDefinition[] = [];
    render(
      <Harness
        initial={{
          ...base,
          editorConfig: {
            headings: {
              h1: { fontFamily: "IBM Plex Serif", fontWeight: "bold" },
            },
          },
        }}
        onDefinition={(d) => seen.push(d)}
      />,
    );
    expect(
      (screen.getByLabelText("H1 Font Weight") as HTMLSelectElement).value,
    ).toBe("700");
    expect(seen).toEqual([]);
  });

  it("no longer has the free-text family and letter spacing fields or keyword weights", () => {
    render(
      <Harness
        initial={{
          ...base,
          editorConfig: { headings: { h1: { fontWeight: "normal" } } },
        }}
      />,
    );
    expect(screen.queryByPlaceholderText("Georgia, serif")).toBeNull();
    expect(screen.queryByPlaceholderText("0.05em")).toBeNull();
    expect(screen.queryByPlaceholderText("IBM Plex Serif")).toBeNull();
    expect(screen.queryByRole("option", { name: "lighter" })).toBeNull();
    expect(screen.queryByRole("option", { name: "bolder" })).toBeNull();
    expect(screen.getByLabelText("H1 Letter Spacing")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("H1 Font Family").tagName).toBe("SELECT");
  });

  it("adds no preview", () => {
    render(<Harness initial={base} />);
    expect(screen.queryByLabelText(/preview/i)).toBeNull();
  });
});

describe("ProjectTypeEditorForm patches editorConfig as before (FR-15)", () => {
  type Heading = NonNullable<
    NonNullable<
      NonNullable<ProjectTypeDefinition["editorConfig"]>["headings"]
    >["h2"]
  >;
  // The pre-change patchHeading/patchBody, as a reference for before/after.
  const refHeading = (
    def: ProjectTypeDefinition,
    updates: Partial<Heading>,
  ): ProjectTypeDefinition => ({
    ...def,
    editorConfig: {
      ...def.editorConfig,
      headings: {
        ...def.editorConfig?.headings,
        h2: { ...def.editorConfig?.headings?.h2, ...updates },
      },
    },
  });
  const refBody = (
    def: ProjectTypeDefinition,
    updates: Record<string, string | undefined>,
  ): ProjectTypeDefinition => ({
    ...def,
    editorConfig: {
      ...def.editorConfig,
      body: { ...def.editorConfig?.body, ...updates },
    },
  });
  const start: ProjectTypeDefinition = {
    ...base,
    editorConfig: {
      headings: { h2: { fontFamily: "Georgia", color: "#112233" } }, // GW-HEX-EXEMPT: test fixture
      body: { fontFamily: "Georgia" },
    },
  };

  function edit(run: () => void): ProjectTypeDefinition {
    let latest: ProjectTypeDefinition = start;
    render(<Harness initial={start} onDefinition={(d) => (latest = d)} />);
    run();
    return latest;
  }

  it.each([
    ["H2 Font Size", "24", { fontSize: "24px" }],
    ["H2 Letter Spacing", "0.05", { letterSpacing: "0.05em" }],
  ])("heading %s", (name, typed, expected) => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText(name), {
        target: { value: typed },
      }),
    );
    expect(result).toEqual(refHeading(start, expected));
  });

  it("heading family and weight", () => {
    const family = edit(() =>
      fireEvent.change(screen.getByLabelText("H2 Font Family"), {
        target: { value: "Times New Roman" },
      }),
    );
    expect(family.editorConfig?.headings?.h2?.fontFamily).toBe(
      "Times New Roman",
    );
    expect(family).toEqual(
      refHeading(start, { fontFamily: "Times New Roman" }),
    );
  });

  it("heading weight", () => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText("H2 Font Weight"), {
        target: { value: "700" },
      }),
    );
    expect(result).toEqual(refHeading(start, { fontWeight: "700" }));
  });

  it("heading colour", () => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText("H2 Color"), {
        target: { value: "#aabbcc" }, // GW-HEX-EXEMPT: test fixture
      }),
    );
    expect(result).toEqual(refHeading(start, { color: "#aabbcc" })); // GW-HEX-EXEMPT: test fixture
  });

  it("clearing a heading field stores undefined, as before", () => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText("H2 Font Family"), {
        target: { value: "" },
      }),
    );
    expect(result).toEqual(refHeading(start, { fontFamily: undefined }));
  });

  it.each([
    ["Body Font Size", "18", { fontSize: "18px" }],
    ["Body Line Height", "1.8", { lineHeight: "1.8" }],
    ["Body Paragraph Spacing", "1.5em", { paragraphSpacing: "1.5em" }],
  ])("body %s", (name, typed, expected) => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText(name), {
        target: { value: typed },
      }),
    );
    expect(result).toEqual(refBody(start, expected));
  });

  it("body family", () => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText("Body Font Family"), {
        target: { value: "Verdana" },
      }),
    );
    expect(result).toEqual(refBody(start, { fontFamily: "Verdana" }));
  });

  it("validateDraft accepts the edited drafts", () => {
    const result = edit(() =>
      fireEvent.change(screen.getByLabelText("Body Font Size"), {
        target: { value: "18" },
      }),
    );
    expect(validateDraft(result).valid).toBe(true);
  });
});

describe("ProjectTypeEditorForm line height floor in the shared field (FR-16)", () => {
  it.each([
    ["1.8", true],
    ["1.79", false],
    ["normal", false],
    ["", true],
  ])("typed %j: draft valid is %s and the typed value stays", (value, ok) => {
    let latest: ProjectTypeDefinition = {
      ...base,
      editorConfig: { body: { lineHeight: "2" } },
    };
    render(<Harness initial={latest} onDefinition={(d) => (latest = d)} />);
    const field = screen.getByLabelText("Body Line Height");
    fireEvent.change(field, { target: { value } });
    expect(field).toHaveValue(value);
    // Save is refused through validateDraft exactly when the value is refused.
    expect(validateDraft(latest).valid).toBe(ok);
    if (!ok) {
      expect(screen.getByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeInTheDocument();
      expect(latest.editorConfig?.body?.lineHeight).toBe(value);
    }
  });

  it("keeps the typed value after a refusal is followed by an accepted edit", () => {
    let latest: ProjectTypeDefinition = base;
    render(<Harness initial={base} onDefinition={(d) => (latest = d)} />);
    const field = screen.getByLabelText("Body Line Height");
    fireEvent.change(field, { target: { value: "1.7" } });
    fireEvent.change(field, { target: { value: "1.9" } });
    expect(latest.editorConfig?.body?.lineHeight).toBe("1.9");
    expect(screen.queryByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeNull();
  });
});
