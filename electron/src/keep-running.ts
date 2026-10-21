/**
 * Whether GetWrite quits when its last window closes, and the IPC handlers
 * for the App Settings switch that changes it.
 *
 * By default closing the window quits on every platform. On macOS the writer
 * can choose to keep the app running (for example so home-network sharing
 * keeps serving paired devices); the Dock icon then reopens the window and
 * Cmd+Q quits. Windows and Linux always quit: with no window there would be
 * nothing on screen to reopen or quit the app from, until a tray icon exists.
 *
 * No `electron` import, so the decision and the handlers are testable.
 */
import {
  readKeepRunningWhenWindowClosed,
  writeKeepRunningWhenWindowClosed,
} from "./projects-dir";

/**
 * Decides whether to quit when the last window has closed.
 *
 * @param platform - `process.platform`.
 * @param keepRunning - The recorded keep-running setting.
 * @returns `false` only on macOS with the setting on.
 */
export function shouldQuitWhenAllWindowsClosed(
  platform: NodeJS.Platform,
  keepRunning: boolean,
): boolean {
  return !(platform === "darwin" && keepRunning);
}

/** What the renderer is told about the setting. */
export interface KeepRunningSetting {
  /** Whether this platform offers the setting (macOS only). */
  supported: boolean;
  /** The recorded setting; always `false` where unsupported. */
  enabled: boolean;
}

interface KeepRunningHandlerDeps {
  /** Directory holding `workspace.json`; used exactly as given. */
  userDataDir: string;
  /** `process.platform`. */
  platform: NodeJS.Platform;
  /** True only for a sender URL on the local origin (`navigation-guard.ts`). */
  isTrustedSender: (url: string | null | undefined) => boolean;
}

/** The part of an IPC event the sender check reads. */
interface KeepRunningSenderEvent {
  senderFrame?: { url?: string | null } | null;
}

interface KeepRunningHandlers {
  get(event: KeepRunningSenderEvent): KeepRunningSetting;
  set(event: KeepRunningSenderEvent, enabled: unknown): void;
}

/**
 * Builds the get and set handlers for the keep-running setting.
 *
 * @param deps - Directory, platform and sender check.
 * @returns The two handlers, each checking the sender first.
 */
export function createKeepRunningHandlers(
  deps: KeepRunningHandlerDeps,
): KeepRunningHandlers {
  const supported = deps.platform === "darwin";
  const assertTrusted = (event: KeepRunningSenderEvent): void => {
    if (!deps.isTrustedSender(event.senderFrame?.url)) {
      throw new Error("Refused: untrusted sender");
    }
  };
  return {
    get(event) {
      assertTrusted(event);
      return {
        supported,
        enabled: supported && readKeepRunningWhenWindowClosed(deps.userDataDir),
      };
    },
    set(event, enabled) {
      assertTrusted(event);
      if (typeof enabled !== "boolean") {
        throw new Error("Keep-running setting must be true or false");
      }
      writeKeepRunningWhenWindowClosed(deps.userDataDir, enabled);
    },
  };
}
