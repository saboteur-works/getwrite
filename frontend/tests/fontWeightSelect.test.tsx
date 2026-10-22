import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FontWeightSelect from "../components/preferences/FontWeightSelect";

function setup(family: string, value: string | undefined) {
  const onChange = vi.fn();
  const utils = render(
    <FontWeightSelect
      aria-label="H2 Font Weight"
      family={family}
      value={value}
      onChange={onChange}
    />,
  );
  const select = (): HTMLSelectElement =>
    screen.getByRole("combobox", { name: "H2 Font Weight" });
  const options = (): string[] =>
    Array.from<HTMLOptionElement>(select().querySelectorAll("option")).map(
      (o) => o.textContent ?? "",
    );
  const again = (nextFamily: string, nextValue: string | undefined): void =>
    utils.rerender(
      <FontWeightSelect
        aria-label="H2 Font Weight"
        family={nextFamily}
        value={nextValue}
        onChange={onChange}
      />,
    );
  return { select, options, onChange, again };
}

describe("FontWeightSelect", () => {
  it("offers Playwrite IE 100/200/300/400 and Use default", () => {
    const { options } = setup("Playwrite IE", undefined);
    expect(options()).toEqual([
      "Use default",
      "Thin 100",
      "ExtraLight 200",
      "Light 300",
      "Regular 400",
    ]);
  });

  it("offers Source Serif 4 Regular 400 and Semibold 600 only", () => {
    const { options } = setup("Source Serif 4", "400");
    expect(options()).toEqual(["Use default", "Regular 400", "Semibold 600"]);
  });

  it("offers IBM Plex Serif 400, 500, 700", () => {
    const { options } = setup("IBM Plex Serif", "500");
    expect(options()).toEqual([
      "Use default",
      "Regular 400",
      "Medium 500",
      "Bold 700",
    ]);
  });

  it("offers 400 and 700 for generic, system and unlisted names", () => {
    for (const family of ["serif", "Arial", "My Custom Font", ""]) {
      const { options } = setup(family, undefined);
      expect(options()).toEqual(["Use default", "Regular 400", "Bold 700"]);
      document.body.innerHTML = "";
    }
  });

  it("displays a stored bold as Bold 700 without calling onChange", () => {
    const { select, options, onChange } = setup("Lato", "bold");
    expect(select().value).toBe("700");
    expect(options()).not.toContain("bold (current value)");
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["lighter", "bolder"])(
    "shows a stored %s as a labelled extra and does not rewrite it",
    (stored) => {
      const { select, options, onChange } = setup("Lato", stored);
      expect(select().value).toBe(stored);
      expect(options()).toContain(`${stored} (current value)`);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("shows a stored 700 for Source Serif 4 as an extra, unrewritten", () => {
    const { select, options, onChange } = setup("Source Serif 4", "700");
    expect(select().value).toBe("700");
    expect(options()).toContain("700 (current value)");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("changes the options when the family changes, keeping an unoffered stored value as the extra", () => {
    const { select, options, again, onChange } = setup("Lato", "700");
    expect(options()).toEqual(["Use default", "Regular 400", "Bold 700"]);
    again("Source Serif 4", "700");
    expect(options()).toEqual([
      "Use default",
      "Regular 400",
      "Semibold 600",
      "700 (current value)",
    ]);
    expect(select().value).toBe("700");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with the numeric string, and empty for Use default", async () => {
    const { select, onChange } = setup("Lato", "400");
    await userEvent.selectOptions(select(), "700");
    expect(onChange).toHaveBeenLastCalledWith("700");
    await userEvent.selectOptions(select(), "");
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
