/**
 * @module store/transport/shared-content-reader
 *
 * Feature 107 (FR-7, FR-11): reads a shared image's bytes from its
 * `content://` URI, after the writer has chosen a project, enforcing the
 * 30 MB share cap. Read only: nothing is written to storage and no staging
 * copy is made.
 *
 * The repository's filesystem wrapper is fixed to `Directory.Data`, so this
 * module calls `@capacitor/filesystem` directly, with no `directory`
 * parameter, through a dynamic `import()` (never a static import, see
 * `tests/unit/capacitor-filesystem-real.test.ts`). It is native-only. Tests
 * inject a fake {@link SharedContentFilesystem}.
 *
 * Size handling:
 * - a reported size above the cap is refused with no read call;
 * - a usable reported size within the cap is read with one `readFile`; if
 *   the bytes delivered still exceed the cap the item is refused;
 * - an unknown size is read in chunks and counted; the read stops with a
 *   refusal once the count passes the cap, retaining at most the cap plus one
 *   chunk. The plugin has no cancel, so the native side may keep reading; only
 *   what this module retains is bounded.
 *
 * Whether the real WebView reads `content://` and whether the grant holds is
 * verified only on a device.
 */
import {
  decideShareImageSize,
  SHARE_IMAGE_MAX_BYTES,
  shareImageRefusalMessage,
} from "../../lib/models/share-item-core";
import { mediaTooLargeToShowMessage } from "../../lib/models/media-validation";
import type { ShareImageItem } from "../../lib/api/share-capture-types";

/** Size of each chunk of a counted read, in bytes. */
export const SHARED_READ_CHUNK_BYTES: number = 1024 * 1024;

/** One chunk delivered by `readFileInChunks`; base64, empty at end of file. */
interface ChunkResult {
  data: string | Blob;
}

/**
 * The subset of the `@capacitor/filesystem` plugin this module uses. It has
 * no write methods and no `directory` option by construction.
 */
export interface SharedContentFilesystem {
  readFile: (options: { path: string }) => Promise<{ data: string | Blob }>;
  readFileInChunks: (
    options: { path: string; chunkSize: number },
    callback: (chunk: ChunkResult | null, err?: unknown) => void,
  ) => Promise<string>;
}

/** Outcome of reading one shared image. */
export type SharedImageReadResult =
  | { status: "read"; bytes: Uint8Array }
  | { status: "refused"; message: string }
  | { status: "failed"; message: string };

/** The failure text; the cause is deliberately not interpreted. */
const READ_FAILED_MESSAGE =
  "The shared image could not be read. Nothing was saved for it.";

function failed(): SharedImageReadResult {
  return { status: "failed", message: READ_FAILED_MESSAGE };
}

/** Decodes base64 to bytes; throws on a non-string or malformed payload. */
function decodeBase64(data: string | Blob): Uint8Array {
  if (typeof data !== "string") {
    throw new Error("Unexpected non-string file data");
  }
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Loads the real plugin through a dynamic import; native only. */
async function loadRealFilesystem(): Promise<SharedContentFilesystem> {
  const { Filesystem } = await import("@capacitor/filesystem");
  return Filesystem as unknown as SharedContentFilesystem;
}

/** Wraps decoded bytes: empty is a failure, never an empty image. */
function toResult(bytes: Uint8Array): SharedImageReadResult {
  if (bytes.length === 0) return failed();
  if (bytes.length > SHARE_IMAGE_MAX_BYTES) {
    return {
      status: "refused",
      message: mediaTooLargeToShowMessage(bytes.length),
    };
  }
  return { status: "read", bytes };
}

async function readWhole(
  fs: SharedContentFilesystem,
  uri: string,
): Promise<SharedImageReadResult> {
  try {
    const { data } = await fs.readFile({ path: uri });
    return toResult(decodeBase64(data));
  } catch {
    return failed();
  }
}

/** Reads in chunks, counting; refuses once the count passes the cap. */
function readCounted(
  fs: SharedContentFilesystem,
  uri: string,
): Promise<SharedImageReadResult> {
  return new Promise<SharedImageReadResult>((resolve) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let isSettled = false;
    const settle = (result: SharedImageReadResult): void => {
      if (isSettled) return;
      isSettled = true;
      chunks.length = 0;
      resolve(result);
    };
    const finish = (): void => {
      if (isSettled) return;
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      settle(toResult(bytes));
    };
    const onChunk = (chunk: ChunkResult | null, err?: unknown): void => {
      if (isSettled) return;
      if (err !== undefined && err !== null) return settle(failed());
      if (chunk === null || chunk.data === "") return finish();
      try {
        const bytes = decodeBase64(chunk.data);
        total += bytes.length;
        if (total > SHARE_IMAGE_MAX_BYTES) {
          return settle({
            status: "refused",
            message: shareImageRefusalMessage(),
          });
        }
        chunks.push(bytes);
      } catch {
        settle(failed());
      }
    };
    fs.readFileInChunks(
      { path: uri, chunkSize: SHARED_READ_CHUNK_BYTES },
      onChunk,
    ).then(
      () => undefined,
      () => settle(failed()),
    );
  });
}

/**
 * Reads one shared image's bytes from its `content://` URI.
 *
 * @param item - The shared image; its `size`, if present, is the provider's.
 * @param fs - Filesystem to read through; omit in production to use the
 *   real plugin.
 * @returns `read` with the bytes, `refused` over the cap (nothing read when
 *   the reported size is over), or `failed` for any read error, an
 *   unreadable or revoked URI and an empty result. Never throws for a read.
 */
export async function readSharedImage(
  item: ShareImageItem,
  fs?: SharedContentFilesystem,
): Promise<SharedImageReadResult> {
  const decision = decideShareImageSize(item.size);
  if (decision.outcome === "refuse") {
    return { status: "refused", message: decision.message };
  }
  let plugin: SharedContentFilesystem;
  try {
    plugin = fs ?? (await loadRealFilesystem());
  } catch {
    return failed();
  }
  return decision.outcome === "accept"
    ? readWhole(plugin, item.uri)
    : readCounted(plugin, item.uri);
}
