import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Switch from "../../components/common/UI/Switch/Switch";

describe("Switch", () => {
  it("is a switch named by its label, showing its state", () => {
    render(
      <>
        <Switch id="s" checked onChange={() => undefined} />
        <label htmlFor="s">Share my projects</label>
      </>,
    );

    expect(
      screen.getByRole("switch", { name: "Share my projects" }),
    ).toBeChecked();
  });

  it("reports the next state on click and on Space", async () => {
    const next: boolean[] = [];
    render(
      <Switch
        aria-label="Setting"
        checked={false}
        onChange={(e) => next.push(e.target.checked)}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Setting" });

    await userEvent.click(toggle);
    toggle.focus();
    await userEvent.keyboard(" ");

    expect(next).toEqual([true, true]);
  });

  it("does not change when disabled", async () => {
    const onChange = vi.fn();
    render(
      <Switch
        aria-label="Setting"
        checked={false}
        disabled
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("switch", { name: "Setting" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Setting" })).toBeDisabled();
  });

  it("forwards its ref to the input so it can be focused", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <Switch
        ref={ref}
        aria-label="Setting"
        checked={false}
        onChange={() => undefined}
      />,
    );

    ref.current?.focus();

    expect(screen.getByRole("switch", { name: "Setting" })).toHaveFocus();
  });
});
