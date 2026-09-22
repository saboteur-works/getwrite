// Last Updated: 2026-09-22

/**
 * Covers `ProjectEncryptionPanel`'s runtime gate: it must render nothing on
 * the native runtime, independently of `lockStatus`, and must otherwise keep
 * its existing web-only null-render behaviour unchanged.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

let fakeState: any;

const mockDispatch = vi.fn();

vi.mock("../src/store/hooks", () => ({
  __esModule: true,
  default: (selector: any) => selector(fakeState),
  useAppDispatch: () => mockDispatch,
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
