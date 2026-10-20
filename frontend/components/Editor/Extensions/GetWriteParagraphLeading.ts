import { Extension } from "@tiptap/core";
import { readParagraphLeading } from "../../../src/lib/paragraph-leading";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    getWriteParagraphLeading: {
      setParagraphLeading: (value: string | number) => ReturnType;
      unsetParagraphLeading: () => ReturnType;
    };
  }
}

/**
 * Custom TipTap extension to manage paragraph leading (line height) in the editor. This extension
 * targets line height adjustments within paragraphs (not between paragraphs). It provides a default
 * leading that is unset by default (the paragraph follows the project's body line height) and a
 * JSON number once the writer sets one.
 *
 * This extension is designed to be used in conjunction with the `LineHeight` extension, and it assumes
 */
const GetWriteParagraphLeading = Extension.create(() => {
  return {
    name: "getWriteParagraphLeading",
    addGlobalAttributes() {
      return [
        {
          types: ["paragraph"],
          attributes: {
            paragraphLeading: {
              default: null,
              // Pasted inline line-height goes through the same rule as stored
              // documents: the legacy "1.5" stamp and non-numeric values read
              // as unset (FR-18, FR-20).
              parseHTML: (element) =>
                readParagraphLeading(element.style.lineHeight),
              // Stored content is persisted user data: only a finite number
              // greater than 0 is ever interpolated into the style (FR-21).
              renderHTML: (attributes) => {
                const leading = readParagraphLeading(
                  attributes.paragraphLeading,
                );
                return leading === null
                  ? {}
                  : { style: `line-height: ${leading}` };
              },
            },
          },
        },
      ];
    },
    addCommands() {
      return {
        /**
         * Sets the leading on every paragraph the selection spans, leaving
         * every other block untouched.
         *
         * Uses `updateAttributes`, NOT `setNode("paragraph", …)`.
         * `setNode` CONVERTS each selected block to a paragraph, so the
         * previous implementation silently flattened headings, blockquotes
         * and code blocks into body text. `TipTapEditor`'s `onCreate` runs
         * `selectAll().setParagraphLeading("1.5")` across the whole document,
         * so an editor created with structured content lost that structure
         * before the writer saw it — measured 2026-09-23, a story mounted
         * with `<h2>Opening</h2><p>…</p>` rendered as two paragraphs.
         *
         * `paragraphLeading` is registered as a global attribute on
         * `["paragraph"]` alone (above), so a heading has nowhere to store a
         * leading value in the first place; skipping non-paragraphs is the
         * only behaviour the attribute schema supports.
         */
        setParagraphLeading:
          (value: string | number) =>
          ({ chain }) => {
            // A number is stored as-is; a string is read as a number. The
            // legacy "1.5" string is a stored-form rule, not a typed value.
            const leading =
              typeof value === "number"
                ? readParagraphLeading(value)
                : readParagraphLeading(value === "1.5" ? 1.5 : value);
            if (leading === null) return false;
            return chain()
              .updateAttributes("paragraph", { paragraphLeading: leading })
              .run();
          },

        /**
         * Restores the default leading on the paragraphs the selection spans.
         * `resetAttributes` returns the attribute to the extension's declared
         * default rather than writing an explicit `null`, which would render
         * as `line-height: null`.
         */
        unsetParagraphLeading:
          () =>
          ({ chain }) => {
            return chain()
              .resetAttributes("paragraph", "paragraphLeading")
              .run();
          },
      };
    },
  };
});

export default GetWriteParagraphLeading;
