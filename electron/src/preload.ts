/**
 * @module preload
 *
 * The desktop bridge exposed to the renderer.
 *
 * This file was deliberately empty until the workspace-location setting needed
 * a native directory picker, which the web app cannot open for itself. It stays
 * as small as that requirement allows: three named channels, no general-purpose
 * `invoke` passthrough, and nothing that touches the filesystem directly. A
 * bridge that can be asked to do anything is a bridge that can be asked to do
 * something regrettable by whatever ends up running in the renderer.
 *
 * `window.getwriteDesktop` existing is also how the UI knows it is running in
 * the desktop app at all — the previous signal, `GETWRITE_DESKTOP`, is
 * server-side only and invisible to a client component.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { ImportOutcome } from "./scrivener-import/handle-import-request";
import type { ImportOutcome as DocxImportOutcomeType } from "./docx-import/handle-import-request";

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

/** The four-kind discriminated outcome of a Scrivener import (FR-12). */
export type ScrivenerImportOutcome = ImportOutcome;

/** What choosing a DOCX source (file or folder) can result in (FR-10). */
export type DocxSourceChoice =
  | { ok: true; handle: string; displayName: string }
  | { ok: false; cancelled: true };

/** Options accepted alongside a previously chosen DOCX source handle (FR-10). */
export interface StartDocxImportOptions {
  name: string;
  splitLevel?: number | "none";
  projectType: string;
}

/** The five-kind discriminated outcome of a DOCX import (FR-17). */
export type DocxImportOutcome = DocxImportOutcomeType;

/** The surface the renderer may call. */
export interface GetWriteDesktopBridge {
  /** Returns where projects are currently stored. */
  getWorkspaceDir(): Promise<string>;
  /** Opens a native folder picker and records the choice. */
  chooseWorkspaceDir(): Promise<WorkspaceChangeResult>;
  /** Restarts the app so the change takes effect. */
  restart(): Promise<void>;
  /** Opens a native picker for a Scrivener `.scriv` source project. */
  chooseScrivenerSource(): Promise<ScrivenerSourceChoice>;
  /** Runs a Scrivener import from a previously chosen source. */
  startScrivenerImport(
    handle: string,
    name: string,
  ): Promise<ScrivenerImportOutcome>;
  /** Opens a native picker for a single `.docx` file source (FR-10). */
  chooseDocxFile(): Promise<DocxSourceChoice>;
  /** Opens a native picker for a folder of `.docx` files (FR-10). */
  chooseDocxFolder(): Promise<DocxSourceChoice>;
  /** Runs a DOCX import from a previously chosen source. */
  startDocxImport(
    handle: string,
    options: StartDocxImportOptions,
  ): Promise<DocxImportOutcome>;
}

const bridge: GetWriteDesktopBridge = {
  getWorkspaceDir: () => ipcRenderer.invoke("getwrite:workspace-dir"),
  chooseWorkspaceDir: () => ipcRenderer.invoke("getwrite:choose-workspace-dir"),
  restart: () => ipcRenderer.invoke("getwrite:restart"),
  chooseScrivenerSource: () =>
    ipcRenderer.invoke("getwrite:scrivener-choose-source"),
  startScrivenerImport: (handle: string, name: string) =>
    ipcRenderer.invoke("getwrite:scrivener-start-import", { handle, name }),
  chooseDocxFile: () => ipcRenderer.invoke("getwrite:docx-choose-file"),
  chooseDocxFolder: () => ipcRenderer.invoke("getwrite:docx-choose-folder"),
  startDocxImport: (handle: string, options: StartDocxImportOptions) =>
    ipcRenderer.invoke("getwrite:docx-start-import", {
      handle,
      name: options.name,
      splitLevel: options.splitLevel,
      projectType: options.projectType,
    }),
};

contextBridge.exposeInMainWorld("getwriteDesktop", bridge);
