/** @vitest-environment jsdom */
/**
 * Feature 106, Task 16 (FR-11, FR-17): behaviour of the presentational
 * Capture box: key handling, close, focus return, status and failure messages.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptureBox, {
  captureConfirmationMessage,
  describeCaptureIssue,
  type CaptureBoxIssue,
  type CaptureBoxProps,
} from "../components/Capture/CaptureBox";

afterEach(cleanup);

function renderBox(overrides: Partial<CaptureBoxProps> = {}) {
  const props: CaptureBoxProps = {
    isOpen: true,
    text: "a thought",
    onTextChange: vi.fn(),
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const utils = render(<CaptureBox {...props} />);
  return { props, ...utils };
}

const textbox = () => screen.getByRole("textbox", { name: "Text to capture" });

describe("CaptureBox structure", () => {
  it("is a labelled dialog", () => {
    renderBox();
    expect(screen.getByRole("dialog", { name: "Capture" })).toBeInTheDocument();
  });

  it("renders nothing of the dialog when closed", () => {
    renderBox({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the project choice slot", () => {
    renderBox({ projectChoice: <span>Project picker here</span> });
    expect(screen.getByText("Project picker here")).toBeInTheDocument();
  });
});

describe("CaptureBox keys", () => {
  it("Enter submits", () => {
    const { props } = renderBox();
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Shift+Enter does not submit and is not prevented", () => {
    const { props } = renderBox();
    const notPrevented = fireEvent.keyDown(textbox(), {
      key: "Enter",
      shiftKey: true,
    });
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("Shift+Enter inserts a newline through typing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Harness(): JSX.Element {
      const [text, setText] = React.useState("");
      return (
        <CaptureBox
          isOpen
          text={text}
          onTextChange={setText}
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />
      );
    }
    render(<Harness />);
    await user.type(textbox(), "one{Shift>}{Enter}{/Shift}two");
    expect(textbox()).toHaveValue("one\ntwo");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Enter does not submit while composing", () => {
    const { props } = renderBox();
    fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("Enter is ignored while submitting", () => {
    const { props } = renderBox({ isSubmitting: true });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Capturing…" })).toBeDisabled();
  });

  it("Escape closes without submitting", async () => {
    const user = userEvent.setup();
    const { props } = renderBox();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("the Capture button submits and Close closes", async () => {
    const user = userEvent.setup();
    const { props } = renderBox();
    await user.click(screen.getByRole("button", { name: "Capture" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CaptureBox focus", () => {
  it("moves focus into the box when opened", () => {
    renderBox();
    expect(textbox()).toHaveFocus();
  });

  it("returns focus to the previously focused element after closing", async () => {
    function Harness(): JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setIsOpen(true)}>Opener</button>
          <CaptureBox
            isOpen={isOpen}
            text=""
            onTextChange={vi.fn()}
            onSubmit={() => setIsOpen(false)}
            onClose={() => setIsOpen(false)}
            confirmation={isOpen ? undefined : "Captured to Novel"}
          />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();
    fireEvent.click(opener);
    expect(textbox()).toHaveFocus();
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <CaptureBox
          isOpen
          text=""
          onTextChange={vi.fn()}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("CaptureBox confirmation", () => {
  it("announces the confirmation in a status region that does not take focus", () => {
    renderBox({
      isOpen: false,
      confirmation: captureConfirmationMessage("Novel"),
    });
    const region = screen.getByTestId("capture-confirmation");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveTextContent("Captured to Novel");
    expect(region).not.toHaveAttribute("tabindex");
  });

  it("shows no confirmation by default", () => {
    renderBox({ isOpen: false });
    expect(screen.getByTestId("capture-confirmation")).toBeEmptyDOMElement();
  });
});

const ISSUES: CaptureBoxIssue[] = [
  { kind: "emptyText" },
  { kind: "textTooLong", limit: 50000 },
  { kind: "projectNotFound" },
  { kind: "lockedDeclined" },
  { kind: "lockedLimited" },
  { kind: "inboxInTrash" },
  { kind: "seedingNotice" },
  { kind: "writingLogNotice" },
  { kind: "network" },
  { kind: "server" },
  { kind: "pairedRefused" },
];

describe("CaptureBox issues", () => {
  it("gives every issue its own distinct message", () => {
    const messages = ISSUES.map((i) => describeCaptureIssue(i).message);
    expect(new Set(messages).size).toBe(ISSUES.length);
    for (const message of messages) expect(message.length).toBeGreaterThan(10);
  });

  it("names the limit for over-long text", () => {
    expect(
      describeCaptureIssue({ kind: "textTooLong", limit: 50000 }).message,
    ).toContain("50,000");
  });

  it("uses status only for the two captured-with-notice kinds", () => {
    const status = ISSUES.filter(
      (i) => describeCaptureIssue(i).severity === "status",
    ).map((i) => i.kind);
    expect(status).toEqual(["seedingNotice", "writingLogNotice"]);
  });

  it.each(ISSUES)(
    "renders $kind in the right region and keeps the text",
    (issue) => {
      const view = describeCaptureIssue(issue);
      renderBox({ issue, text: "kept text" });
      const regions = screen
        .getAllByRole(view.severity)
        .filter((el: HTMLElement) => el.textContent === view.message);
      expect(regions).toHaveLength(1);
      expect(textbox()).toHaveValue("kept text");
      expect(textbox()).toHaveAccessibleDescription(view.message);
    },
  );

  it("shows no message when there is no issue", () => {
    renderBox();
    expect(screen.getAllByRole("alert")[0]).toBeEmptyDOMElement();
  });
});

describe("CaptureBox disabled state", () => {
  it("says a project is needed and disables capture", () => {
    renderBox({ isProjectNeeded: true, text: "" });
    expect(screen.getByText(/A project is needed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
    expect(textbox()).toBeDisabled();
  });

  it("does not show the project-needed message otherwise", () => {
    renderBox();
    expect(screen.queryByText(/A project is needed/)).not.toBeInTheDocument();
  });
});
