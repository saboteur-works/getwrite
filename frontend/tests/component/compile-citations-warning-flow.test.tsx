/** @vitest-environment jsdom */
/**
 * Feature 116, Task 31 (FR-15, FR-19, FR-23): the pre-run citation check and
 * warning flow in the compile dialog, with a fake check. Written right after
 * the implementation was drafted, not before it.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import type { AnyResource } from "../../src/lib/models/types";
import type { CitationCheckResult } from "../../src/lib/models/citations-types";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";

const resources = [
  {
    id: "r1",
    slug: "scene-1",
    name: "Scene 1",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 0,
  },
] as AnyResource[];

const WITH_GAPS: CitationCheckResult = {
  status: "ok",
  gaps: [
    {
      kind: "missing-detail",
      resourceId: "r1",
      sourceId: "s1",
      sourceName: "Field Guide",
      missingDetails: ["publisher"],
    },
  ],
  citationCount: 1,
  incompleteSourceCount: 1,
};
const NO_GAPS: CitationCheckResult = {
  status: "ok",
  gaps: [],
  citationCount: 1,
  incompleteSourceCount: 0,
};
const FAILED: CitationCheckResult = {
  status: "failed",
  failure: "engine-failed",
  message: "The engine failed.",
};

type Check = (
  projectId: string,
  ids: readonly string[],
) => Promise<CitationCheckResult>;

function setup(check: Check, isCitationsOn: boolean = true) {
  const onConfirmCompile = vi.fn();
  const onClose = vi.fn();
  const runCitationCheck = vi.fn(check);
  render(
    <CompilePreviewModal
      isOpen
      projectId="p1"
      resources={resources}
      readSavedDefaults={async () => undefined}
      citationsModuleEnabled
      runCitationCheck={runCitationCheck}
      onConfirmCompile={onConfirmCompile}
      onClose={onClose}
    />,
  );
  fireEvent.change(screen.getByLabelText(/compile as/i), {
    target: { value: "pdf" },
  });
  if (isCitationsOn) {
    fireEvent.click(screen.getByRole("checkbox", { name: /citations/i }));
  }
  return { onConfirmCompile, onClose, runCitationCheck };
}

const clickCompile = async (): Promise<void> => {
  const button = await screen.findByRole("button", { name: /^compile \(/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};

class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  render(): React.ReactNode {
    return this.state.error ? (
      <p>caught {this.state.error.name}</p>
    ) : (
      this.props.children
    );
  }
}

describe("CompilePreviewModal — citation warning flow", () => {
  it("opens the warning before any compile; Proceed compiles with the option", async () => {
    const { onConfirmCompile, runCitationCheck } = setup(async () => WITH_GAPS);
    await clickCompile();
    await screen.findByRole("button", { name: "Proceed" });
    expect(runCitationCheck).toHaveBeenCalledWith("p1", ["r1"]);
    expect(onConfirmCompile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(onConfirmCompile.mock.calls[0][1].citations).toEqual({
      styleId: expect.any(String),
    });
  });

  it("Cancel sends nothing and keeps the dialog open", async () => {
    const { onConfirmCompile, onClose } = setup(async () => WITH_GAPS);
    await clickCompile();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull(),
    );
    expect(onConfirmCompile).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("compile-preview-modal")).toBeTruthy();
  });

  it("compiles with no warning when the check finds no gaps", async () => {
    const { onConfirmCompile } = setup(async () => NO_GAPS);
    await clickCompile();
    await waitFor(() => expect(onConfirmCompile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull();
  });

  it("shows a failed check and starts no compile", async () => {
    const { onConfirmCompile } = setup(async () => FAILED);
    await clickCompile();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull();
    expect(onConfirmCompile).not.toHaveBeenCalled();
  });

  it("shows a failure, not a compile, when the check itself throws", async () => {
    const { onConfirmCompile } = setup(async () => {
      throw new Error("boom");
    });
    await clickCompile();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onConfirmCompile).not.toHaveBeenCalled();
  });

  it("rethrows a locked project to the existing locked path", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onConfirmCompile = vi.fn();
    render(
      <Boundary>
        <CompilePreviewModal
          isOpen
          projectId="p1"
          resources={resources}
          readSavedDefaults={async () => undefined}
          citationsModuleEnabled
          runCitationCheck={async () => {
            throw new ProjectLockedError("p1");
          }}
          onConfirmCompile={onConfirmCompile}
          onClose={vi.fn()}
        />
      </Boundary>,
    );
    fireEvent.change(screen.getByLabelText(/compile as/i), {
      target: { value: "pdf" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /citations/i }));
    await clickCompile();
    await screen.findByText("caught ProjectLockedError");
    expect(onConfirmCompile).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("makes no check with the switch off and compiles as before", async () => {
    const { onConfirmCompile, runCitationCheck } = setup(
      async () => WITH_GAPS,
      false,
    );
    await clickCompile();
    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(runCitationCheck).not.toHaveBeenCalled();
    expect("citations" in onConfirmCompile.mock.calls[0][1]).toBe(false);
  });
});
