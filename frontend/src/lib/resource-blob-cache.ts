/**
 * @module resource-blob-cache
 *
 * Per-resource, ref-counted cache of media blob URLs (Feature 105, FR-4,
 * FR-11). Reads each distinct (project, resource) once, shares the resulting
 * state with every holder, and revokes the blob URL when the last holder
 * releases it. Framework-free: usable from a TipTap node view and from React.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): a rejected read
 * ends in a refused, locked or failed state, never in loading or an empty
 * URL. A failure is cached for current holders only; once every holder has
 * released, the next acquire reads again.
 *
 * Two bounds keep a node from staying on loading (Feature 105, Task 17):
 * a read that has not settled after `readTimeoutMs` ends in the failed state
 * (a late result is dropped), and a read still in flight when its last holder
 * releases stays in the cache, so a holder that acquires the same resource
 * meanwhile joins it instead of starting a second read. When that read
 * settles with no holder, the entry is dropped and no URL is created.
 */
import { readResourceBytes } from "./api/resource-bytes";
import type { ResourceBytes } from "./api/resource-bytes";
import {
  RESOURCE_FAILED_STATE,
  resourceErrorState,
  type ResourceObjectUrlState,
} from "./resource-object-url-state";

/** Injectable platform seams; the defaults are the real ones. */
export interface ResourceBlobCacheDeps {
  read(projectId: string, resourceId: string): Promise<ResourceBytes>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  /** Longest a read may stay unsettled before it counts as failed. */
  readTimeoutMs?: number;
}

/** Default bound on one read; far above the measured device read times. */
export const DEFAULT_READ_TIMEOUT_MS = 60_000;

/** One holder's view of a cache entry. */
export interface ResourceBlobHolder {
  /** The entry's current state (shared by all holders of the resource). */
  getState(): ResourceObjectUrlState;
  /** Idempotent. After the last holder releases, the blob URL is revoked. */
  release(): void;
}

export interface ResourceBlobCache {
  /**
   * Takes a reference on one resource, starting its read if no holder has.
   * `onChange` is called on each later state change (loading to a final
   * state), never synchronously and never after `release`.
   */
  acquire(
    projectId: string,
    resourceId: string,
    onChange?: (state: ResourceObjectUrlState) => void,
  ): ResourceBlobHolder;
}

interface Entry {
  state: ResourceObjectUrlState;
  listeners: Set<(state: ResourceObjectUrlState) => void>;
  url: string | null;
}

const defaultDeps: ResourceBlobCacheDeps = {
  read: (projectId, resourceId) => readResourceBytes(projectId, resourceId),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

/** Builds the state for a resolved read, creating the URL only when usable. */
function readyState(
  result: ResourceBytes,
  deps: ResourceBlobCacheDeps,
): { state: ResourceObjectUrlState; url: string | null } {
  if (result.bytes.byteLength === 0) {
    return { state: RESOURCE_FAILED_STATE, url: null };
  }
  try {
    const url = deps.createObjectUrl(
      new Blob([result.bytes as BlobPart], { type: result.mime }),
    );
    return { state: { status: "ready", url, kind: result.kind }, url };
  } catch {
    return { state: RESOURCE_FAILED_STATE, url: null };
  }
}

/** Creates a cache. Tests pass fakes; app code uses {@link resourceBlobCache}. */
export function createResourceBlobCache(
  deps: ResourceBlobCacheDeps = defaultDeps,
): ResourceBlobCache {
  const entries = new Map<string, Entry>();

  function settle(entry: Entry, state: ResourceObjectUrlState): void {
    entry.state = state;
    for (const listener of [...entry.listeners]) listener(state);
  }

  function startRead(key: string, entry: Entry, p: string, r: string): void {
    let isSettled = false;
    const finish = (compute: () => ResourceObjectUrlState): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      if (entries.get(key) !== entry) return;
      if (entry.listeners.size === 0) {
        entries.delete(key);
        return;
      }
      settle(entry, compute());
    };
    const timer = setTimeout(
      () => finish(() => RESOURCE_FAILED_STATE),
      deps.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS,
    );
    deps.read(p, r).then(
      (result) =>
        finish(() => {
          const built = readyState(result, deps);
          entry.url = built.url;
          return built.state;
        }),
      (error: unknown) => finish(() => resourceErrorState(error)),
    );
  }

  return {
    acquire(projectId, resourceId, onChange) {
      const key = JSON.stringify([projectId, resourceId]);
      let entry = entries.get(key);
      if (entry === undefined) {
        entry = {
          state: { status: "loading" },
          listeners: new Set(),
          url: null,
        };
        entries.set(key, entry);
        startRead(key, entry, projectId, resourceId);
      }
      const held = entry;
      const listener = onChange ?? (() => undefined);
      held.listeners.add(listener);
      let isReleased = false;
      return {
        getState: () => held.state,
        release() {
          if (isReleased) return;
          isReleased = true;
          held.listeners.delete(listener);
          if (held.listeners.size > 0) return;
          // A read still in flight stays so a later holder can join it.
          if (held.state.status === "loading") return;
          entries.delete(key);
          if (held.url !== null) deps.revokeObjectUrl(held.url);
          held.url = null;
        },
      };
    },
  };
}

/** The app-wide cache: one read per resource across editor and picker. */
export const resourceBlobCache: ResourceBlobCache = createResourceBlobCache();
