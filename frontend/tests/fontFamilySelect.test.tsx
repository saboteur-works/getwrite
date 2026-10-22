import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FontFamilySelect from "../components/preferences/FontFamilySelect";
import { FONT_FAMILY_LIST, OTHER_FONT_OPTION } from "../src/lib/fonts/fonts";

const LABELS: string[] = FONT_FAMILY_LIST.map((f) => f.label);

function setup(props: Partial<React.ComponentProps<typeof FontFamilySelect>>) {
  const onChange = vi.fn();
  render(
    <FontFamilySelect
      aria-label="Body Font Family"
      value={undefined}
      onChange={onChange}
      {...props}
    />,
  );
  const select = screen.getByRole("combobox", { name: "Body Font Family" });
  const optionTexts = (): string[] =>
    Array.from<HTMLOptionElement>(select.querySelectorAll("option")).map(
      (o) => o.textContent ?? "",
    );
  return { select: select as HTMLSelectElement, onChange, optionTexts };
}

describe("FontFamilySelect", () => {
  it("shows every list entry in order when a value is set", () => {
    const { optionTexts } = setup({ value: "Lato" });
    expect(optionTexts()).toEqual(expect.arrayContaining(LABELS));
    const listed = optionTexts().filter((t) => LABELS.includes(t));
    expect(listed).toEqual(LABELS);
  });

  it("shows the same full list with no value", () => {
    const { optionTexts, select } = setup({ value: undefined });
    expect(optionTexts().filter((t) => LABELS.includes(t))).toEqual(LABELS);
    expect(select.value).toBe("");
  });

  it("styles bundled and generic entries in their own face, system entries not", () => {
    const { select } = setup({ value: undefined });
    const style = (label: string): string =>
      (
        Array.from(select.querySelectorAll("option")).find(
          (o: Element) => o.textContent === label,
        ) as HTMLOptionElement
      ).style.fontFamily;
    expect(style("Playfair Display")).toContain("Playfair Display");
    expect(style("serif")).toBe("serif");
    expect(style("Arial")).toBe("");
  });

  it("selects the matching entry for a stored value in another case without a change call", () => {
    const { select, onChange } = setup({ value: "arial" });
    expect(select.value).toBe("Arial");
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["Domine", "Garamond"])(
    "shows an unlisted stored %s as an extra entry and calls no change",
    async (stored) => {
      const user = userEvent.setup();
      const { select, onChange, optionTexts } = setup({ value: stored });
      expect(optionTexts()).toContain(stored);
      expect(select.selectedOptions[0].textContent).toBe(stored);
      await user.click(select);
      await user.keyboard("{Escape}");
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("does not fold an unlisted value into the empty selection", () => {
    const { select } = setup({ value: "Garamond" });
    expect(select.value).not.toBe("");
  });

  it("calls onChange with the label when an entry is chosen", async () => {
    const user = userEvent.setup();
    const { select, onChange } = setup({ value: "Lato" });
    await user.selectOptions(select, "Merriweather");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Merriweather");
  });

  it("calls onChange with an empty string when the default entry is chosen", async () => {
    const user = userEvent.setup();
    const { select, onChange } = setup({ value: "Lato" });
    await user.selectOptions(select, "Use default");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("Escape leaves the value unchanged", async () => {
    const user = userEvent.setup();
    const { select, onChange } = setup({ value: "Lato" });
    select.focus();
    await user.keyboard("{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(select.value).toBe("Lato");
  });

  it("is reachable by Tab and every entry is a keyboard-selectable option", async () => {
    const user = userEvent.setup();
    const { select, onChange } = setup({ value: undefined });
    await user.tab();
    expect(select).toHaveFocus();
    for (const label of LABELS) {
      fireEvent.change(select, { target: { value: label } });
    }
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(LABELS);
  });

  it("has a visible focus-state class", () => {
    const { select } = setup({ value: undefined });
    expect(select.className).toContain("focus-visible:ring-1");
  });

  it("renders the Other... option only when allowed, and reports its choice", async () => {
    const user = userEvent.setup();
    const onOther = vi.fn();
    const first = setup({ value: "Lato" });
    expect(first.optionTexts()).not.toContain(OTHER_FONT_OPTION);
    document.body.innerHTML = "";
    const { select, onChange, optionTexts } = setup({
      value: "Lato",
      allowOther: true,
      onOther,
    });
    expect(optionTexts().at(-1)).toBe(OTHER_FONT_OPTION);
    await user.selectOptions(select, OTHER_FONT_OPTION);
    expect(onOther).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
