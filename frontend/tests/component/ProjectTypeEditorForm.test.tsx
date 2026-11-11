import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ProjectTypeEditorForm from "../../components/project-types/ProjectTypeEditorForm";
import type { ProjectTypeDefinition } from "../../src/types/project-types";
import { LINE_HEIGHT_FLOOR_MESSAGE } from "../../src/lib/editor-body-settings";
import { validateDraft } from "../../components/project-types/ProjectTypeDraftService";
import { MODULE_MANIFEST } from "../../src/lib/models/modules/manifest";
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
  onRefusalChange,
  modulesEditable,
  modulesReadOnlyReason,
}: {
  initial: ProjectTypeDefinition;
  onDefinition?: (d: ProjectTypeDefinition) => void;
  fieldErrors?: Record<string, string>;
  onRefusalChange?: (field: string, refused: boolean) => void;
  modulesEditable?: boolean;
  modulesReadOnlyReason?: "built-in" | "saving-unavailable";
}): JSX.Element {
  const [definition, setDefinition] = React.useState(initial);
  const noop = vi.fn();
  return (
    <ProjectTypeEditorForm
      definition={definition}
      fieldErrors={fieldErrors}
      onRefusalChange={onRefusalChange}
      modulesEditable={modulesEditable}
      modulesReadOnlyReason={modulesReadOnlyReason}
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
      const reports: boolean[] = [];
      render(
        <Harness
          initial={base}
          onRefusalChange={(_f, refused) => reports.push(refused)}
        />,
      );

      const field = screen.getByLabelText("Line Height");
      fireEvent.change(field, { target: { value } });

      const message = screen.getByText(LINE_HEIGHT_FLOOR_MESSAGE);
      expect(field).toHaveAttribute("aria-describedby", message.id);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveValue(value);
      // The form reports the refusal to its parent, which blocks Save.
      expect(reports.at(-1)).toBe(true);
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
    ["1.8", false],
    ["1.79", true],
    ["normal", true],
    ["", false],
  ])("typed %j: refused is %s and the typed value stays", (value, refused) => {
    const reports: [string, boolean][] = [];
    render(
      <Harness
        initial={{ ...base, editorConfig: { body: { lineHeight: "2" } } }}
        onRefusalChange={(field, r) => reports.push([field, r])}
      />,
    );
    const field = screen.getByLabelText("Body Line Height");
    fireEvent.change(field, { target: { value } });
    expect(field).toHaveValue(value);
    const last = reports.filter(([f]) => f === "lineHeight").at(-1);
    expect(last?.[1] ?? false).toBe(refused);
    if (refused) {
      expect(screen.getByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeInTheDocument();
    }
  });

  it("keeps the typed value after a refusal is followed by an accepted edit", () => {
    let latest: ProjectTypeDefinition = base;
    const reports: boolean[] = [];
    render(
      <Harness
        initial={base}
        onDefinition={(d) => (latest = d)}
        onRefusalChange={(_f, r) => reports.push(r)}
      />,
    );
    const field = screen.getByLabelText("Body Line Height");
    fireEvent.change(field, { target: { value: "1.7" } });
    fireEvent.change(field, { target: { value: "1.9" } });
    expect(latest.editorConfig?.body?.lineHeight).toBe("1.9");
    expect(screen.queryByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeNull();
    expect(reports.at(-1)).toBe(false);
  });

  it("does not put the refused text in the draft and has no wrapper onChange patch", () => {
    let latest: ProjectTypeDefinition = {
      ...base,
      editorConfig: { body: { lineHeight: "2" } },
    };
    render(<Harness initial={latest} onDefinition={(d) => (latest = d)} />);
    fireEvent.change(screen.getByLabelText("Body Line Height"), {
      target: { value: "1.7" },
    });
    expect(latest.editorConfig?.body?.lineHeight).toBe("2");
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../components/project-types/ProjectTypeEditorForm.tsx",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/handleBodyLineHeightRefusal|<div onChange/);
  });
});

describe("ProjectTypeEditorForm refused font names (Defect 1)", () => {
  it("reports a refused typed family scoped per heading level and per body, and clears on correction", () => {
    const reports: [string, boolean][] = [];
    render(
      <Harness
        initial={base}
        onRefusalChange={(field, r) => reports.push([field, r])}
      />,
    );
    fireEvent.change(screen.getByLabelText("H3 Font Family"), {
      target: { value: "__other__" },
    });
    const h3 = screen.getByLabelText("H3 Font Family other name");
    fireEvent.change(h3, { target: { value: "Q;R" } });
    expect(reports.filter(([f]) => f === "h3.fontFamily").at(-1)).toEqual([
      "h3.fontFamily",
      true,
    ]);
    expect(reports.some(([f, r]) => f.startsWith("h1.") && r)).toBe(false);
    fireEvent.change(h3, { target: { value: "Garamond" } });
    expect(reports.filter(([f]) => f === "h3.fontFamily").at(-1)?.[1]).toBe(
      false,
    );
  });

  it("a pasted refused name leaves the draft's family unchanged", () => {
    let latest: ProjectTypeDefinition = {
      ...base,
      editorConfig: { headings: { h3: { fontFamily: "Garamond" } } },
    };
    render(<Harness initial={latest} onDefinition={(d) => (latest = d)} />);
    fireEvent.change(screen.getByLabelText("H3 Font Family other name"), {
      target: { value: "Q;R" },
    });
    expect(latest.editorConfig?.headings?.h3?.fontFamily).toBe("Garamond");
  });
});

