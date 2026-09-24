import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    getWriteParagraphLeading: {
      setParagraphLeading: (value: string) => ReturnType;
      unsetParagraphLeading: () => ReturnType;
    };
  }
}

/**
 * Custom TipTap extension to manage paragraph leading (line height) in the editor. This extension
 * targets line height adjustments within paragraphs (not between paragraphs). It provides a default
 * line height that is overriden when the user changes the line height via the editor menu, or
 * when the user selects content with a different line height, ensuring consistent behavior across the editor.
 *
 * This extension is designed to be used in conjunction with the `LineHeight` extension, and it assumes
 */
const GetWriteParagraphLeading = Extension.create(() => {
  const defaultLineHeight = "1.5";

  return {
    name: "getWriteParagraphLeading",
    addGlobalAttributes() {
      return [
        {
          types: ["paragraph"],
          attributes: {
            paragraphLeading: {
              default: defaultLineHeight,
              parseHTML: (element) => {
                const lineHeight = element.style.lineHeight;
                return lineHeight || defaultLineHeight;
              },
              renderHTML: (attributes) => {
                return { style: `line-height: ${attributes.paragraphLeading}` };
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
          (value: string) =>
          ({ chain }) => {
            return chain()
              .updateAttributes("paragraph", { paragraphLeading: value })
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
