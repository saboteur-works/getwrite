// Test helper: a Capacitor Filesystem fake that rejects at a chosen piece of a
// chunked write. Pieces are counted per target path: the writeFile of the first
// piece is piece 1, each appendFile after it the next. Reused at core level by
// the add / replace / create failure tests.
import type { CapacitorFilesystemLike } from "../../src/lib/models/capacitor-filesystem";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

export interface FailingCapacitorFsOptions {
  /** 1-based piece number (counted across writeFile + appendFile) that rejects. */
  failAtPiece: number;
  /** Error the failing piece rejects with; thrown as the same instance. */
  error: Error;
  /** When set, deleteFile rejects with this error instead of deleting. */
  deleteError?: Error;
  /** Only writes to this plugin path (normalized, no leading slash) count and fail. */
  targetPath?: string;
}

export interface FailingCapacitorFs {
  fs: CapacitorFilesystemLike;
  /** The underlying in-memory fake, for inspecting what remains. */
  inner: CapacitorFilesystemLike;
  /** Number of deleteFile calls attempted. */
  deleteAttempts: () => number;
}

const normKey = (p: string): string =>
  p.replace(/^\/+/, "").replace(/\/+$/, "");

/** Wraps a fresh (or given) fake so the Nth piece write rejects before storing. */
export function createFailingCapacitorFs(
  opts: FailingCapacitorFsOptions,
  inner: CapacitorFilesystemLike = createFakeCapacitorFilesystem(),
): FailingCapacitorFs {
  let piece = 0;
  let deletes = 0;
  const tick = (path: string): void => {
    if (opts.targetPath !== undefined && normKey(path) !== opts.targetPath) {
      return;
    }
    piece += 1;
    if (piece === opts.failAtPiece) throw opts.error;
  };
  const fs: CapacitorFilesystemLike = {
    ...inner,
    writeFile: async (o) => {
      tick(o.path);
      return inner.writeFile(o);
    },
    appendFile: async (o) => {
      tick(o.path);
      return inner.appendFile(o);
    },
    deleteFile: async (o) => {
      deletes += 1;
      if (opts.deleteError) throw opts.deleteError;
      return inner.deleteFile(o);
    },
  };
  return { fs, inner, deleteAttempts: () => deletes };
}
