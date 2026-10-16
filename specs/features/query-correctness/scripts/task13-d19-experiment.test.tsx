/**
 * Task 13 / FR-18 throwaway experiment (D-19). Records observations only; asserts
 * nothing about intended behaviour. Each OBS line is a measurement.
 */
import React, { useState } from "react";
import { appendFileSync } from "node:fs";
import { describe, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterChip, {
  type FilterChipField,
  type FilterChipValue,
} from "../components/QueryBuilder/FilterChip";
import { buildFieldPickerFields } from "../components/QueryBuilder/FieldPicker";
import { filterResourceOptionsByScope } from "../components/Sidebar/folderScope";

const RESOURCES = [
  { id: "res-1", name: "Chapter One", folderId: undefined },
  { id: "res-2", name: "Scene Two", folderId: undefined },
  { id: "res-3", name: "Epilogue", folderId: undefined },
];
const TAGS = [
  { id: "tag-alpha", name: "alpha" },
  { id: "tag-beta", name: "beta" },
];

// AppShell.tsx:315-329 equivalent: resources only, scoped by refFolder (undefined here).
const resourceResolver = (
  refFolder: string | undefined,
  includeSubfolders?: boolean,
) => filterResourceOptionsByScope(RESOURCES, [], refFolder, includeSubfolders);
// Scratch option source: the project's tags.
const tagResolver = () => TAGS.map((t) => ({ id: t.id, name: t.name }));

function tagsField(): FilterChipField {
  const f = buildFieldPickerFields().find((x) => x.key === "tags");
  if (!f) throw new Error("no tags field");
  return f as FilterChipField;
}

let lastValue: FilterChipValue = null;
let calls = 0;

function Harness(props: {
  field: FilterChipField;
  operator: string;
  resolve?: typeof resourceResolver;
}): JSX.Element {
  const [value, setValue] = useState<FilterChipValue>(null);
  return (
    <FilterChip
      field={props.field}
      operator={props.operator}
      value={value}
      resolveResourceOptions={props.resolve}
      onValueChange={(v) => {
        calls += 1;
        lastValue = v;
        setValue(v);
      }}
    />
  );
}

function obs(label: string, data: unknown): void {
  appendFileSync(process.env.TASK13_OUT ?? "/dev/null", `OBS ${label} ${JSON.stringify(data)}\n`);
}

function describeValueBox(): unknown {
  const sel = document.querySelector("select[aria-label='Value'], select[aria-label='Values']");
  const inputs = Array.from(document.querySelectorAll("input")).map((i) => ({
    aria: i.getAttribute("aria-label"),
    placeholder: i.getAttribute("placeholder"),
  }));
  return {
    inputs,
    select: sel
      ? Array.from(sel.querySelectorAll("option")).map((o) => o.textContent)
      : null,
  };
}

function suggestionsAfterTyping(text: string): string[] {
  const input = document.querySelector<HTMLInputElement>(".picker-typeahead__input");
  if (!input) return ["<no typeahead input>"];
  fireEvent.change(input, { target: { value: text } });
  return Array.from(document.querySelectorAll("[role='option']")).map(
    (o) => o.textContent ?? "",
  );
}

async function typeAndEnter(text: string): Promise<void> {
  lastValue = null;
  calls = 0;
  const user = userEvent.setup();
  const input =
    document.querySelector<HTMLInputElement>(".picker-typeahead__input") ??
    document.querySelector<HTMLInputElement>("input");
  if (input) {
    await user.click(input);
    await user.type(input, text);
    await user.keyboard("{Enter}");
  } else {
    const sel = document.querySelector<HTMLSelectElement>("select[aria-label='Value'], select[aria-label='Values']");
    if (!sel) throw new Error("no value control");
    await user.click(sel);
    await user.keyboard(text);
    await user.keyboard("{Enter}");
  }
}

const VARIANT_NOTE = process.env.TASK13_VARIANT ?? "as-is";

async function runCase(
  name: string,
  field: FilterChipField,
  resolve: typeof resourceResolver | undefined,
  operator: string,
): Promise<void> {
  obs(`${VARIANT_NOTE}/${name}/${operator} field`, { type: field.type, options: field.options ?? null, refFolder: field.refFolder ?? null, isFolderField: field.isFolderField ?? false });
  render(<Harness field={field} operator={operator} resolve={resolve} />);
  obs(`${VARIANT_NOTE}/${name}/${operator} valueBox`, describeValueBox());
  if (document.querySelector(".picker-typeahead__input")) {
    obs(`${VARIANT_NOTE}/${name}/${operator} suggestions "a"`, suggestionsAfterTyping("a"));
    obs(`${VARIANT_NOTE}/${name}/${operator} suggestions "e"`, suggestionsAfterTyping("e"));
    obs(`${VARIANT_NOTE}/${name}/${operator} suggestions "alpha"`, suggestionsAfterTyping("alpha"));
    obs(`${VARIANT_NOTE}/${name}/${operator} suggestions "beta"`, suggestionsAfterTyping("beta"));
    fireEvent.change(document.querySelector(".picker-typeahead__input")!, { target: { value: "" } });
  }
  await typeAndEnter("alpha");
  obs(`${VARIANT_NOTE}/${name}/${operator} afterTypeAlphaEnter`, { onValueChangeCalls: calls, value: lastValue });
  // click first suggestion if one is offered (for comparison with Enter)
  cleanup();
  render(<Harness field={field} operator={operator} resolve={resolve} />);
  lastValue = null;
  calls = 0;
  const sugg = suggestionsAfterTyping("alpha");
  const opt = document.querySelector<HTMLElement>("[role='option']");
  if (opt) fireEvent.click(opt);
  obs(`${VARIANT_NOTE}/${name}/${operator} afterTypeAlphaThenClickSuggestion`, { suggestions: sugg, onValueChangeCalls: calls, value: lastValue });
  cleanup();
}

describe("task13 D-19 experiment", () => {
  for (const operator of ["includes", "includes-any-of"]) {
    it(`${VARIANT_NOTE}: A resources resolver (AppShell equivalent) ${operator}`, async () => {
      await runCase("A-resource-resolver", tagsField(), resourceResolver, operator);
    });
    it(`${VARIANT_NOTE}: B tag option source, field unchanged ${operator}`, async () => {
      await runCase("B-tag-resolver", tagsField(), tagResolver, operator);
    });
    it(`${VARIANT_NOTE}: C field options = tag names ${operator}`, async () => {
      await runCase("C-options-tag-names", { ...tagsField(), options: TAGS.map((t) => t.name) }, resourceResolver, operator);
    });
  }
});
