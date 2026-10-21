import { useSyncExternalStore } from "react";
import type { DialogueHighlightSettings } from "./Extensions/DialogueHighlightExtension";

/**
 * @module dialogue-highlight-store
 *
 * The dialogue highlight's settings for this window only: kept in memory,
 * never saved, so they reset when the app reloads (owner decision). The
 * sidebar's Prose Diagnostics section writes them; `TipTapEditor.tsx` reads
 * them through `getDialogueHighlightSettings` and re-signals its plugin on
 * every change. They survive switching resources within the window.
 */

const DEFAULT_SETTINGS: DialogueHighlightSettings = {
  isEnabled: false,
  quoteStyle: "double",
};

let settings: DialogueHighlightSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

/** The current settings. */
export function getDialogueHighlightSettings(): DialogueHighlightSettings {
  return settings;
}

/** Changes some settings and notifies every subscriber. */
export function setDialogueHighlightSettings(
  changes: Partial<DialogueHighlightSettings>,
): void {
  settings = { ...settings, ...changes };
  listeners.forEach((listener) => listener());
}

/** Subscribes to changes; returns the unsubscribe function. */
export function subscribeDialogueHighlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Restores the defaults. For tests. */
export function resetDialogueHighlightSettings(): void {
  setDialogueHighlightSettings(DEFAULT_SETTINGS);
}

/** React binding: re-renders when the settings change. */
export function useDialogueHighlightSettings(): DialogueHighlightSettings {
  return useSyncExternalStore(
    subscribeDialogueHighlight,
    getDialogueHighlightSettings,
    () => DEFAULT_SETTINGS,
  );
}
