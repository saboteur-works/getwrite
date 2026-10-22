import React from "react";
import { describe, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FontFamilySelect from "../components/preferences/FontFamilySelect";
import { runAxe } from "./a11y/helpers/axe";

describe("a11y: FontFamilySelect", () => {
  it.each([
    ["no value", undefined],
    ["a listed value", "Lato"],
    ["an unlisted value", "Garamond"],
  ])("has no axe violations with %s", async (_name, value) => {
    const { container } = render(
      <FontFamilySelect
        aria-label="H1 Font Family"
        value={value}
        onChange={() => undefined}
        allowOther
      />,
    );
    await runAxe(container);
  });

  it("has no axe violations in the Other... state with the hint", async () => {
    const { container } = render(
      <FontFamilySelect
        aria-label="H1 Font Family"
        value="Garamond"
        onChange={() => undefined}
        allowOther
      />,
    );
    await runAxe(container);
  });

  it("has no axe violations in the refusal state", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FontFamilySelect
        aria-label="H1 Font Family"
        value="Garamond"
        onChange={() => undefined}
        allowOther
      />,
    );
    await user.type(screen.getByRole("textbox"), ",");
    expect(screen.getByRole("alert")).toBeTruthy();
    await runAxe(container);
  });
});
