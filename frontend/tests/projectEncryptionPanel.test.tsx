// Last Updated: 2026-09-22

/**
 * Covers `ProjectEncryptionPanel`'s runtime gate: it must render nothing on
 * the native runtime, independently of `lockStatus`, and must otherwise keep
 * its existing web-only null-render behaviour unchanged.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

let fakeState: any;

const mockDispatch = vi.fn();

vi.mock("../src/store/hooks", () => ({
  __esModule: true,
  default: (selector: any) => selector(fakeState),
  useAppDispatch: () => mockDispatch,
}));

// Feature 77 Task 19: EncryptionSettings reads the shared limits state; this
// test only needs the exempt (no limit) answer. No assertion changed.
const mockRefresh = vi.fn();

vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: mockRefresh,
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

import ProjectEncryptionPanel from "../components/preferences/ProjectEncryptionPanel";

const PROJECT_ID = "proj1";
const ROOT_PATH = "/repo/projects/proj1-directory";

function buildState(overrides: { lockStatus?: string } = {}) {
  return {
    projects: {
      selectedProjectId: PROJECT_ID,
      projects: {
        [PROJECT_ID]: { id: PROJECT_ID, name: "My Novel", rootPath: ROOT_PATH },
      },
    },
    crypto: {
      status: overrides.lockStatus ?? "unlocked",
      encryptedProjectIds: [],
      isConverting: false,
      isExporting: false,
      errorMessage: undefined,
    },
  };
}

describe("ProjectEncryptionPanel — runtime gate", () => {
  const originalRuntime = process.env.NEXT_PUBLIC_GETWRITE_RUNTIME;

  beforeEach(() => {
    mockDispatch.mockReset();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = originalRuntime;
  });

  it("renders nothing on the native runtime even in a state that renders on web", () => {
    // Sanity: this exact state renders on web (asserted below), so a null
    // result here can only be the runtime gate, not one of the panel's other
    // null-render conditions.
    fakeState = buildState({ lockStatus: "unlocked" });
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "native";

    const { container } = render(<ProjectEncryptionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders on the web runtime for the same state", () => {
    fakeState = buildState({ lockStatus: "unlocked" });
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "web";

    render(<ProjectEncryptionPanel />);
    expect(
      screen.getByRole("button", { name: /encrypt this project/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing on web when lockStatus is unknown", () => {
    fakeState = buildState({ lockStatus: "unknown" });
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "web";

    const { container } = render(<ProjectEncryptionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on web when lockStatus is unavailable", () => {
    fakeState = buildState({ lockStatus: "unavailable" });
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "web";

    const { container } = render(<ProjectEncryptionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on web when there is no active project directory", () => {
    fakeState = buildState({ lockStatus: "unlocked" });
    fakeState.projects.projects[PROJECT_ID].rootPath = undefined;
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "web";

    const { container } = render(<ProjectEncryptionPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProjectEncryptionPanel — refused lock and failed status check (Feature 77)", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockRefresh.mockReset();
    process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = "web";
  });

  it("re-reads the limits when a lock is refused", async () => {
    fakeState = buildState({ lockStatus: "unlocked" });
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.reject({ name: "LimitRefusalError", message: "Not here." }),
    });
    render(<ProjectEncryptionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /lock workspace/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not re-read the limits when a lock fails for another reason", async () => {
    fakeState = buildState({ lockStatus: "unlocked" });
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject({ name: "Error", message: "Boom." }),
    });
    render(<ProjectEncryptionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /lock workspace/i }));

    await Promise.resolve();
    await Promise.resolve();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows the failure text, not nothing, when the status could not be read", () => {
    fakeState = buildState({ lockStatus: "unknown" });
    fakeState.crypto.errorMessage = "Server unavailable.";
    render(<ProjectEncryptionPanel />);

    expect(screen.getByText("Server unavailable.")).toBeInTheDocument();
  });
});
