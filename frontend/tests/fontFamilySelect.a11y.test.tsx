import React from "react";
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
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
});
