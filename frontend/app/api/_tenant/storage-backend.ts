// Last Updated: 2026-07-22

/**
 * @module storage-backend
 *
 * The pluggable storage-backend seam for tenant resolution (ADR-019:
 * Object-Store Backend Adapter).
 *
 * `resolveBackendAdapter` is the single authority for *which*
 * {@link StorageAdapter} a request runs against — the sibling of
 * `getIdentitySource()` (which decides *who* the request is) and the second
 * half of the `{ tenantRoot, adapter }` storage context. Until this module
 * existed, `withStorageContext` always bound the process-default filesystem
 * adapter; now the backend is selectable per deployment.
 *
 * Selection is env-gated and read fresh on every call so it can be toggled
 * per-test, mirroring `getIdentitySource()`:
 * - Unset / any value other than `object-store` → the default filesystem
 *   adapter (`getStorageAdapter()`). Desktop/local and today's hosted path are
 *   byte-for-byte unchanged.
 * - `object-store` → an {@link objectStoreAdapter} over a
 *   {@link createFsObjectStore} rooted at `GETWRITE_OBJECT_STORE_ROOT`
 *   (fail-closed if that root is unset, matching `dataRootBase()`).
 *
 * The object-store adapter is process-wide: it holds no per-request state and
 * isolates tenants purely by the key prefix baked into each path
 * (`<GETWRITE_DATA_ROOT>/<userId>/…`), so a single instance is reused across
 * requests. A real S3/R2 client is a later `ObjectStore` implementation swapped
 * in here — a backend change, not an application rewrite.
 */
import {
  getStorageAdapter,
  type StorageAdapter,
} from "../../../src/lib/models/io";
import { objectStoreAdapter } from "../../../src/lib/models/objectStoreAdapter";
import { createFsObjectStore } from "../../../src/lib/models/object-store";

/** Raised when the object-store backend is selected but misconfigured. */
export class StorageBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageBackendError";
  }
}

/** The env value that activates the object-store backend. */
const OBJECT_STORE_BACKEND = "object-store";

/**
 * Process-wide object-store adapter, built lazily on first selection.
 *
 * The backing store holds no per-request state, so one instance serves every
 * tenant (isolated by key prefix). Memoized to avoid rebuilding the store —
 * and re-running its root `mkdir` — on the request hot path.
 */
let cachedObjectStoreAdapter: StorageAdapter | null = null;

/** Tracks the one-time activation warning for the object-store backend. */
let hasWarnedForActivation = false;

/**
 * Test-only hook to clear the memoized object-store adapter and warning latch,
 * so a test toggling `GETWRITE_STORAGE_BACKEND` observes a fresh selection.
 */
export function __resetStorageBackendForTests(): void {
  cachedObjectStoreAdapter = null;
  hasWarnedForActivation = false;
}

/**
 * Reads and validates the object-store root directory (fail-closed).
 *
 * @returns The configured object-store root.
 * @throws {StorageBackendError} When `GETWRITE_OBJECT_STORE_ROOT` is unset/empty.
 */
function objectStoreRoot(): string {
  const root = process.env.GETWRITE_OBJECT_STORE_ROOT;
  if (!root) {
    throw new StorageBackendError(
      "GETWRITE_OBJECT_STORE_ROOT must be set when " +
        "GETWRITE_STORAGE_BACKEND=object-store",
    );
  }
  return root;
}

/**
 * Resolves the {@link StorageAdapter} the current request must run against,
 * per the configured storage backend.
 *
 * @returns The default filesystem adapter, or the object-store adapter when
 *   `GETWRITE_STORAGE_BACKEND=object-store`.
 * @throws {StorageBackendError} When the object-store backend is selected but
 *   `GETWRITE_OBJECT_STORE_ROOT` is unset.
 */
export function resolveBackendAdapter(): StorageAdapter {
  if (process.env.GETWRITE_STORAGE_BACKEND !== OBJECT_STORE_BACKEND) {
    hasWarnedForActivation = false;
    return getStorageAdapter();
  }

  if (!cachedObjectStoreAdapter) {
    cachedObjectStoreAdapter = objectStoreAdapter(
      createFsObjectStore(objectStoreRoot()),
    );
  }

  if (!hasWarnedForActivation) {
    hasWarnedForActivation = true;
    console.warn(
      "[getwrite] GETWRITE_STORAGE_BACKEND=object-store is enabled: model " +
        "data is stored in a flat object store, not the local project tree. " +
        "Directory-rename atomicity is weakened and fs.watch-based backlink " +
        "reindexing does not fire (use on-demand reindex). See ADR-019.",
    );
  }

  return cachedObjectStoreAdapter;
}
