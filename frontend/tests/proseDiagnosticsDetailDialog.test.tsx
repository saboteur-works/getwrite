import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProseDiagnosticsDetailDialog from "../components/Sidebar/ProseDiagnosticsDetailDialog";
import type { LocatedRepeatedWordResult } from "../src/lib/api/prose-diagnostics";

vi.mock("../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsDetail: vi.fn(),
}));

import { getProseDiagnosticsDetail } from "../src/lib/api/prose-diagnostics";

const PROJECT_ID = "proj-diagnostics-1";
const RESOURCE_ID = "res-1";

beforeEach(() => {
  vi.mocked(getProseDiagnosticsDetail).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("ProseDiagnosticsDetailDialog", () => {
  it("does not fetch while closed", () => {
    vi.mocked(getProseDiagnosticsDetail).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<Harness initialOpen={false} />);

    expect(getProseDiagnosticsDetail).not.toHaveBeenCalled();
  });

  it("shows a loading state immediately on open", () => {
    vi.mocked(getProseDiagnosticsDetail).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<Harness initialOpen />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows located phrases and positions once the fetch resolves", async () => {
    const detail: LocatedRepeatedWordResult[] = [
      { word: "the", count: 3, offsets: [0, 10, 20] },
      { word: "and", count: 2, offsets: [5, 15] },
    ];
    vi.mocked(getProseDiagnosticsDetail).mockResolvedValue(detail);

    render(<Harness initialOpen />);

    expect(await screen.findByText(/the/)).toBeInTheDocument();
    expect(screen.getByText(/0, 10, 20/)).toBeInTheDocument();
    expect(screen.getByText(/and/)).toBeInTheDocument();
    expect(screen.getByText(/5, 15/)).toBeInTheDocument();
  });

  it("shows an error state when the fetch throws", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockRejectedValue(new Error("boom"));

    render(<Harness initialOpen />);

    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument();
  });

  it("re-fetches on each open (no caching across opens)", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockResolvedValue([
      { word: "the", count: 1, offsets: [0] },
    ]);

    function ToggleHarness(): JSX.Element {
      const buttonRef = React.useRef<HTMLButtonElement>(null);
      const [isOpen, setIsOpen] = React.useState(true);
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
          <button type="button" onClick={() => setIsOpen(false)}>
            close-test-hook
          </button>
        </>
      );
    }

    render(<ToggleHarness />);
    await waitFor(() =>
      expect(getProseDiagnosticsDetail).toHaveBeenCalledTimes(1),
    );

    screen.getByText("close-test-hook").click();
    await waitFor(() => {
      expect(screen.queryByText(/the/)).not.toBeInTheDocument();
    });

    screen.getByText("Show detail").click();
    await waitFor(() =>
      expect(getProseDiagnosticsDetail).toHaveBeenCalledTimes(2),
    );
  });

  it("never renders any red-associated class or style (no-red convention)", async () => {
    vi.mocked(getProseDiagnosticsDetail).mockResolvedValue([
      { word: "the", count: 1, offsets: [0] },
    ]);

    const { container } = render(<Harness initialOpen />);

    await screen.findByText(/the/);

    expect(container.innerHTML).not.toMatch(/red/i);
    expect(container.innerHTML).not.toMatch(/#D44040/i);
  });
});
