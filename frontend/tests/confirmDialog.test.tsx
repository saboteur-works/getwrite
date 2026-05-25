import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "../components/common/ConfirmDialog";

const baseProps = {
  isOpen: true,
  title: "Delete resource",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("renders title and confirm/cancel buttons when open", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />,
    );
    expect(screen.getByText("Delete resource")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders description when provided", () => {
    render(
      <ConfirmDialog {...baseProps} description="This cannot be undone." />,
    );
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("does not render dialog content when isOpen is false", () => {
    render(<ConfirmDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} confirmLabel="Yes" />,
    );
    fireEvent.click(screen.getByText("Yes"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog {...baseProps} onCancel={onCancel} cancelLabel="No" />,
    );
    fireEvent.click(screen.getByText("No"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("details slot", () => {
    it("renders details content when provided", () => {
      render(
        <ConfirmDialog
          {...baseProps}
          details={<span>Editor content is pending</span>}
        />,
      );
      expect(screen.getByText("Editor content is pending")).toBeTruthy();
    });

    it("does not render details section when details is not provided", () => {
      render(<ConfirmDialog {...baseProps} />);
      expect(document.querySelector(".confirm-dialog-details")).toBeNull();
    });

    it("renders details section when details is provided", () => {
      render(<ConfirmDialog {...baseProps} details={<span>Pending</span>} />);
      expect(document.querySelector(".confirm-dialog-details")).toBeTruthy();
    });
  });
});
