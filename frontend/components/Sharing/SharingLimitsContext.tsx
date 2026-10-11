"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isPairingPage } from "./pairing-page";
import { getDesktopBridge } from "../../src/lib/desktop-bridge";
import {
  fetchSharingLimits,
  type SharingLimitsAnswer,
} from "../../src/store/sharing-limits-transport-service";

/**
 * @module SharingLimitsContext
 *
 * The paired browser's one shared copy of the answer from
 * `GET /api/sharing/limits` (Feature 77, FR-20, OQ-13). Several unrelated
 * components (Start page, Trash, revisions, encryption settings, the app page)
 * need the same read, so it is held once in a provider mounted in the root
 * layout rather than fetched per consumer.
 *
 * State is `unknown` (not yet read, pending, or the read failed), `exempt`,
 * or `paired` with the limits. A failed read never becomes `exempt`.
 *
 * Re-reads: on mount, on `visibilitychange` to visible, on window `focus`,
 * on `refresh()` (callers invoke it after a refusal carrying a `limit`, when
 * the unlock prompt opens and at submit), and a 5 s poll that exists only
 * while a consumer has declared the unlock prompt mounted and is skipped
 * while the document is hidden. A re-read narrows, but cannot close, the
 * window in which a stale "allowed" answer is still on screen.
 *
 * On the pairing page no read is made by any of these paths: the device is not
 * paired, every read would be refused, and the refusal there must not loop.
 * State stays `unknown`.
 */

type SharingLimitsState = { state: "unknown" } | SharingLimitsAnswer;

interface SharingLimitsContextValue {
  state: SharingLimitsState;
  /** True when the Electron preload bridge is present; known without the read. */
  hasDesktopBridge: boolean;
  /** Re-reads now and resolves to the resulting state. Never rejects. */
  refresh: () => Promise<SharingLimitsState>;
  /** Registers an open unlock prompt (and reads once); returns the unregister function. */
  registerUnlockPrompt: () => () => void;
}

const POLL_INTERVAL_MS = 5000;
const UNKNOWN: SharingLimitsState = { state: "unknown" };

const SharingLimitsContext = createContext<SharingLimitsContextValue | null>(
  null,
);

/**
 * Reads the shared limits state. Throws outside {@link SharingLimitsProvider},
 * mirroring `TrashRefreshContext.tsx`'s `useTrashRefresh`.
 */
export function useSharingLimits(): SharingLimitsContextValue {
  const value = useContext(SharingLimitsContext);
  if (!value) {
    throw new Error(
      "useSharingLimits must be used within a SharingLimitsProvider",
    );
  }
  return value;
}

/** Declares, while `active`, that an unlock prompt is mounted, which turns the 5 s poll on. */
export function useDeclareUnlockPromptMounted(active: boolean): void {
  const { registerUnlockPrompt } = useSharingLimits();
  useEffect(() => {
    if (!active) return undefined;
    return registerUnlockPrompt();
  }, [active, registerUnlockPrompt]);
}

export default function SharingLimitsProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [state, setState] = useState<SharingLimitsState>(UNKNOWN);
  const [hasDesktopBridge, setHasDesktopBridge] = useState(false);
  const [promptCount, setPromptCount] = useState(0);
  const latestRequest = useRef(0);
  const current = useRef<SharingLimitsState>(UNKNOWN);

  const refresh = useCallback(async (): Promise<SharingLimitsState> => {
    if (isPairingPage()) return current.current;
    const requestId = ++latestRequest.current;
    let next: SharingLimitsState;
    try {
      next = await fetchSharingLimits();
    } catch {
      next = UNKNOWN;
    }
    // A newer request was issued meanwhile: this answer is stale.
    if (requestId !== latestRequest.current) return current.current;
    current.current = next;
    setState(next);
    return next;
  }, []);

  const registerUnlockPrompt = useCallback((): (() => void) => {
    setPromptCount((n) => n + 1);
    void refresh();
    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      setPromptCount((n) => n - 1);
    };
  }, [refresh]);

  useEffect(() => {
    setHasDesktopBridge(getDesktopBridge() !== null);
    void refresh();
    const onVisibility = (): void => {
      if (!document.hidden) void refresh();
    };
    const onFocus = (): void => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (promptCount <= 0) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [promptCount, refresh]);

  const value = useMemo<SharingLimitsContextValue>(
    () => ({ state, hasDesktopBridge, refresh, registerUnlockPrompt }),
    [state, hasDesktopBridge, refresh, registerUnlockPrompt],
  );

  return (
    <SharingLimitsContext.Provider value={value}>
      {children}
    </SharingLimitsContext.Provider>
  );
}
