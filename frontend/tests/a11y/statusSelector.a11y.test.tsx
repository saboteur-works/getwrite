import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { runAxe } from "./helpers/axe";
import StatusSelector from "../../components/Sidebar/controls/StatusSelector";

describe("a11y: StatusSelector", () => {
  it("axe passes with the empty-list hint present", async () => {
    const { container } = render(
      <StatusSelector ariaLabel="status" value="" options={[]} />,
    );
    const select = screen.getByRole("combobox", { name: "status" });
    const hint = screen.getByText(/No statuses yet/);
    expect(select).toHaveAttribute("aria-describedby", hint.id);
    await runAxe(container);
  });

  it("axe passes with the hint absent", async () => {
    const { container } = render(
      <StatusSelector
        ariaLabel="status"
        value="Published"
        options={["Outline", "Draft"]}
      />,
    );
    expect(screen.queryByText(/No statuses yet/)).toBeNull();
    await runAxe(container);
  });
});
