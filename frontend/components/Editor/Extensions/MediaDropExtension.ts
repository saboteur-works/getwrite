import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { validateMediaFile } from "../../../src/lib/models/media-validation";
import { uploadMediaResource } from "../../../src/lib/api/resources";
import { toastService } from "../../../src/lib/toast-service";

export interface MediaDropOptions {
  /** Returns the active project path, or null when no project is open. */
  getProjectPath: () => string | null;
  /** Called with a human-readable message when a file is rejected. */
  onError: (message: string) => void;
}

/**
 * Processes dropped files: validates each one, uploads accepted images, and
 * calls `onInsert` with the resulting resource ID and serving URL. Audio files
 * and other unsupported types are reported via `onError`.
 *
 * Exported separately so it can be unit-tested without a live ProseMirror view.
 */
export async function handleMediaDropFiles(
  files: File[],
  projectPath: string,
  onError: (message: string) => void,
  onInsert: (resourceId: string, src: string) => void,
): Promise<void> {
  for (const file of files) {
    const validation = validateMediaFile({
      mime: file.type || undefined,
      ext: file.name,
      size: file.size,
    });

    if (!validation.ok) {
      onError(validation.message);
      continue;
    }

    if (validation.type !== "image") {
      onError(
        `"${file.name}" is an audio file. Only images can be dropped directly into the editor.`,
      );
      continue;
    }

    try {
      const result = await uploadMediaResource(projectPath, file);
      const resourceId = result.resource.id;
      onInsert(resourceId, `/api/resource/${resourceId}/file`);
    } catch (e) {
      onError(
        `Failed to upload "${file.name}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

/**
 * Resolves the document position closest to the drop coordinates, falling back
 * to the end of the document when the coordinates land outside the editor.
 */
function resolveDropPos(
  view: EditorView,
  clientX: number,
  clientY: number,
): number {
  const resolved = view.posAtCoords({ left: clientX, top: clientY });
  return resolved?.pos ?? view.state.doc.content.size;
}

const MEDIA_DROP_KEY = new PluginKey("mediaDrop");

/**
 * TipTap extension that intercepts external file drops (images only) and
 * uploads each as a new image resource before inserting a `GetWriteImage`
 * node at the drop position.
 *
 * Only handles drops originating outside the editor (`moved === false`).
 * Internal drag-and-drop (node reordering) is passed through unchanged.
 */
const MediaDropExtension = Extension.create<MediaDropOptions>({
  name: "mediaDrop",

  addOptions(): MediaDropOptions {
    return {
      getProjectPath: () => null,
      onError: (message) => toastService.error("Media upload failed", message),
    };
  },

  addProseMirrorPlugins() {
    const { getProjectPath, onError } = this.options;

    return [
      new Plugin({
        key: MEDIA_DROP_KEY,
        props: {
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;

            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return false;

            event.preventDefault();

            const projectPath = getProjectPath();
            if (!projectPath) {
              onError("Cannot insert image: no project is open.");
              return true;
            }

            let pos = resolveDropPos(view, event.clientX, event.clientY);

            handleMediaDropFiles(
              files,
              projectPath,
              onError,
              (resourceId, src) => {
                const imageNodeType = view.state.schema.nodes["image"];
                if (!imageNodeType) return;

                const imageNode = imageNodeType.create({ src, resourceId });
                view.dispatch(view.state.tr.insert(pos, imageNode));
                pos += imageNode.nodeSize;
              },
            );

            return true;
          },
        },
      }),
    ];
  },
});

export default MediaDropExtension;
