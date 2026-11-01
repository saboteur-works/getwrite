/**
 * Holds a window's close until the page has finished its saves.
 *
 * A save waiting out the editor's autosave delay was lost when the window
 * closed or the app quit: the page started the request as it went, and nothing
 * waited for the request to finish (specs/features/window-close-save.md).
 *
 * No `electron` import, so the decision is testable.
 */

/** A `BrowserWindow` "close" event, reduced to what the guard uses. */
export interface CloseEvent {
  preventDefault(): void;
}

export interface CloseGuardDeps {
  /** Asks the page to finish its saves; resolves `true` when they all landed. */
  flush(): Promise<boolean>;
  /** True when the window isn't showing the app's own working page. */
  shouldSkipFlush(): boolean;
  /** How long to wait for the page before treating the saves as failed. */
  timeoutMs: number;
  /** Tells the writer the saves failed; resolves `true` for "Close Anyway". */
  confirmCloseAnyway(): Promise<boolean>;
  /** Carries out the close or quit that was held. */
  proceed(): void;
  /** The writer chose to stay; forgets any quit that was held. */
  onKeepEditing(): void;
  log(message: string): void;
}

export interface CloseGuard {
  /** Handler for the window's "close" event. */
  onClose(event: CloseEvent): void;
}

function flushWithinLimit(
  flush: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    flush()
      .then(resolve, () => resolve(false))
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Builds the guard for one window.
 *
 * @param deps - See {@link CloseGuardDeps}.
 * @returns The guard; attach `onClose` to the window's "close" event.
 */
export function createCloseGuard(deps: CloseGuardDeps): CloseGuard {
  let isCleared = false;
  let isFlushing = false;

  const flushThenProceed = async (): Promise<void> => {
    const saved = await flushWithinLimit(deps.flush, deps.timeoutMs);
    if (!saved) {
      deps.log("window close: the page's saves failed or did not finish");
      const closeAnyway = await deps.confirmCloseAnyway();
      if (!closeAnyway) {
        isFlushing = false;
        deps.onKeepEditing();
        return;
      }
    }
    isCleared = true;
    isFlushing = false;
    deps.proceed();
  };

  return {
    onClose(event) {
      if (isCleared || deps.shouldSkipFlush()) return;
      event.preventDefault();
      if (isFlushing) return;
      isFlushing = true;
      void flushThenProceed();
    },
  };
}
