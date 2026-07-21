import Image from "@tiptap/extension-image";
import type { Attributes } from "@tiptap/core";

interface GetWriteImageAttrs {
  src?: string;
  alt?: string;
  title?: string;
  resourceId?: string | null;
}

export interface GetWriteImageOptions {
  /**
   * Returns the active project's on-disk directory basename (the `projectId`
   * every tenant-scoped resource route, ADR-017/018, expects — see
   * `selectActiveProjectDirectoryId`'s doc comment in `projectsSlice.ts`), or
   * null when no project is open. Threaded in by the editor host
   * (`TipTapEditor`); consumers that only need serialization (e.g. the
   * markdown exporter) leave it at the `() => null` default.
   */
  getProjectId: () => string | null;
}

/** Escape a value for safe inclusion inside a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Resolves the effective `<img>` src for a GetWrite image node at render time.
 *
 * When the node carries a `resourceId` and a project is active, the src is
 * rebuilt from the stable `resourceId` plus the active project's directory id
 * (`resolveProjectsDir()/<projectId>`, ADR-017/018). This lets documents that
 * persisted an older serving URL — notably the pre-ADR-018 `?projectPath=`
 * form the hard-cutover `/api/resource/[resource-id]/file` route now rejects —
 * self-heal on load, with no content migration: the stored `src` attribute is
 * ignored for display whenever it can be reconstructed from stabler inputs.
 *
 * Falls back to the stored `src` when there is no `resourceId` (a plain, non
 * resource-backed image) or no active project (e.g. the markdown exporter,
 * which has no project context and serializes the stored URL as-is).
 */
export function resolveGetWriteImageSrc(
  resourceId: string | null | undefined,
  storedSrc: string | null | undefined,
  projectId: string | null,
): string {
  if (resourceId && projectId) {
    return `/api/resource/${resourceId}/file?projectId=${encodeURIComponent(
      projectId,
    )}`;
  }
  return storedSrc ?? "";
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
 *
 * For display the src is reconstructed from `resourceId` + the active
 * project's directory id (see {@link resolveGetWriteImageSrc}) rather than
 * trusted verbatim, so a persisted-but-stale serving URL self-heals. The
 * stored `src` attribute is left untouched (it round-trips on save); only the
 * rendered DOM attribute is recomputed.
 */
const GetWriteImage = Image.extend<GetWriteImageOptions>({
  addOptions() {
    return { ...this.parent?.(), getProjectId: () => null };
  },

  addAttributes() {
    const getProjectId = this.options.getProjectId;
    const parentAttributes: Attributes = this.parent?.() ?? {};
    return {
      ...parentAttributes,
      resourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-resource-id"),
        renderHTML: (attrs) =>
          attrs.resourceId ? { "data-resource-id": attrs.resourceId } : {},
      },
      src: {
        ...parentAttributes.src,
        renderHTML: (attributes) => {
          const attrs = attributes as GetWriteImageAttrs;
          const src = resolveGetWriteImageSrc(
            attrs.resourceId,
            attrs.src,
            getProjectId?.() ?? null,
          );
          return src ? { src } : {};
        },
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
