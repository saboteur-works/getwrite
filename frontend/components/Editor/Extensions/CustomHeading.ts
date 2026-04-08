import { mergeAttributes } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import { buildHeadingStyleAttribute } from "../../../src/lib/editor-heading-settings";

type HeadingAttribute = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface CustomHeadingStyle {
    fontSize: string;
    fontFamily: string;
    fontWeight: string;
    letterSpacing: string;
    color: string;
}

interface CustomHeadingOptions {
    levels: number[];
    customStyles: {
        [index in HeadingAttribute]?: Partial<CustomHeadingStyle>;
    };
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        customHeading: {
            setHeadingStyle: (value: number) => ReturnType;
            unsetHeadingStyle: () => ReturnType;
        };
    }
}

declare module "@tiptap/core" {
    interface ExtensionOptions {
        customStyles: CustomHeadingOptions;
    }
}

const CustomHeading = Heading.extend<CustomHeadingOptions>(() => {
    return {
        name: "heading",
        addOptions() {
            return {
                levels: [1, 2, 3, 4, 5, 6],
                customStyles: {
                    h1: {
                        fontSize: "20px",
                        fontFamily: "Inter, sans-serif",
                        fontWeight: "700",
                        letterSpacing: "0.14em",
                        color: "white",
                    },
                    h2: {
                        fontSize: "16px",
                        fontFamily: "Times, serif",
                        fontWeight: "700",
                        letterSpacing: "0.14em",
                        color: "white",
                    },
                    h3: {
                        fontSize: "14px",
                        fontFamily: "Inter, sans-serif",
                        fontWeight: "700",
                        letterSpacing: "0.14em",
                        color: "white",
                    },
                },
            };
        },
        renderHTML({ node, HTMLAttributes }) {
            const customStyles = this.options.customStyles;
            const headingAttr = `h${node.attrs.level}` as HeadingAttribute;
            const style = customStyles[headingAttr];
            if (!style) {
                return ["h1", mergeAttributes(HTMLAttributes), 0];
            }

            const styleAttribute = buildHeadingStyleAttribute(style);

            return [
                headingAttr,
                styleAttribute
                    ? mergeAttributes(HTMLAttributes, {
                          style: styleAttribute,
                      })
                    : mergeAttributes(HTMLAttributes),
                0,
            ];
        },
    };
});

export default CustomHeading;
