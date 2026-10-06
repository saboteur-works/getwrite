import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../src/lib/api/mention-highlight-duration", () => ({
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS: 2,
  setMentionHighlightDuration: vi.fn(),
}));

import { setMentionHighlightDuration } from "../src/lib/api/mention-highlight-duration";
import MentionHighlightDurationField, {
  type MentionHighlightDurationFieldProps,
} from "../components/Layout/MentionHighlightDurationField";
import { makeStore } from "../src/store/store";
import {
  setProject,
  setSelectedProjectId,
  selectActiveProjectMentionHighlightDurationSeconds,
} from "../src/store/projectsSlice";

const mockSet = vi.mocked(setMentionHighlightDuration);

/**
 * The field now dispatches `setProjectMentionHighlightDurationSeconds` on a
 * successful save (so a jump right after saving reads the new value without
 * a project reload) — it needs a real Redux store in its tree even though
 * most of these tests don't assert anything about the store itself.
 */
function renderField(props: MentionHighlightDurationFieldProps) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: props.projectId,
      name: "Test Project",
      rootPath: `/tmp/${props.projectId}`,
    }),
  );
  store.dispatch(setSelectedProjectId(props.projectId));
  render(
    <Provider store={store}>
      <MentionHighlightDurationField {...props} />
    </Provider>,
  );
  return store;
}

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
    renderField({ projectId: "p1", initialDurationSeconds: 5 });
    expect(input().value).toBe("5");
  });

  it("defaults to 2 when the project has never set a value", () => {
    renderField({ projectId: "p1" });
    expect(input().value).toBe("2");
  });

  it("saves a valid integer 1-10 through the transport", async () => {
    mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: 7 });
    renderField({ projectId: "p1" });
    fireEvent.change(input(), { target: { value: "7" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", 7));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
  });

  it("updates the Redux-cached project config on a successful save, so a jump handler reading it live sees the new value without a project reload", async () => {
    mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: 7 });
    const store = renderField({ projectId: "p1" });
    fireEvent.change(input(), { target: { value: "7" } });
    save();
    await waitFor(() =>
      expect(
        selectActiveProjectMentionHighlightDurationSeconds(store.getState()),
      ).toBe(7),
    );
  });

  it.each(["1", "10"])("accepts the inclusive bound %s", async (value) => {
    mockSet.mockResolvedValue({
      mentionHighlightDurationSeconds: Number(value),
    });
    renderField({ projectId: "p1" });
    fireEvent.change(input(), { target: { value } });
    save();
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith("p1", Number(value)),
    );
  });

  it.each(["0", "11", "3.5", "abc", "-2"])(
    "rejects %s with an accessible error and does not save",
    async (value) => {
      renderField({ projectId: "p1" });
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
    renderField({ projectId: "p1", initialDurationSeconds: 4 });
    fireEvent.change(input(), { target: { value: "9" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
    expect(input().value).toBe("9");
  });

  it("clears an emptied field by sending null to the transport", async () => {
    mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: undefined });
    renderField({ projectId: "p1", initialDurationSeconds: 6 });
    fireEvent.change(input(), { target: { value: "" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
  });
});
