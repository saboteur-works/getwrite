"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readSpellcheckEnabled,
  resetSpellcheckSessionValue,
  SPELLCHECK_CHANGED_EVENT,
  SPELLCHECK_ENABLED_STORAGE_KEY,
  writeSpellcheckEnabled,
} from "../lib/spellcheck-preference";

/**
 * Reads and sets the app-wide spell-check switch.
 *
 * The first render returns `true` (the default) on server and client alike;
 * the stored value is read in an effect, so there is no hydration mismatch.
 * Updates from this window (event) and other tabs (`storage`) are followed.
 *
 * @returns `[enabled, setEnabled]`.
 */
export function useSpellcheckEnabled(): [boolean, (enabled: boolean) => void] {
  const [isEnabled, setEnabledState] = useState<boolean>(true);

  useEffect(() => {
    const sync = (): void => setEnabledState(readSpellcheckEnabled());
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== SPELLCHECK_ENABLED_STORAGE_KEY) {
        return;
      }
      resetSpellcheckSessionValue();
      sync();
    };
    sync();
    window.addEventListener(SPELLCHECK_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SPELLCHECK_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setEnabled = useCallback((shouldEnable: boolean): void => {
    writeSpellcheckEnabled(shouldEnable);
  }, []);

  return [isEnabled, setEnabled];
}
