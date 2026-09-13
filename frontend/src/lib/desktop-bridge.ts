// Last Updated: 2026-08-06

/**
 * @module desktop-bridge
 *
 * The renderer's view of the Electron desktop bridge.
 *
 * `GETWRITE_DESKTOP` marks the desktop build, but it is a server-side
 * environment variable and so invisible to a client component. The presence of
 * `window.getwriteDesktop` is the client-visible signal, and it is exact: the
 * object exists only because `electron/src/preload.ts` put it there.
 *
 * Everything here degrades to `null`/no-op on web and native, so a caller can
 * ask without first knowing where it is running.
 */

/** What changing the workspace location can result in. */
export interface WorkspaceChangeResult {
  /** Whether the new location was accepted and recorded. */
  ok: boolean;
  /** The chosen directory, when one was accepted. */
  projectsDir?: string;
  /** Why the choice was refused, in words meant for the user. */
  message?: string;
  /** True when the user closed the picker without choosing. */
  cancelled?: boolean;
}

/** What choosing a Scrivener source project can result in. */
export type ScrivenerSourceChoice =
  | { ok: true; handle: string; displayName: string }
  | { ok: false; cancelled: true };

/** A successful import. */
export interface ImportSuccessOutcome {
  readonly kind: "success";
  readonly projectId: string;
  readonly projectRoot: string;
  readonly folderCount: number;
  readonly resourceCount: number;
  readonly tagCount: number;
  readonly report: string;
}

/** The source `.scriv` project was refused as unsupported (FR-2). */
export interface ImportRefusalUnsupportedOutcome {
  readonly kind: "refusal-unsupported";
  readonly message: string;
}

/** The destination project root already exists and is non-empty. */
export interface ImportRefusalDestinationNotEmptyOutcome {
  readonly kind: "refusal-destination-not-empty";
  readonly message: string;
}

/** Any other error raised while importing. */
export interface ImportFatalOutcome {
  readonly kind: "fatal";
  readonly message: string;
}

/**
 * The four-kind discriminated outcome of a Scrivener import (FR-12).
 * Mirrors `electron/src/scrivener-import/handle-import-request.ts`'s
 * `ImportOutcome` byte-for-byte; redeclared here because `frontend` cannot
 * import across the `electron/src` package boundary.
 */
export type ScrivenerImportOutcome =
  | ImportSuccessOutcome
  | ImportRefusalUnsupportedOutcome
  | ImportRefusalDestinationNotEmptyOutcome
  | ImportFatalOutcome;

/** The surface `preload.ts` exposes. Mirrors its `GetWriteDesktopBridge`. */
export interface DesktopBridge {
  getWorkspaceDir(): Promise<string>;
  chooseWorkspaceDir(): Promise<WorkspaceChangeResult>;
  restart(): Promise<void>;
  /** Opens a native picker for a Scrivener `.scriv` source project. */
  chooseScrivenerSource(): Promise<ScrivenerSourceChoice>;
  /** Runs a Scrivener import from a previously chosen source. */
  startScrivenerImport(
    handle: string,
    name: string,
  ): Promise<ScrivenerImportOutcome>;
}

/**
 * Returns the desktop bridge, or `null` when not running in the desktop app.
 *
 * @returns The bridge, or `null` on web and native.
 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as { getwriteDesktop?: DesktopBridge })
    .getwriteDesktop;
  // Duck-typed rather than merely truthy: a half-initialised bridge should read
  // as absent, so the UI hides the control instead of rendering a dead button.
  return candidate && typeof candidate.chooseWorkspaceDir === "function"
    ? candidate
    : null;
}

/**
 * Whether this is the Electron desktop app.
 *
 * @returns `true` when the desktop bridge is present.
 */
export function isDesktopApp(): boolean {
  return getDesktopBridge() !== null;
}
