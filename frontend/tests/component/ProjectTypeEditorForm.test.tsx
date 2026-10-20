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
