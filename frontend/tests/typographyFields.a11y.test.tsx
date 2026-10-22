import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TypographyFields, {
  type TypographyFieldKey,
} from "../components/typography/TypographyFields";
import { runAxe } from "./a11y/helpers/axe";

const ALL: readonly TypographyFieldKey[] = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "letterSpacing",
];

describe("a11y: TypographyFields", () => {
  it.each([
    ["empty", {}],
    [
      "set",
      {
        fontFamily: "Lato",
        fontSize: "28px",
        fontWeight: "700",
        color: "#112233",
        letterSpacing: "0.05em",
      },
    ],
    [
      "unlisted and uncodec'd stored values",
      {
        fontFamily: "Garamond",
        fontSize: "1.5rem",
        fontWeight: "lighter",
        color: "red",
        letterSpacing: "2px",
      },
    ],
  ])("has no axe violations (%s)", async (_name, values) => {
    const { container } = render(
      <TypographyFields
        label="H2"
        idPrefix="h2"
        fields={ALL}
        values={values}
        onChange={() => undefined}
        allowOther
      />,
    );
    await runAxe(container);
  });

  it("has no axe violations in the line-height error state", async () => {
    const { container } = render(
      <TypographyFields
        label="Body"
        idPrefix="body"
        fields={["lineHeight", "paragraphSpacing"]}
        values={{ lineHeight: "2", paragraphSpacing: "16px" }}
        onChange={() => undefined}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Body Line Height" }),
      { target: { value: "1.5" } },
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    await runAxe(container);
  });
});
