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
}: {
  initial: ProjectTypeDefinition;
  onDefinition?: (d: ProjectTypeDefinition) => void;
}): JSX.Element {
  const [definition, setDefinition] = React.useState(initial);
  const noop = vi.fn();
  return (
    <ProjectTypeEditorForm
      definition={definition}
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
