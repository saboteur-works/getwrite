/**
 * @module api/project-noise-words
 *
 * Client transport for a project's two noise-word lists (Entity Mention
 * Noise Flagging, Task 6): `config.customNoiseWords` (FR-3) and
 * `config.excludedGlobalNoiseWords` (FR-6). Mirrors
 * `entity-graph-settings.ts`'s GET-read/mutate-and-return pattern: every
 * method REJECTS on a network error, non-2xx status, or malformed body (the
 * malformed body is also reported through `reportTransportValidationFailure`)
 * — a failed read must never silently surface as "no noise words configured",
 * and a mutation's response is never fabricated client-side.
 *
 * HTTP-only for now: this task adds no native (Capacitor/Android) backend,
 * unlike the cross-project global list (Tasks 8-10). Add one as a follow-up
 * if/when native parity is needed for the per-project lists.
 */
import { NoiseWordListsResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** A project's two noise-word lists. */
export interface NoiseWordLists {
  customNoiseWords: string[];
  excludedGlobalNoiseWords: string[];
}

type NoiseWordAction =
  | "add-custom"
  | "remove-custom"
  | "exclude-global"
  | "unexclude-global";

const ENDPOINT = "/api/project/noise-words";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

function parseResponse(callSite: string, body: unknown): NoiseWordLists {
  const parsed = NoiseWordListsResponseSchema.safeParse(body);
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The noise-word lists response was malformed.");
  }
  return parsed.data;
}

async function performAction(
  callSite: string,
  projectId: string,
  action: NoiseWordAction,
  word: string,
): Promise<NoiseWordLists> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, action, word }),
  });
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `Failed to update the project's noise-word lists (HTTP ${response.status}).`,
      ),
    );
  }
  return parseResponse(callSite, await response.json());
}

/**
 * Reads the project's two noise-word lists. Rejects on any failure; never
 * resolves to a fabricated empty default on a failed read.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function getNoiseWordLists(
  projectId: string,
): Promise<NoiseWordLists> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(`${ENDPOINT}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `Failed to load the project's noise-word lists (HTTP ${response.status}).`,
      ),
    );
  }
  return parseResponse(
    "project-noise-words.getNoiseWordLists",
    await response.json(),
  );
}

/** Adds `word` to the project's custom noise-word list (FR-3) if not already present. */
export async function addCustomNoiseWord(
  projectId: string,
  word: string,
): Promise<NoiseWordLists> {
  return performAction(
    "project-noise-words.addCustomNoiseWord",
    projectId,
    "add-custom",
    word,
  );
}

/** Removes `word` from the project's custom noise-word list (FR-3); a no-op if absent. */
export async function removeCustomNoiseWord(
  projectId: string,
  word: string,
): Promise<NoiseWordLists> {
  return performAction(
    "project-noise-words.removeCustomNoiseWord",
    projectId,
    "remove-custom",
    word,
  );
}

/** Excludes `word` from the global noise-word list for this project (FR-6) if not already excluded. */
export async function excludeGlobalNoiseWord(
  projectId: string,
  word: string,
): Promise<NoiseWordLists> {
  return performAction(
    "project-noise-words.excludeGlobalNoiseWord",
    projectId,
    "exclude-global",
    word,
  );
}

/** Un-excludes `word`, restoring it to this project's effective global noise-word set (FR-6). */
export async function unexcludeGlobalNoiseWord(
  projectId: string,
  word: string,
): Promise<NoiseWordLists> {
  return performAction(
    "project-noise-words.unexcludeGlobalNoiseWord",
    projectId,
    "unexclude-global",
    word,
  );
}
