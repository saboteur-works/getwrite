"use client";

import React from "react";
import Input, { type InputProps } from "../common/UI/Input/Input";
import { FONT_OPTIONS } from "../../src/lib/fonts/fonts";

const WEB_SAFE_FONTS: readonly string[] = [
  "Arial",
  "Courier New",
  "Garamond",
  "Georgia",
  "Helvetica",
  "Palatino",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

const appImportedFonts = FONT_OPTIONS.map((f) => f.label);

export const FONT_FAMILY_SUGGESTIONS: readonly string[] = [
  ...new Set([...appImportedFonts, ...WEB_SAFE_FONTS]),
];

export default function FontFamilyInput(props: InputProps): JSX.Element {
  const listId = React.useId();

  return (
    <>
      <Input {...props} list={listId} />
      <datalist id={listId}>
        {FONT_FAMILY_SUGGESTIONS.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>
    </>
  );
}