describe("ProjectTypeEditorForm module declaration (Feature 108, FR-5)", () => {
  const groupFor = (label: string): HTMLElement =>
    screen.getByRole("group", { name: label });

  it("shows one labelled on/off/not-set control per manifest module", () => {
    render(<Harness initial={base} modulesEditable />);
    for (const entry of MODULE_MANIFEST) {
      const group = groupFor(`${entry.view?.label ?? entry.id} module`);
      const radios = within(group).getAllByRole("radio");
      expect(
        radios.map((r: HTMLElement) => r.parentElement?.textContent),
      ).toEqual(["On", "Off", "Not set"]);
      expect(
        within(group).getByRole("radio", { name: "Not set" }),
      ).toBeChecked();
    }
  });

  it("reflects a declared state and writes the choice into the definition", () => {
    let latest: ProjectTypeDefinition = { ...base, modules: { claims: false } };
    render(
      <Harness
        initial={latest}
        onDefinition={(d) => (latest = d)}
        modulesEditable
      />,
    );
    const claims = groupFor("Claims module");
    expect(within(claims).getByRole("radio", { name: "Off" })).toBeChecked();

    fireEvent.click(within(claims).getByRole("radio", { name: "On" }));
    expect(latest.modules).toEqual({ claims: true });

    fireEvent.click(within(claims).getByRole("radio", { name: "Not set" }));
    expect(latest.modules).toBeUndefined();
  });

  it("uses native radios, one named group per module, so the arrow keys and Tab work", () => {
    render(<Harness initial={base} modulesEditable />);
    const names = MODULE_MANIFEST.map((entry) => {
      const radios = within(
        groupFor(`${entry.view?.label ?? entry.id} module`),
      ).getAllByRole("radio");
      const group = new Set(
        radios.map((r: HTMLElement) => r.getAttribute("name")),
      );
      expect(group.size).toBe(1);
      for (const radio of radios) {
        expect(radio).toHaveAttribute("type", "radio");
        expect(radio).not.toBeDisabled();
        expect(radio).not.toHaveAttribute("tabindex", "-1");
      }
      return [...group][0];
    });
    expect(new Set(names).size).toBe(MODULE_MANIFEST.length);
  });

  it("gives the editable and read-only module text a themed colour class", () => {
    const { unmount } = render(<Harness initial={base} modulesEditable />);
    const first = MODULE_MANIFEST[0];
    const radio = within(
      groupFor(`${first.view?.label ?? first.id} module`),
    ).getAllByRole("radio")[0];
    expect(radio.closest("label")).toHaveClass("text-gw-primary");
    expect(radio).toHaveClass("accent-current");
    unmount();
    render(<Harness initial={base} modulesEditable={false} />);
    const line = screen.getByText(
      new RegExp(`${first.view?.label ?? first.id} module:`),
    );
    expect(line).toHaveClass("text-gw-primary");
  });

  it("shows a field error as text linked to its control, and not on the others", () => {
    render(
      <Harness
        initial={base}
        modulesEditable
        fieldErrors={{ "modules.claims": "Claims must be on or off." }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Claims must be on or off.");
    expect(groupFor("Claims module")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(alert.id),
    );
    expect(groupFor("Claims module")).toHaveAttribute("aria-invalid", "true");
    expect(groupFor("Sources module")).not.toHaveAttribute("aria-invalid");
  });

  it("shows a whole-record error as text", () => {
    render(
      <Harness
        initial={base}
        modulesEditable
        fieldErrors={{ modules: "Modules must be a record." }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Modules must be a record.",
    );
  });

  it("shows a built-in's declaration read-only, as text, with no control", () => {
    render(
      <Harness
        initial={{ ...base, modules: { sources: true, claims: false } }}
        modulesReadOnlyReason="built-in"
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("Sources module: On")).toBeInTheDocument();
    expect(screen.getByText("Claims module: Off")).toBeInTheDocument();
    expect(
      screen.getByText(/built-in project type cannot be changed/i),
    ).toBeInTheDocument();
  });

  it("shows the declaration read-only with a text reason where saving is unavailable", () => {
    render(
      <Harness
        initial={{ ...base, modules: { claims: true } }}
        modulesReadOnlyReason="saving-unavailable"
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("Claims module: On")).toBeInTheDocument();
    expect(screen.getByText("Sources module: Not set")).toBeInTheDocument();
    expect(
      screen.getByText(/saving project types is not available here/i),
    ).toBeInTheDocument();
  });

  it("is read-only unless the parent says the declaration is editable", () => {
    render(<Harness initial={base} />);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it.each([
    ["editable", { modulesEditable: true }],
    ["built-in read-only", { modulesReadOnlyReason: "built-in" as const }],
    [
      "saving unavailable",
      { modulesReadOnlyReason: "saving-unavailable" as const },
    ],
    [
      "with an error",
      {
        modulesEditable: true,
        fieldErrors: { "modules.claims": "Claims must be on or off." },
      },
    ],
  ])("has no axe violations (%s)", async (_name, props) => {
    const { container } = render(
      <Harness initial={{ ...base, modules: { claims: true } }} {...props} />,
    );
    await runAxe(container);
  });
});
