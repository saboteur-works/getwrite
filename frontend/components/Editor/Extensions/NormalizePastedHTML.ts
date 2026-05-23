const HEADING_SELECTORS = "h1, h2, h3, h4, h5, h6";
const HEADING_STYLE_PROPERTIES = [
  "font-size",
  "font-family",
  "font-weight",
  "letter-spacing",
  "color",
] as const;

const TABLE_ELEMENT_ATTRS = ["bgcolor", "width", "height", "valign", "align"];

function stripHeadingStyles(doc: Document): void {
  doc.querySelectorAll(HEADING_SELECTORS).forEach((el) => {
    const htmlEl = el as HTMLElement;
    HEADING_STYLE_PROPERTIES.forEach((prop) =>
      htmlEl.style.removeProperty(prop),
    );
    if (!htmlEl.style.cssText.trim()) {
      htmlEl.removeAttribute("style");
    }
  });
}

function normalizeInlineStyles(
  doc: Document,
  bodyFontSize: string | undefined,
): void {
  doc.querySelectorAll("[style]").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.removeProperty("color");
    htmlEl.style.removeProperty("font-family");
    htmlEl.style.removeProperty("background-color");

    if (bodyFontSize) {
      if (htmlEl.style.getPropertyValue("font-size")) {
        htmlEl.style.setProperty("font-size", bodyFontSize);
      }
    } else {
      htmlEl.style.removeProperty("font-size");
    }

    if (!htmlEl.style.cssText.trim()) {
      htmlEl.removeAttribute("style");
    }
  });
}

function stripTableAttributes(doc: Document): void {
  doc.querySelectorAll("table, tr, td, th").forEach((el) => {
    const htmlEl = el as HTMLElement;
    TABLE_ELEMENT_ATTRS.forEach((attr) => htmlEl.removeAttribute(attr));
  });

  // Remove all inline styles from cells — GetWrite CSS controls their
  // appearance entirely; nothing from external sources should be preserved.
  doc.querySelectorAll("td, th").forEach((el) => {
    el.removeAttribute("style");
  });
}

export function normalizePastedHTML(
  html: string,
  bodyFontSize?: string,
): string {
  if (html.includes("data-pm-slice")) {
    return html;
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    stripHeadingStyles(doc);
    normalizeInlineStyles(doc, bodyFontSize);
    stripTableAttributes(doc);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}
