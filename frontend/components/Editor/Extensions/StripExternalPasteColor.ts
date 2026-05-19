import { Extension } from "@tiptap/core";

export function stripExternalColor(html: string): string {
    if (html.includes("data-pm-slice")) {
        return html;
    }

    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("[style]").forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.removeProperty("color");
            if (!htmlEl.style.cssText.trim()) {
                htmlEl.removeAttribute("style");
            }
        });
        return doc.body.innerHTML;
    } catch {
        return html;
    }
}

const StripExternalPasteColor = Extension.create({
    name: "stripExternalPasteColor",
    transformPastedHTML(html) {
        return stripExternalColor(html);
    },
});

export default StripExternalPasteColor;
