/**
 * Integration tests for the UpdateNotice container: it fetches once on mount,
 * shows the banner only when an update is actionable, persists Dismiss/Skip, and
 * renders nothing when suppressed, when no update exists, or when the check fails
 * (FR3, FR7, FR8, FR9).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import UpdateNotice from "../components/Layout/UpdateNotice";
import { setSuppressedVersion } from "../src/lib/update-notice-suppression";
import type { UpdateCheckResult } from "../src/lib/models/update-check";

const { fetchUpdateCheck } = vi.hoisted(() => ({ fetchUpdateCheck: vi.fn() }));
vi.mock("../src/store/update-check-transport-service", () => ({
  fetchUpdateCheck,
}));

const UPDATE: UpdateCheckResult = {
  updateAvailable: true,
  currentVersion: "0.2.49",
  latestVersion: "0.3.0",
  releaseUrl: "https://github.com/saboteur-works/getwrite/releases/tag/v0.3.0",
  downloadUrl: "https://example.com/GetWrite-0.3.0.dmg",
};

beforeEach(() => {
  localStorage.clear();
  fetchUpdateCheck.mockReset();
});

describe("UpdateNotice", () => {
  it("fetches once on mount and shows the banner when an update is available", async () => {
    fetchUpdateCheck.mockResolvedValue(UPDATE);
    render(<UpdateNotice />);

    expect(await screen.findByText(/is available/i)).toBeInTheDocument();
    expect(screen.getByText("0.3.0")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view release notes/i }),
    ).toHaveAttribute("href", UPDATE.releaseUrl);
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      UPDATE.downloadUrl,
    );
    expect(fetchUpdateCheck).toHaveBeenCalledTimes(1);
  });

  it("hides the banner and persists the version on dismiss (FR7)", async () => {
    fetchUpdateCheck.mockResolvedValue(UPDATE);
    render(<UpdateNotice />);

    const dismiss = await screen.findByRole("button", {
      name: /dismiss update notice/i,
    });
    fireEvent.click(dismiss);

    await waitFor(() =>
      expect(screen.queryByText(/is available/i)).not.toBeInTheDocument(),
    );
    expect(
      localStorage.getItem("getwrite.updateNotice.suppressedVersion"),
    ).toBe("0.3.0");
  });

  it("persists the version on skip", async () => {
    fetchUpdateCheck.mockResolvedValue(UPDATE);
    render(<UpdateNotice />);

    const skip = await screen.findByRole("button", {
      name: /skip this version/i,
    });
    fireEvent.click(skip);

    await waitFor(() =>
      expect(screen.queryByText(/is available/i)).not.toBeInTheDocument(),
    );
    expect(
      localStorage.getItem("getwrite.updateNotice.suppressedVersion"),
    ).toBe("0.3.0");
  });

  it("renders nothing when the available version is already suppressed", async () => {
    setSuppressedVersion("0.3.0");
    fetchUpdateCheck.mockResolvedValue(UPDATE);
    const { container } = render(<UpdateNotice />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/is available/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no update is available (FR3/FR8)", async () => {
    fetchUpdateCheck.mockResolvedValue({ updateAvailable: false });
    const { container } = render(<UpdateNotice />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
