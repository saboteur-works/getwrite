import Image from "@tiptap/extension-image";

interface GetWriteImageAttrs {
  src?: string;
  alt?: string;
  title?: string;
  resourceId?: string | null;
}

/** Escape a value for safe inclusion inside a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    getWriteImage: {
      /** Insert an image resource by src URL and optional resource ID. */
      insertGetWriteImage: (options: {
        src: string;
        resourceId?: string;
        alt?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Extends TipTap's Image node with a `resourceId` attribute that links the
 * node back to a GetWrite image resource. The src URL points at the file-
 * serving route (`/api/resource/<id>/file`) and is stored directly in
 * content.tiptap.json so the image loads on reload without base64 embedding.
 */
const GetWriteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-resource-id"),
        renderHTML: (attrs) =>
          attrs.resourceId ? { "data-resource-id": attrs.resourceId } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertGetWriteImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs: options });
        },
    };
  },

  /**
   * Serialize to Markdown, preserving the GetWrite `resourceId` link. Standard
   * Markdown image syntax (`![alt](src)`) has nowhere to carry `resourceId`, so
   * when one is present we fall back to an inline HTML `<img>` that round-trips
   * it via the `data-resource-id` attribute (parsed back by the `resourceId`
   * attribute's `parseHTML`). Plain images keep clean Markdown.
   */
  renderMarkdown(node: { attrs?: GetWriteImageAttrs }) {
    const attrs = node.attrs ?? {};
    const src = attrs.src ?? "";
    const alt = attrs.alt ?? "";
    const title = attrs.title ?? "";

    if (attrs.resourceId) {
      const htmlAttrs = [
        `src="${escapeHtmlAttr(src)}"`,
        alt ? `alt="${escapeHtmlAttr(alt)}"` : "",
        title ? `title="${escapeHtmlAttr(title)}"` : "",
        `data-resource-id="${escapeHtmlAttr(attrs.resourceId)}"`,
      ]
        .filter(Boolean)
        .join(" ");
      return `<img ${htmlAttrs}>`;
    }

    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },
});

export default GetWriteImage;
