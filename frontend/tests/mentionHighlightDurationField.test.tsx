import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/lib/api/mention-highlight-duration", () => ({
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS: 2,
  setMentionHighlightDuration: vi.fn(),
}));

import { setMentionHighlightDuration } from "../src/lib/api/mention-highlight-duration";
import MentionHighlightDurationField from "../components/Layout/MentionHighlightDurationField";

const mockSet = vi.mocked(setMentionHighlightDuration);

function input(): HTMLInputElement {
  return screen.getByLabelText(
    "Highlight duration (seconds)",
  ) as HTMLInputElement;
}

function save(): void {
  fireEvent.click(
    screen.getByRole("button", { name: "Save highlight duration" }),
  );
}

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: undefined });
});

describe("MentionHighlightDurationField", () => {
  it("shows the current configured value", () => {
    render(
      <MentionHighlightDurationField
        projectId="p1"
        initialDurationSeconds={5}
      />,
    );
    expect(input().value).toBe("5");
  });

  it("defaults to 2 when the project has never set a value", () => {
    render(<MentionHighlightDurationField projectId="p1" />);
    expect(input().value).toBe("2");
  });

  it("saves a valid integer 1-10 through the transport", async () => {
    mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: 7 });
    render(<MentionHighlightDurationField projectId="p1" />);
    fireEvent.change(input(), { target: { value: "7" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", 7));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
  });

  it.each(["1", "10"])("accepts the inclusive bound %s", async (value) => {
    mockSet.mockResolvedValue({
      mentionHighlightDurationSeconds: Number(value),
    });
    render(<MentionHighlightDurationField projectId="p1" />);
    fireEvent.change(input(), { target: { value } });
    save();
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith("p1", Number(value)),
    );
  });

  it.each(["0", "11", "3.5", "abc", "-2"])(
    "rejects %s with an accessible error and does not save",
    async (value) => {
      render(<MentionHighlightDurationField projectId="p1" />);
      fireEvent.change(input(), { target: { value } });
      save();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/1 to 10|whole number/i);
      expect(input()).toHaveAttribute("aria-invalid", "true");
      expect(input().getAttribute("aria-describedby")).toContain(alert.id);
      expect(mockSet).not.toHaveBeenCalled();
    },
  );

  it("surfaces a failed save and keeps the typed value", async () => {
    mockSet.mockRejectedValue(new Error("boom"));
    render(
      <MentionHighlightDurationField
        projectId="p1"
        initialDurationSeconds={4}
      />,
    );
    fireEvent.change(input(), { target: { value: "9" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
    expect(input().value).toBe("9");
  });

  it("clears an emptied field by sending null to the transport", async () => {
    mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: undefined });
    render(
      <MentionHighlightDurationField
        projectId="p1"
        initialDurationSeconds={6}
      />,
    );
    fireEvent.change(input(), { target: { value: "" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
  });
});
