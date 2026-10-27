"use client";

import { useCallback, useEffect } from "react";
import { useDispatch, useStore } from "react-redux";
import type { AppDispatch } from "../store/store";
import { loadUserList } from "../store/userWordListSlice";
import { setUserListApplies } from "../store/spellingAvailabilitySlice";
import {
  SPELLCHECK_CHANGED_EVENT,
  SPELLCHECK_ENABLED_STORAGE_KEY,
  readSpellcheckEnabled,
  resetSpellcheckSessionValue,
} from "../lib/spellcheck-preference";
import { useUserListAvailable } from "./useUserListAvailable";

/**
 * @module useUserListLoading
 *
 * **Feature 96, Task 14 (FR-18, FR-23).** When the user word list is read.
 *
 * - {@link useEnsureUserListLoaded}: the "My dictionary" section calls it on
 *   open; loads once if nothing was loaded yet, regardless of the switch.
 * - {@link useUserListLifecycle}: mounted once at the app root. Loads once
 *   when the spelling switch is on (at startup or when it turns on), and
 *   re-reads when the tab or window becomes visible again, so a change made
 *   in another tab or window is picked up. Nothing is requested while the
 *   switch is off and nothing was loaded, and nothing on a device where the
 *   list is not `available` (paired, or role unknown).
 *
 * The lifecycle also keeps `spellingAvailability.userListApplies` equal to
 * "switch on and list available" (FR-15), so the checker gate reads the list
 * only where it is wanted. It is false on a paired device, while the role is
 * unknown, with the switch off, and after unmount.
 *
 * A re-read that fails leaves the slice `failed` with no words
 * (`userWordListSlice`), never the stale list. A re-read is skipped while a
 * read is already in flight.
 */

type StoreWithUserList = {
  getState: () => { userWordList: { status: string } };
};

/** Returns a function that starts a read only when the status passes `isDue`. */
function useStartRead(isDue: (status: string) => boolean): () => void {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore() as StoreWithUserList;
  return useCallback((): void => {
    // Read the status at call time, so two callers in one commit start one read.
    if (isDue(store.getState().userWordList.status)) {
      void dispatch(loadUserList());
    }
  }, [dispatch, store, isDue]);
}

const isIdle = (status: string): boolean => status === "idle";
const isSettled = (status: string): boolean =>
  status === "loaded" || status === "failed";

/** Loads the list once, if it is available here and not yet requested. */
export function useEnsureUserListLoaded(): void {
  const availability = useUserListAvailable();
  const loadIfIdle = useStartRead(isIdle);
  useEffect(() => {
    if (availability === "available") loadIfIdle();
  }, [availability, loadIfIdle]);
}

/** App-root lifecycle: lazy load on the switch, re-read on visibility. */
export function useUserListLifecycle(): void {
  const availability = useUserListAvailable();
  const loadIfIdle = useStartRead(isIdle);
  const reread = useStartRead(isSettled);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const sync = (): void => {
      dispatch(
        setUserListApplies(
          availability === "available" && readSpellcheckEnabled(),
        ),
      );
    };
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
      dispatch(setUserListApplies(false));
    };
  }, [availability, dispatch]);

  useEffect(() => {
    if (availability !== "available") return;
    // The stored switch is read directly: `useSpellcheckEnabled` reports "on"
    // for its first render, which would load the list with the switch off.
    const loadWhenWanted = (): void => {
      if (readSpellcheckEnabled()) loadIfIdle();
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== SPELLCHECK_ENABLED_STORAGE_KEY) {
        return;
      }
      resetSpellcheckSessionValue();
      loadWhenWanted();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") reread();
    };
    loadWhenWanted();
    window.addEventListener(SPELLCHECK_CHANGED_EVENT, loadWhenWanted);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(SPELLCHECK_CHANGED_EVENT, loadWhenWanted);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [availability, loadIfIdle, reread]);
}
