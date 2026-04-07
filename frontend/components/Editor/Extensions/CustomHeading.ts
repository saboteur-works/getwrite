import { Extension, mergeAttributes } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        customHeading: {
            setHeadingStyle: (value: number) => ReturnType;
            unsetHeadingStyle: () => ReturnType;
        };
    }
}
const CustomHeading = Heading.extend(() => {
    const styles: Record<
        string,
        {
            fontSize: string;
            fontFamily: string;
            fontWeight: string;
            letterSpacing: string;
        }
    > = {
        h1: {
            fontSize: "20px",
            fontFamily: "Inter, sans-serif",
            fontWeight: "700",
            letterSpacing: "0.14em",
        },
        h2: {
            fontSize: "16px",
            fontFamily: "Times, serif",
            fontWeight: "700",
            letterSpacing: "0.14em",
        },
        h3: {
            fontSize: "14px",
            fontFamily: "Inter, sans-serif",
            fontWeight: "700",
            letterSpacing: "0.14em",
        },
    };
    return {
        name: "heading",
        renderHTML({ node, HTMLAttributes }) {
            const level = node.attrs.level;
            const style = styles[`h${level}`];
            return [
                `h${level}`,
                mergeAttributes(HTMLAttributes, {
                    style: `font-size: ${style.fontSize}; font-family: ${style.fontFamily}; font-weight: ${style.fontWeight}; letter-spacing: ${style.letterSpacing}; color: blue`,
                }),
                0,
            ];
        },
    };
});

export default CustomHeading;
