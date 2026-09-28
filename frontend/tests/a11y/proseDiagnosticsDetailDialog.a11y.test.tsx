import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { runAxe } from "./helpers/axe";
import ProseDiagnosticsDetailDialog from "../../components/Sidebar/ProseDiagnosticsDetailDialog";
import type { LocatedRepeatedWordResult } from "../../src/lib/api/prose-diagnostics";

vi.mock("../../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsDetail: vi.fn(),
}));

import { getProseDiagnosticsDetail } from "../../src/lib/api/prose-diagnostics";

const PROJECT_ID = "proj-diagnostics-dialog-a11y";
const RESOURCE_ID = "res-diagnostics-dialog-a11y";

function Harness({
  initialOpen = true,
}: {
  initialOpen?: boolean;
}): JSX.Element {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = React.useState(initialOpen);
  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setIsOpen(true)}>
        Show detail
      </button>
      <ProseDiagnosticsDetailDialog
        isOpen={isOpen}
        projectId={PROJECT_ID}
        resourceId={RESOURCE_ID}
        onClose={() => setIsOpen(false)}
        returnFocusRef={buttonRef}
      />
    </>
  );
}

beforeEach(() => {
  vi.mocked(getProseDiagnosticsDetail).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y: ProseDiagnosticsDetailDialog", () => {
  it("axe passes closed", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockImplementation(
      () => new Promise(() => {}),
    );
    const { container } = render(<Harness initialOpen={false} />);
    await runAxe(container);
  });

  it("axe passes open in the loading state", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<Harness initialOpen />);
    await screen.findByText(/loading/i);
    await runAxe(document.body);
  });

  it("axe passes open in the ready state", async () => {
    const detail: LocatedRepeatedWordResult[] = [
      { word: "the", count: 3, offsets: [0, 10, 20] },
      { word: "and", count: 2, offsets: [5, 15] },
    ];
    vi.mocked(getProseDiagnosticsDetail).mockResolvedValue(detail);

    render(<Harness initialOpen />);
    await screen.findByText(/the/);
    await runAxe(document.body);
  });

  it("axe passes open in the error state", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockRejectedValue(new Error("boom"));

    render(<Harness initialOpen />);
    await screen.findByText(/couldn't load/i);
    await runAxe(document.body);
  });

  it("axe passes open with zero located results", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockResolvedValue([]);

    render(<Harness initialOpen />);
    await waitFor(() => {
      expect(screen.getByText(/no repeated words found/i)).toBeInTheDocument();
    });
    await runAxe(document.body);
  });
});
