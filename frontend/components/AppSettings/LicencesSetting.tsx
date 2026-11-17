"use client";

import React from "react";

/** Where the full licence texts are bundled, shown as text and never fetched. */
export const CITATIONS_LICENCES_FILE = "licences/citations-licences.txt";

interface LicenceEntry {
  id: string;
  name: string;
  lines: readonly string[];
}

/**
 * Attributions recorded in `specs/features/citations-at-compile/experiments/
 * task-2.md` and accepted by the owner in `task-9.md`. Plain text only: the
 * CSL project's address is not a link, and nothing is requested at run time.
 */
const ENTRIES: readonly LicenceEntry[] = [
  {
    id: "engine",
    name: "Hayagriva 0.10.1 (citation engine)",
    lines: [
      "Compiled to WebAssembly and used unmodified, under the Apache-2.0 licence. Hayagriva is by the Typst project (typst/hayagriva).",
      "Its Apache-2.0 licence text and its NOTICE are included in the bundled licence texts.",
    ],
  },
  {
    id: "style",
    name: "Chicago Manual of Style 18th edition (notes and bibliography)",
    lines: [
      "A Citation Style Language (CSL) style by Andrew Dunning, licensed under Creative Commons Attribution-ShareAlike 3.0. Used unmodified, with its author metadata kept.",
      "Citation styles come from the CSL project: https://citationstyles.org/",
    ],
  },
  {
    id: "locale",
    name: "CSL locale en-US",
    lines: [
      "Translators: Andrew Dunning, Sebastian Karcher, Rintze M. Zelle, Denis Meier and Brenton M. Wiernik. Licensed under Creative Commons Attribution-ShareAlike 3.0. Used unmodified, with the translator list kept.",
      "Locale files come from the CSL project: https://citationstyles.org/",
    ],
  },
];

/**
 * App Settings "Licences" entry (Feature 116, Task 46): the citation engine,
 * the bundled style and the bundled locale with their attributions. Static
 * text; the full licence texts ship in `public/licences/citations-licences.txt`.
 * Needs no Redux store or context.
 */
export default function LicencesSetting(): JSX.Element {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h3 id={headingId} className="text-sm font-semibold text-gw-primary">
        Licences
      </h3>
      <p className="text-sm text-gw-secondary">
        Citations in a compile use the software and style files below. The full
        licence texts are bundled with the app in {CITATIONS_LICENCES_FILE}.
      </p>
      <ul className="flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <li
            key={entry.id}
            className="rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
          >
            <p className="text-sm font-semibold text-gw-primary">
              {entry.name}
            </p>
            {entry.lines.map((line) => (
              <p key={line} className="mt-1 text-sm text-gw-secondary">
                {line}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
