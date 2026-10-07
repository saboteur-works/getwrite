import React from "react";
import { describe, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/mention-highlight-duration", () => ({
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS: 2,
  setMentionHighlightDuration: vi.fn(),
}));

import { setMentionHighlightDuration } from "../../src/lib/api/mention-highlight-duration";
import MentionHighlightDurationField from "../../components/Layout/MentionHighlightDurationField";
import { makeStore } from "../../src/store/store";

const mockSet = vi.mocked(setMentionHighlightDuration);

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ mentionHighlightDurationSeconds: undefined });
});

describe("a11y: MentionHighlightDurationField", () => {
  it("axe passes when unset (defaulted to 2)", async () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <MentionHighlightDurationField projectId="p1" />
      </Provider>,
    );
    await runAxe(container);
  });

  it("axe passes with a configured value", async () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <MentionHighlightDurationField
          projectId="p1"
          initialDurationSeconds={7}
        />
      </Provider>,
    );
    await runAxe(container);
  });

  it("axe passes with a client-side validation error shown", async () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <MentionHighlightDurationField projectId="p1" />
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("Highlight duration (seconds)"), {
      target: { value: "11" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save highlight duration" }),
    );
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
