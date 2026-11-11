/**
 * Component tests for the "Mark as claim" control (Feature 108, Task 19,
 * FR-14). The control is presentational: the selection comes in as a prop and
 * the write goes out through `onMarkClaim` (Task 2). No store and no Source
 * list is involved, which is the Sources-off case.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MarkClaimControl from "../../components/Editor/Citations/MarkClaimControl";
import { runAxe } from "../a11y/helpers/axe";

function setup(
  props: {
    selectionText?: string;
    onMarkClaim?: (statement: string) => Promise<void>;
  } = {},
) {
  const onMarkClaim = props.onMarkClaim ?? vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <MarkClaimControl
      selectionText={props.selectionText ?? "Harbour lights"}
      onMarkClaim={onMarkClaim}
    />,
  );
  return { onMarkClaim, ...utils };
}

const button = (): HTMLElement =>
  screen.getByRole("button", { name: "Mark as claim" });
const statement = (): HTMLTextAreaElement =>
  screen.getByLabelText("Claim statement") as HTMLTextAreaElement;

describe("MarkClaimControl", () => {
  it("has the accessible name Mark as claim and shows the selection as text", () => {
    setup({ selectionText: "<b>bold</b> text" });
    expect(button()).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Mark a claim" }),
    ).toBeInTheDocument();
    expect(screen.getByText("<b>bold</b> text")).toBeInTheDocument();
  });

  it("calls onMarkClaim with the statement when activated", async () => {
    const { onMarkClaim } = setup();
    fireEvent.change(statement(), { target: { value: "The lamp was lit." } });
    fireEvent.click(button());
    await waitFor(() =>
      expect(onMarkClaim).toHaveBeenCalledWith("The lamp was lit."),
    );
    expect(onMarkClaim).toHaveBeenCalledTimes(1);
  });

  it("is a focusable native button, so keyboard and touch activation both reach onClick", async () => {
    const { onMarkClaim } = setup();
    fireEvent.change(statement(), { target: { value: "A claim." } });
    button().focus();
    expect(button()).toHaveFocus();
    expect(button().tagName).toBe("BUTTON");
    fireEvent.click(button());
    await waitFor(() => expect(onMarkClaim).toHaveBeenCalled());
  });

  it("is disabled with a visible reason for an empty selection and does not call back", () => {
    const { onMarkClaim } = setup({ selectionText: "   " });
    fireEvent.change(statement(), { target: { value: "A claim." } });
    expect(button()).toHaveAttribute("aria-disabled", "true");
    const reason = screen.getByText(
      "Select the passage you want to mark as a claim.",
    );
    expect(reason).toBeVisible();
    expect(button()).toHaveAttribute("aria-describedby", reason.id);
    fireEvent.click(button());
    expect(onMarkClaim).not.toHaveBeenCalled();
  });

  it("refuses an empty statement with a message and does not call back", () => {
    const { onMarkClaim } = setup();
    fireEvent.click(button());
    expect(onMarkClaim).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Write the claim statement first.",
    );
  });

  it("refuses a statement over 5000 characters, never truncating it", () => {
    const { onMarkClaim } = setup();
    fireEvent.change(statement(), { target: { value: "a".repeat(5001) } });
    fireEvent.click(button());
    expect(onMarkClaim).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("5000");
  });

  it("accepts a statement of exactly 5000 characters", async () => {
    const { onMarkClaim } = setup();
    fireEvent.change(statement(), { target: { value: "a".repeat(5000) } });
    fireEvent.click(button());
    await waitFor(() => expect(onMarkClaim).toHaveBeenCalled());
  });

  it("announces working, ignores a second activation, then announces success and clears the draft", async () => {
    let resolve: () => void = () => undefined;
    const onMarkClaim = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    setup({ onMarkClaim });
    fireEvent.change(statement(), { target: { value: "A claim." } });
    fireEvent.click(button());
    expect(screen.getByRole("status")).toHaveTextContent("Saving the claim.");
    expect(button()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button());
    expect(onMarkClaim).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Marked as a claim.",
      ),
    );
    expect(statement().value).toBe("");
  });

  it("announces a failure with the reason, keeps the draft and re-enables", async () => {
    const onMarkClaim = vi
      .fn()
      .mockRejectedValue(new Error("Project is locked."));
    setup({ onMarkClaim });
    fireEvent.change(statement(), { target: { value: "A claim." } });
    fireEvent.click(button());
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The claim could not be saved. Project is locked.",
      ),
    );
    expect(statement().value).toBe("A claim.");
    expect(button()).toHaveAttribute("aria-disabled", "false");
  });

  it("uses no red class", () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/red/);
  });

  it("has no axe violations idle and with a message shown", async () => {
    const { container } = setup();
    await runAxe(container);
    fireEvent.click(button());
    await runAxe(container);
  });
});
