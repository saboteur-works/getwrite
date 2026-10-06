/**
 * @module api/global-noise-words
 *
 * **Entity Mention Noise Flagging, Task 11.** Client transport collapse for
 * the cross-project "global" custom noise-word list (Tasks 8/9/10): one
 * client-facing API, `getGlobalNoiseWords`/`setGlobalNoiseWords`, that
 * resolves to whichever of three independent, runtime-specific stores is
 * correct for where the app is running, with **no sync or merge logic
 * between them** (FR-15) — each store is read/written on its own, never
 * reconciled with another runtime's.
 *
 * **Why this is a three-way split, not `createTransport`'s usual two-way
 * one.** `createTransport<T>(httpImpl, loadNative)` (`store/transport/
 * create-transport.ts`) branches on exactly one signal:
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`, true only for a Capacitor
 * Android build. The Electron desktop build does **not** set that flag — it
 * loads the same web bundle as the hosted app, inside a `BrowserWindow`, so
 * at that env-var level Electron and plain web are indistinguishable, and
 * both fall into `createTransport`'s "not native" branch alongside each
 * other. Every existing `createTransport` caller in this codebase picks
 * `httpImpl` to mean "web/desktop, same HTTP route" (see
 * `entity-graph-settings.ts`'s doc comment) precisely because every prior
 * feature's desktop behavior **is** its HTTP behavior — Electron spawns and
 * talks to the same Next server web does. This feature is the first
 * `createTransport` caller where that is not true: Tasks 8 and 9 deliberately
 * gave Electron its own, separate, non-HTTP store (`userData/workspace.json`
 * extension, reached only via IPC), so "web/desktop" can no longer share one
 * implementation.
 *
 * The fix is to keep `createTransport`'s own two-way shape untouched and
 * push the second split inside the `httpImpl` object passed to it: each
 * method in `httpGlobalNoiseWordsTransport` checks `getDesktopBridge()`
 * (`desktop-bridge.ts`) **at call time** (a runtime, `window`-presence check,
 * not a build-time env flag) and either delegates to the Electron IPC
 * bridge or falls through to `fetch`. `createTransport`'s own native branch
 * is untouched and still only ever reaches true Capacitor Android storage
 * (`native-global-noise-words-backend.ts` → `lib/models/
 * native-global-noise-words.ts`), dynamically imported and web-stub-aliased
 * exactly like every other native backend. So the three-way split is: (1)
 * `createTransport`'s own native-vs-not branch, decided once per call by the
 * build-time env flag, then (2) a second, runtime `getDesktopBridge()` check
 * folded into the "not native" implementation itself. Nothing here performs
 * a third dynamic import or adds a second `createTransport` layer — one
 * `createTransport` call, with the Electron/web distinction made inside its
 * `httpImpl` argument rather than beside it.
 */
import { createTransport } from "../../store/transport/create-transport";
import { getDesktopBridge } from "../desktop-bridge";
import { GlobalNoiseWordsResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The global-noise-words operations every runtime implements. */
export interface GlobalNoiseWordsTransport {
  /** The full cross-project global noise-word list (`[]` if none saved yet). */
  getGlobalNoiseWords(): Promise<string[]>;
  /**
   * Replaces the cross-project global noise-word list in full.
   *
   * @returns The persisted (trimmed) list.
   */
  setGlobalNoiseWords(words: string[]): Promise<string[]>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/global-noise-words";

/** Fetches `GET /api/global-noise-words` — the plain web/hosted path. */
async function fetchGlobalNoiseWords(): Promise<string[]> {
  const response = await fetch(ENDPOINT);
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `Failed to load the global noise-word list (HTTP ${response.status}).`,
      ),
    );
  }
  const parsed = GlobalNoiseWordsResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    reportTransportValidationFailure(
      "global-noise-words.getGlobalNoiseWords",
      parsed.error.issues,
    );
    throw new Error("The global noise-word list response was malformed.");
  }
  return parsed.data;
}

/** PUTs `/api/global-noise-words` — the plain web/hosted path. */
async function putGlobalNoiseWords(words: string[]): Promise<string[]> {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(words),
  });
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `Failed to save the global noise-word list (HTTP ${response.status}).`,
      ),
    );
  }
  const parsed = GlobalNoiseWordsResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    reportTransportValidationFailure(
      "global-noise-words.setGlobalNoiseWords",
      parsed.error.issues,
    );
    throw new Error("The global noise-word list response was malformed.");
  }
  return parsed.data;
}

/**
 * Web/desktop transport: delegates to the Electron IPC bridge when one is
 * present (`getDesktopBridge()` — a runtime `window` check, true only inside
 * the Electron renderer), otherwise falls through to the HTTP route. This is
 * the `httpImpl` half of the `createTransport` split; see this module's own
 * doc comment above for why the Electron/web distinction lives here rather
 * than as a second `createTransport` layer.
 */
export const httpGlobalNoiseWordsTransport: GlobalNoiseWordsTransport = {
  async getGlobalNoiseWords() {
    const bridge = getDesktopBridge();
    if (bridge) {
      return bridge.getGlobalNoiseWords();
    }
    return fetchGlobalNoiseWords();
  },

  async setGlobalNoiseWords(words) {
    const bridge = getDesktopBridge();
    if (bridge) {
      const result = await bridge.setGlobalNoiseWords(words);
      if (!result.ok) {
        throw new Error(
          result.message ?? "Failed to save the global noise-word list.",
        );
      }
      return words;
    }
    return putGlobalNoiseWords(words);
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-global-noise-words-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveGlobalNoiseWordsTransport: () => Promise<GlobalNoiseWordsTransport> =
  createTransport(httpGlobalNoiseWordsTransport, () =>
    import("../../store/transport/native-global-noise-words-backend").then(
      ({ createNativeGlobalNoiseWordsTransport }) =>
        createNativeGlobalNoiseWordsTransport(),
    ),
  );

/**
 * The full cross-project global noise-word list (`[]` if none saved yet).
 * Resolves to the web/hosted HTTP route, the Electron IPC bridge, or the
 * native Android device file, with no sync/merge between them (FR-15).
 */
export async function getGlobalNoiseWords(): Promise<string[]> {
  const transport = await resolveGlobalNoiseWordsTransport();
  return transport.getGlobalNoiseWords();
}

/**
 * Replaces the cross-project global noise-word list in full, on whichever
 * runtime-specific store is correct for where the app is running.
 *
 * @param words - The full replacement list.
 * @returns The persisted (trimmed) list.
 */
export async function setGlobalNoiseWords(words: string[]): Promise<string[]> {
  const transport = await resolveGlobalNoiseWordsTransport();
  return transport.setGlobalNoiseWords(words);
}
