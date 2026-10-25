// Feature 95 (spell checker) Part 0, Task 9 — on-device capture of the spike result.
//
// Bundled by `scripts/build-harness.mjs --spell-spike` into
// `build/spell-spike/persist.bundle.js` and loaded by the spike driver page inside
// the Capacitor WebView. The driver (specs/features/spell-checker/scripts/driver.mjs)
// publishes its JSON block as `window.__spellResult`. This module waits for it and
// writes it to Directory.Data/spell-spike-result.json, readable from the host via
//   adb shell run-as works.saboteur.getwrite.spellspike cat files/spell-spike-result.json
// (same capture route as harness-entry.ts). It imports no application module.
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

declare global {
  interface Window {
    __spellResult?: unknown;
    __spellResultPersisted?: string;
  }
}

const POLL_MS = 1000;
const STATUS_ID = "persist-status";

function show(message: string): void {
  window.__spellResultPersisted = message;
  const el = document.getElementById(STATUS_ID);
  if (el) el.textContent = message;
}

async function persist(result: unknown): Promise<void> {
  try {
    await Filesystem.writeFile({
      path: "spell-spike-result.json",
      data: JSON.stringify(result, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    show("result written to Directory.Data/spell-spike-result.json");
  } catch (err) {
    show(
      `result NOT written: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const timer = window.setInterval(() => {
  if (window.__spellResult === undefined) return;
  window.clearInterval(timer);
  void persist(window.__spellResult);
}, POLL_MS);
