/** @vitest-environment jsdom */
/**
 * Feature 109, Task 31 (FR-19): axe-core check of the arrangement controls
 * closed, open with an unavailable arrangement, in the name form with an
 * error, and with the delete confirmation open. `region` is disabled because
 * the harness has no app-shell landmarks.
 */
import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerArrangementControls from "../../components/WorkArea/Views/OrganizerView/OrganizerArrangementControls";
import type { OrganizerArrangement } from "../../src/lib/models/organizer-grid-types";
import { runAxe } from "./helpers/axe";

afterEach(cleanup);

const arrangements: OrganizerArrangement[] = [
  {
    id: "a-1",
    name: "By status",
    source: { kind: "folder", folderId: "f1", scope: "children" },
    rows: { kind: "status" },
    columns: "none",
  },
  {
    id: "b-2",
    name: "Old query",
    source: { kind: "smart-folder", queryId: "q9" },
    rows: "none",
    columns: "order",
  },
];

function controls(): JSX.Element {
  return (
    <OrganizerArrangementControls
      arrangements={arrangements}
      selectedId="a-1"
      availability={{
        "a-1": { status: "available" },
        "b-2": {
          status: "unavailable",
          reason: "query-missing",
          message: "The smart folder no longer exists.",
        },
      }}
      isChangedSinceApplied
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe("a11y: OrganizerArrangementControls", () => {
  it("closed", async () => {
    const { container } = render(controls());
    await runAxe(container, ["region"]);
  });

  it("open with an unavailable arrangement", async () => {
    const { container } = render(controls());
    await userEvent.click(
      screen.getByRole("button", { name: /^arrangements/i }),
    );
    await runAxe(container, ["region"]);
  });

  it("name form with an error", async () => {
    const { container } = render(controls());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^arrangements/i }));
    await user.click(
      screen.getByRole("button", { name: "Save current arrangement" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await runAxe(container, ["region"]);
  });

  it("delete confirmation open", async () => {
    render(controls());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^arrangements/i }));
    await user.click(screen.getByRole("button", { name: "Delete By status" }));
    await runAxe(document.body, ["region"]);
  });
});
