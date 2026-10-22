import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TypographyFields, {
  type TypographyFieldKey,
  type TypographyValues,
} from "../components/typography/TypographyFields";

const ALL: readonly TypographyFieldKey[] = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "letterSpacing",
];

function setup(
  values: TypographyValues,
  fields: readonly TypographyFieldKey[] = ALL,
) {
  const onChange = vi.fn();
  const utils = render(
    <TypographyFields
      label="H2"
      idPrefix="h2"
      fields={fields}
      values={values}
      onChange={onChange}
      allowOther
    />,
  );
  return { onChange, ...utils };
}

describe("TypographyFields", () => {
  it("shows only the requested inputs", () => {
    setup({}, ["fontSize", "letterSpacing"]);
    expect(
      screen.getByRole("spinbutton", { name: "H2 Font Size" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("spinbutton", { name: "H2 Letter Spacing" }),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText("H2 Color")).toBeNull();
  });

  it("names every input with the level and shows visible labels", () => {
    setup({});
    for (const name of ["H2 Font Family", "H2 Font Weight"]) {
      expect(screen.getByRole("combobox", { name })).toBeTruthy();
    }
    expect(screen.getByLabelText("H2 Color")).toBeTruthy();
    for (const text of [
      "Font Size",
      "Font Family",
      "Font Weight",
      "Letter Spacing",
      "Color",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("emits size as <n>px and letter spacing as <n>em with the specified steps", () => {
    const { onChange } = setup({ fontSize: "28px", letterSpacing: "0.05em" });
    const size = screen.getByRole("spinbutton", {
      name: "H2 Font Size",
    }) as HTMLInputElement;
    const spacing = screen.getByRole("spinbutton", {
      name: "H2 Letter Spacing",
    }) as HTMLInputElement;
    expect(size.value).toBe("28");
    expect(spacing.value).toBe("0.05");
    expect(spacing.getAttribute("step")).toBe("0.01");
    expect(spacing.getAttribute("min")).toBe("0");
    fireEvent.change(size, { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith("fontSize", "30px");
    fireEvent.change(spacing, { target: { value: "0.1" } });
    expect(onChange).toHaveBeenLastCalledWith("letterSpacing", "0.1em");
    fireEvent.change(size, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("fontSize", "");
  });

  it("shows a colour input not hidden from assistive tech, with the value as text", () => {
    const { onChange } = setup({ color: "#112233" });
    const colour = screen.getByLabelText("H2 Color") as HTMLInputElement;
    expect(colour.type).toBe("color");
    expect(colour.getAttribute("aria-hidden")).toBeNull();
    expect(colour.getAttribute("tabindex")).not.toBe("-1");
    expect(colour.value).toBe("#112233");
    expect(screen.getByText("#112233")).toBeTruthy();
    fireEvent.change(colour, { target: { value: "#abcdef" } });
    expect(onChange).toHaveBeenLastCalledWith("color", "#abcdef");
  });

  it("changing the family updates the offered weights", async () => {
    const user = userEvent.setup();
    function Harness(): JSX.Element {
      const [values, setValues] = useState<TypographyValues>({
        fontFamily: "Playwrite IE",
      });
      return (
        <TypographyFields
          label="H2"
          idPrefix="h2"
          fields={ALL}
          values={values}
          onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          allowOther
        />
      );
    }
    render(<Harness />);
    const weightOptions = (): string[] =>
      Array.from<HTMLOptionElement>(
        screen
          .getByRole("combobox", { name: "H2 Font Weight" })
          .querySelectorAll("option"),
      ).map((o) => o.textContent ?? "");
    expect(weightOptions()).toContain("Thin 100");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "H2 Font Family" }),
      "Source Serif 4",
    );
    expect(weightOptions()).toEqual([
      "Use default",
      "Regular 400",
      "Semibold 600",
    ]);
  });

  it("shows the Other... field and hint for an unlisted family", () => {
    setup({ fontFamily: "Garamond" });
    expect(
      screen.getByRole("textbox", { name: "H2 Font Family other name" }),
    ).toHaveProperty("value", "Garamond");
    expect(
      screen.getByText(
        "If this font isn't installed on this device, text shows in IBM Plex Serif.",
      ),
    ).toBeTruthy();
  });

  it("shows stored values outside the codec and does not rewrite them on mount", () => {
    const { onChange } = setup({
      fontFamily: "Domine",
      fontSize: "1.5rem",
      fontWeight: "lighter",
      color: "red",
      letterSpacing: "2px",
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/1\.5rem/)).toBeTruthy();
    expect(screen.getByText(/2px/)).toBeTruthy();
    expect(screen.getByText("red")).toBeTruthy();
    expect(screen.getByText(/lighter/)).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "H2 Font Family other name" }),
    ).toHaveProperty("value", "Domine");
  });

  it("disables every input when disabled", () => {
    render(
      <TypographyFields
        label="Body"
        idPrefix="body"
        fields={ALL}
        values={{}}
        onChange={() => undefined}
        disabled
      />,
    );
    for (const el of screen.getAllByRole("spinbutton")) {
      expect((el as HTMLInputElement).disabled).toBe(true);
    }
    for (const el of screen.getAllByRole("combobox")) {
      expect((el as HTMLSelectElement).disabled).toBe(true);
    }
    expect(
      (screen.getByLabelText("Body Color") as HTMLInputElement).disabled,
    ).toBe(true);
  });
});
