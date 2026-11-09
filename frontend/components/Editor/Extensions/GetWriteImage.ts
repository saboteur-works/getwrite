import Image, { type ImageOptions } from "@tiptap/extension-image";
import type { Attributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import {
  resourceBlobCache,
  type ResourceBlobCache,
  type ResourceBlobHolder,
} from "../../../src/lib/resource-blob-cache";
import { observeNearViewport } from "../../../src/lib/near-viewport";
import {
  RESOURCE_FAILED_STATE,
  type ResourceObjectUrlState,
} from "../../../src/lib/resource-object-url-state";
import { createMediaPlaceholder } from "./media-placeholder";

interface GetWriteImageAttrs {
  src?: string;
  alt?: string;
  title?: string;
  resourceId?: string | null;
}

interface GetWriteImageOptions extends Partial<ImageOptions> {
  /**
   * Returns the active project's on-disk directory basename (the `projectId`
   * every tenant-scoped resource route, ADR-017/018, expects — see
   * `selectActiveProjectDirectoryId`'s doc comment in `projectsSlice.ts`), or
   * null when no project is open. Threaded in by the editor host
   * (`TipTapEditor`); consumers that only need serialization (e.g. the
   * markdown exporter) leave it at the `() => null` default.
   */
  getProjectId: () => string | null;
  /**
   * The shared blob cache the native node view reads through (Feature 105).
   * Defaults to the app-wide singleton; tests inject a cache over fake reads.
   */
  blobCache: ResourceBlobCache;
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

/** Node view for one image on native: placeholder, then the blob URL. */
class NativeImageNodeView implements NodeView {
  readonly dom: HTMLElement;
  private readonly img: HTMLImageElement;
  private resourceId: string | null = null;
  private holder: ResourceBlobHolder | null = null;
  private releaseViewport: (() => void) | null = null;
  private isDestroyed = false;

  constructor(
    node: ProseMirrorNode,
    private readonly cache: ResourceBlobCache,
    private readonly getProjectId: () => string | null,
    private readonly htmlAttributes: Record<string, unknown>,
    inline: boolean,
  ) {
    this.dom = document.createElement(inline ? "span" : "div");
    this.img = document.createElement("img");
    this.img.addEventListener("error", () => {
      if (this.holder !== null) this.show(RESOURCE_FAILED_STATE);
    });
    this.applyNode(node);
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== "image") return false;
    if (this.isDestroyed) return false;
    const attrs = node.attrs as GetWriteImageAttrs;
    if ((attrs.resourceId ?? null) !== this.resourceId) {
      this.stop();
      this.applyNode(node);
      return true;
    }
    this.applyImgAttributes(node);
    return true;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stop();
  }

  private applyNode(node: ProseMirrorNode): void {
    const attrs = node.attrs as GetWriteImageAttrs;
    const projectId = this.getProjectId();
    this.resourceId = attrs.resourceId ?? null;
    this.applyImgAttributes(node);
    if (this.resourceId === null || projectId === null) {
      // Not resource-backed (or no project): display the stored src as the
      // web renderer does; nothing is read.
      this.img.src = resolveGetWriteImageSrc(
        this.resourceId,
        attrs.src,
        projectId,
      );
      this.dom.replaceChildren(this.img);
      return;
    }
    this.dom.replaceChildren(createMediaPlaceholder());
    const resourceId = this.resourceId;
    this.releaseViewport = observeNearViewport(this.dom, () => {
      if (this.isDestroyed || this.resourceId !== resourceId) return;
      this.holder = this.cache.acquire(projectId, resourceId, (state) =>
        this.show(state),
      );
      this.show(this.holder.getState());
    });
  }

  private applyImgAttributes(node: ProseMirrorNode): void {
    const attrs = node.attrs as GetWriteImageAttrs;
    for (const [name, value] of Object.entries(this.htmlAttributes)) {
      if (typeof value === "string") this.img.setAttribute(name, value);
    }
    if (this.resourceId !== null) {
      this.img.setAttribute("data-resource-id", this.resourceId);
    } else {
      this.img.removeAttribute("data-resource-id");
    }
    for (const name of ["alt", "title"] as const) {
      const value = attrs[name];
      if (value) this.img.setAttribute(name, value);
      else this.img.removeAttribute(name);
    }
  }

  private show(state: ResourceObjectUrlState): void {
    if (this.isDestroyed) return;
    if (state.status === "loading") {
      this.dom.replaceChildren(createMediaPlaceholder());
    } else if (state.status === "ready") {
      this.img.src = state.url;
      this.dom.replaceChildren(this.img);
    } else {
      this.img.removeAttribute("src");
      this.dom.replaceChildren(createMediaPlaceholder(state.message));
    }
  }

  /** Releases the viewport watch and the cache entry (revokes the URL). */
  private stop(): void {
    this.releaseViewport?.();
    this.releaseViewport = null;
    this.holder?.release();
    this.holder = null;
    this.img.removeAttribute("src");
  }
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
    return {
      ...this.parent?.(),
      getProjectId: () => null,
      blobCache: resourceBlobCache,
    };
  },

  /**
   * Native only: a node view that reads the file in process (the WebView
   * cannot fetch `/api/...`). Web returns null, so `renderHTML` and
   * `resolveGetWriteImageSrc` apply unchanged. The blob URL lives only on the
   * rendered `img.src`; the stored `src` attribute is never touched.
   */
  addNodeView() {
    if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME !== "native") return null;
    const { blobCache, getProjectId } = this.options;
    const htmlAttributes = this.options.HTMLAttributes ?? {};
    const isInline = this.options.inline === true;
    return ({ node }) =>
      new NativeImageNodeView(
        node,
        blobCache,
        getProjectId,
        htmlAttributes,
        isInline,
      );
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
