import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FontFamilySelect from "../components/preferences/FontFamilySelect";
import { FONT_FAMILY_LIST, OTHER_FONT_OPTION } from "../src/lib/fonts/fonts";
import { buildFontFamilyValue } from "../src/lib/fonts/font-family-stack";

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

  describe("Other... name field", () => {
    const HINT =
      "If this font isn't installed on this device, text shows in IBM Plex Serif.";
    const nameField = (): HTMLInputElement =>
      screen.getByRole("textbox") as HTMLInputElement;

    it("reveals the name field and moves focus to it when Other... is chosen", async () => {
      const user = userEvent.setup();
      const { select } = setup({ value: "Lato", allowOther: true });
      expect(screen.queryByRole("textbox")).toBeNull();
      await user.selectOptions(select, OTHER_FONT_OPTION);
      expect(nameField()).toHaveFocus();
    });

    it("shows the fixed hint whenever the field is shown, linked by aria-describedby", async () => {
      const user = userEvent.setup();
      const { select } = setup({ value: "Lato", allowOther: true });
      expect(screen.queryByText(HINT)).toBeNull();
      await user.selectOptions(select, OTHER_FONT_OPTION);
      const hint = screen.getByText(HINT);
      expect(nameField().getAttribute("aria-describedby")).toContain(hint.id);
    });

    it("stores a typed name trimmed", async () => {
      const user = userEvent.setup();
      const { select, onChange } = setup({ value: "Lato", allowOther: true });
      await user.selectOptions(select, OTHER_FONT_OPTION);
      await user.type(nameField(), "  Garamond  ");
      expect(onChange).toHaveBeenLastCalledWith("Garamond");
      expect(onChange.mock.calls.every((c) => c[0] === c[0].trim())).toBe(true);
    });

    it.each(['"', "'", ";", "{", "}", "\\", "(", ")", "<", ">", ","])(
      "refuses %s with a role=alert message and writes nothing",
      async (ch) => {
        const user = userEvent.setup();
        const { select, onChange } = setup({ value: "Lato", allowOther: true });
        await user.selectOptions(select, OTHER_FONT_OPTION);
        await user.type(nameField(), `Gar${ch === "{" ? "{{" : ch}`);
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toMatch(/cannot contain/);
        expect(nameField().getAttribute("aria-describedby")).toContain(
          alert.id,
        );
        expect(nameField()).toHaveAttribute("aria-invalid", "true");
        expect(onChange.mock.calls.map((c) => c[0])).not.toContain(`Gar${ch}`);
      },
    );

    it("clears the refusal once the text is valid again", async () => {
      const user = userEvent.setup();
      const { select } = setup({ value: "Lato", allowOther: true });
      await user.selectOptions(select, OTHER_FONT_OPTION);
      await user.type(nameField(), "A,");
      expect(screen.getByRole("alert")).toBeTruthy();
      await user.type(nameField(), "{Backspace}");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("an empty name is not an error and clears the family", async () => {
      const user = userEvent.setup();
      const { onChange } = setup({ value: "Garamond", allowOther: true });
      await user.clear(nameField());
      expect(screen.queryByRole("alert")).toBeNull();
      expect(onChange).toHaveBeenLastCalledWith("");
      expect(nameField()).toBeVisible();
    });

    it.each(["domine", "Garamond", "Foo, Bar"])(
      "opens an unlisted stored %s as Other... with the text unchanged and writes nothing",
      async (stored) => {
        const user = userEvent.setup();
        const { select, onChange } = setup({ value: stored, allowOther: true });
        expect(select.selectedOptions[0].textContent).toBe(OTHER_FONT_OPTION);
        expect(nameField().value).toBe(stored);
        expect(screen.getByText(HINT)).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        await user.click(select);
        await user.keyboard("{Escape}");
        expect(onChange).not.toHaveBeenCalled();
        expect(buildFontFamilyValue(stored)).toBe(
          stored.includes(",")
            ? stored
            : `"${stored}", "IBM Plex Serif", serif`,
        );
      },
    );

    it("keeps the extra entry and no name field without allowOther (toolbar mode)", () => {
      const { optionTexts } = setup({ value: "Garamond" });
      expect(optionTexts()).toContain("Garamond");
      expect(optionTexts()).not.toContain(OTHER_FONT_OPTION);
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("hides the field and writes the label when a list entry is chosen afterwards", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      function Harness(): JSX.Element {
        const [v, setV] = React.useState<string | undefined>("Garamond");
        return (
          <FontFamilySelect
            aria-label="Body Font Family"
            value={v}
            onChange={(next) => {
              onChange(next);
              setV(next);
            }}
            allowOther
          />
        );
      }
      render(<Harness />);
      await user.selectOptions(screen.getByRole("combobox"), "Lato");
      expect(onChange).toHaveBeenCalledWith("Lato");
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });
});
