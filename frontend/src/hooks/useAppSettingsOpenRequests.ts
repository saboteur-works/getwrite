"use client";

import { useEffect, useRef } from "react";
import { OPEN_APP_SETTINGS_EVENT } from "../lib/app-settings-open";

/** Calls `onOpen` for every `requestOpenAppSettings()` while mounted. */
export function useAppSettingsOpenRequests(onOpen: () => void): void {
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });
  useEffect(() => {
    const handler = (): void => latest.current();
    window.addEventListener(OPEN_APP_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_APP_SETTINGS_EVENT, handler);
  }, []);
}
