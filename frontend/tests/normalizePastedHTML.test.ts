import { describe, expect, it } from "vitest";
import { normalizePastedHTML } from "../components/Editor/Extensions/NormalizePastedHTML";

describe("normalizePastedHTML", () => {
    // FR5 — internal paste exemption
    describe("internal paste (data-pm-slice)", () => {
        it("returns HTML unchanged when data-pm-slice is present", () => {
            const input = `<meta data-pm-slice="1 1 []"><span style="font-family: Arial; font-size: 24px; color: red">hello</span>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("font-family");
            expect(result).toContain("font-size");
            expect(result).toContain("color");
        });

        it("still normalizes when data-pm-slice is absent", () => {
            const input = `<span style="font-family: Arial">hello</span>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-family");
        });
    });

    // FR1 — font-family stripping
    describe("font-family (FR1)", () => {
        it("removes font-family from inline styles", () => {
            const input = `<p style="font-family: Arial, sans-serif">hello</p>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-family");
            expect(result).toContain("hello");
        });

        it("preserves other style properties when stripping font-family", () => {
            const input = `<span style="font-family: Georgia; font-weight: bold">text</span>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-family");
            expect(result).toContain("font-weight");
            expect(result).toContain("bold");
        });

        it("removes the style attribute entirely when font-family was the only property", () => {
            const input = `<span style="font-family: Arial">text</span>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("style=");
        });
    });

    // FR2 — font-size normalization
    describe("font-size (FR2)", () => {
        it("replaces font-size with bodyFontSize when provided", () => {
            const input = `<p style="font-size: 24px">hello</p>`;
            const result = normalizePastedHTML(input, "16px");
            expect(result).toContain("font-size: 16px");
            expect(result).not.toContain("24px");
        });

        it("strips font-size when bodyFontSize is not provided", () => {
            const input = `<p style="font-size: 24px">hello</p>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-size");
        });

        it("strips font-size when bodyFontSize is undefined", () => {
            const input = `<p style="font-size: 18px">hello</p>`;
            const result = normalizePastedHTML(input, undefined);
            expect(result).not.toContain("font-size");
        });

        it("preserves other style properties when normalizing font-size", () => {
            const input = `<span style="font-size: 20px; font-style: italic">text</span>`;
            const result = normalizePastedHTML(input, "16px");
            expect(result).toContain("font-size: 16px");
            expect(result).toContain("font-style");
            expect(result).toContain("italic");
        });
    });

    // FR3 — background-color stripping
    describe("background-color (FR3)", () => {
        it("removes background-color from inline styles", () => {
            const input = `<span style="background-color: yellow">hello</span>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("background-color");
            expect(result).toContain("hello");
        });

        it("preserves other style properties when stripping background-color", () => {
            const input = `<span style="background-color: blue; font-weight: bold">text</span>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("background-color");
            expect(result).toContain("font-weight");
            expect(result).toContain("bold");
        });
    });

    // FR4 — heading-specific inline style stripping
    describe("heading inline styles (FR4)", () => {
        it("removes font-size from h1 style attribute", () => {
            const input = `<h1 style="font-size: 48px">Title</h1>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-size");
            expect(result).toContain("Title");
        });

        it("removes font-family from heading style attributes", () => {
            const input = `<h2 style="font-family: Georgia">Section</h2>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-family");
        });

        it("removes font-weight from heading style attributes", () => {
            const input = `<h3 style="font-weight: 900">Sub</h3>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-weight");
        });

        it("removes letter-spacing from heading style attributes", () => {
            const input = `<h4 style="letter-spacing: 0.2em">Sub</h4>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("letter-spacing");
        });

        it("removes color from heading style attributes", () => {
            const input = `<h5 style="color: #333">Sub</h5>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("color");
        });

        it("strips heading styles from all six heading levels", () => {
            const input = [1, 2, 3, 4, 5, 6]
                .map(
                    (n) =>
                        `<h${n} style="font-size: 24px; color: red">H${n}</h${n}>`,
                )
                .join("");
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-size");
            expect(result).not.toContain("color");
        });

        it("preserves non-targeted style properties on headings", () => {
            const input = `<h1 style="font-size: 48px; text-align: center">Title</h1>`;
            const result = normalizePastedHTML(input);
            expect(result).not.toContain("font-size");
            expect(result).toContain("text-align");
            expect(result).toContain("center");
        });
    });

    // FR6 — structural content preservation
    describe("structural content preservation (FR6)", () => {
        it("preserves bold markup", () => {
            const input = `<p><strong>bold text</strong></p>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("strong");
            expect(result).toContain("bold text");
        });

        it("preserves italic markup", () => {
            const input = `<p><em>italic text</em></p>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("em");
            expect(result).toContain("italic text");
        });

        it("preserves links", () => {
            const input = `<p><a href="https://example.com">link</a></p>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("a");
            expect(result).toContain("href");
            expect(result).toContain("link");
        });

        it("preserves ordered lists", () => {
            const input = `<ol><li>item one</li><li>item two</li></ol>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("ol");
            expect(result).toContain("li");
            expect(result).toContain("item one");
        });

        it("preserves unordered lists", () => {
            const input = `<ul><li>bullet</li></ul>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("ul");
            expect(result).toContain("bullet");
        });

        it("preserves blockquotes", () => {
            const input = `<blockquote><p>quoted</p></blockquote>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("blockquote");
            expect(result).toContain("quoted");
        });

        it("preserves code blocks", () => {
            const input = `<pre><code>const x = 1;</code></pre>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("pre");
            expect(result).toContain("code");
            expect(result).toContain("const x = 1;");
        });
    });

    // combined / edge cases
    describe("combined normalization", () => {
        it("strips font-family, font-size, and background-color in one pass", () => {
            const input = `<span style="font-family: Arial; font-size: 20px; background-color: yellow; font-weight: bold">text</span>`;
            const result = normalizePastedHTML(input, "16px");
            expect(result).not.toContain("font-family");
            expect(result).not.toContain("20px");
            expect(result).not.toContain("background-color");
            expect(result).toContain("font-size: 16px");
            expect(result).toContain("font-weight");
        });

        it("returns plain text unchanged when no style attributes are present", () => {
            const input = `<p>plain text</p>`;
            const result = normalizePastedHTML(input);
            expect(result).toContain("plain text");
        });

        it("handles empty string input without throwing", () => {
            expect(() => normalizePastedHTML("")).not.toThrow();
        });
    });
});
