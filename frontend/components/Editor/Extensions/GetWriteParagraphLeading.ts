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
                                return {
                                    style: `line-height: ${attributes.paragraphLeading}`,
                                };
                            },
                        },
                    },
                },
            ];
        },
        addCommands() {
            return {
                setParagraphLeading:
                    (value: string) =>
                    ({ chain }) => {
                        return chain()
                            .setNode("paragraph", {
                                paragraphLeading: value,
                            })
                            .run();
                    },

                unsetParagraphLeading:
                    () =>
                    ({ chain }) => {
                        return chain()
                            .setNode("paragraph", {
                                paragraphLeading: null,
                            })
                            .run();
                    },
            };
        },
    };
});

export default GetWriteParagraphLeading;
