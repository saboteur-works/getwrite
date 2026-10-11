/**
 * @module server-launch
 *
 * The order of events at launch (Feature 80, FR-11 b, c), kept out of
 * `main.ts` so it can be tested. Nothing that carries the window secret is
 * installed, and the local origin is not loaded, until the forked server has
 * proved its identity. If it never does, the failure is shown and neither
 * happens.
 */
import { ServerExitedError } from "./server-readiness";

/** What `main.ts` supplies for one window. */
export interface LaunchSteps {
  confirmServer: () => Promise<void>;
  installWindowSecret: () => void;
  loadLocalOrigin: () => void;
  showFailure: (message: string) => void;
}

/** The plain message for a launch that did not get as far as loading. */
export function describeLaunchFailure(error: unknown): string {
  if (error instanceof ServerExitedError) {
    const detail =
      error.code === null ? "no exit code" : `exit code ${error.code}`;
    return `Server stopped before it was ready (${detail})`;
  }
  return `Server failed to start: ${error}`;
}

/** Confirms the server, then installs the window secret, then loads. */
export async function runLaunchSequence(steps: LaunchSteps): Promise<void> {
  try {
    await steps.confirmServer();
    steps.installWindowSecret();
    steps.loadLocalOrigin();
  } catch (error) {
    steps.showFailure(describeLaunchFailure(error));
  }
}

/** Remembers whether, and how, the forked server exited. */
export interface ExitSignal {
  /** Calls `listener` with the exit code, now if the server already exited. */
  watch: (listener: (code: number | null) => void) => void;
  /** Records the exit; only the first call counts. */
  fire: (code: number | null) => void;
}

export function createExitSignal(): ExitSignal {
  const listeners: Array<(code: number | null) => void> = [];
  let exited: { code: number | null } | undefined;
  return {
    watch: (listener) => {
      if (exited) listener(exited.code);
      else listeners.push(listener);
    },
    fire: (code) => {
      if (exited) return;
      exited = { code };
      for (const listener of listeners.splice(0)) listener(code);
    },
  };
}
