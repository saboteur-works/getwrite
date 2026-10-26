/**
 * @module api/project-spelling
 *
 * Client transport for a project's two spelling word lists (spell-checker
 * FR-15): `config.spellingProjectWords` ("Add to project dictionary") and
 * `config.spellingIgnoredWords` ("Ignore"). Mirrors
 * `entity-graph-settings.ts`: an interface, an exported HTTP implementation,
 * and thin public functions that resolve the implementation per call.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): every method
 * REJECTS on a network error, a non-2xx status or a malformed body (the
 * malformed body is also reported through
 * `reportTransportValidationFailure`). A failed read never resolves to empty
 * lists: empty lists mean the project has no words, and a failure is not
 * that. A mutation's result is never fabricated client-side.
 *
 * The native (Capacitor) build runs the same core in-process via
 * `native-project-spelling-backend.ts`, selected by `createTransport`.
 */
import type { SpellingLists } from "../models/project-spelling-core";
import { SpellingListsResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";
import { createTransport } from "../../store/transport/create-transport";

export type { SpellingLists };

/** The spelling-list operations every platform implements. */
export interface ProjectSpellingTransport {
  /** Both lists, defaults filled in. */
  getSpellingLists(projectId: string): Promise<SpellingLists>;
  /** Adds `word` to the project dictionary; idempotent. Returns the lists. */
  addSpellingWord(projectId: string, word: string): Promise<SpellingLists>;
  /** Removes `word` from the project dictionary; idempotent. */
  removeSpellingWord(projectId: string, word: string): Promise<SpellingLists>;
  /** Adds `word` to the ignore list; idempotent. */
  ignoreSpellingWord(projectId: string, word: string): Promise<SpellingLists>;
  /** Removes `word` from the ignore list; idempotent. */
  unignoreSpellingWord(projectId: string, word: string): Promise<SpellingLists>;
}

type SpellingAction =
  | "add-word"
  | "remove-word"
  | "ignore-word"
  | "unignore-word";

const ENDPOINT = "/api/project/spelling";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function parseResponse(
  callSite: string,
  response: Response,
  failureMessage: string,
): Promise<SpellingLists> {
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `${failureMessage} (HTTP ${response.status}).`,
      ),
    );
  }
  const parsed = SpellingListsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The spelling lists response was malformed.");
  }
  return parsed.data;
}

async function performAction(
  callSite: string,
  projectId: string,
  action: SpellingAction,
  word: string,
): Promise<SpellingLists> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, action, word }),
  });
  return parseResponse(
    callSite,
    response,
    "Failed to update the project's spelling lists",
  );
}

/** HTTP transport: the hosted/desktop path. */
const httpProjectSpellingTransport: ProjectSpellingTransport = {
  async getSpellingLists(projectId) {
    const query = new URLSearchParams({ projectId });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    return parseResponse(
      "project-spelling.getSpellingLists",
      response,
      "Failed to load the project's spelling lists",
    );
  },
  addSpellingWord: (projectId, word) =>
    performAction(
      "project-spelling.addSpellingWord",
      projectId,
      "add-word",
      word,
    ),
  removeSpellingWord: (projectId, word) =>
    performAction(
      "project-spelling.removeSpellingWord",
      projectId,
      "remove-word",
      word,
    ),
  ignoreSpellingWord: (projectId, word) =>
    performAction(
      "project-spelling.ignoreSpellingWord",
      projectId,
      "ignore-word",
      word,
    ),
  unignoreSpellingWord: (projectId, word) =>
    performAction(
      "project-spelling.unignoreSpellingWord",
      projectId,
      "unignore-word",
      word,
    ),
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-project-spelling-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveProjectSpellingTransport: () => Promise<ProjectSpellingTransport> =
  createTransport(httpProjectSpellingTransport, () =>
    import("../../store/transport/native-project-spelling-backend").then(
      ({ createNativeProjectSpellingTransport }) =>
        createNativeProjectSpellingTransport(),
    ),
  );

/**
 * Both spelling lists for a project. Rejects on any failure; never resolves
 * to empty lists on a failed read.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function getSpellingLists(
  projectId: string,
): Promise<SpellingLists> {
  return (await resolveProjectSpellingTransport()).getSpellingLists(projectId);
}

/** Adds `word` to the project dictionary. Rejects on any failure. */
export async function addSpellingWord(
  projectId: string,
  word: string,
): Promise<SpellingLists> {
  return (await resolveProjectSpellingTransport()).addSpellingWord(
    projectId,
    word,
  );
}

/** Removes `word` from the project dictionary. Rejects on any failure. */
export async function removeSpellingWord(
  projectId: string,
  word: string,
): Promise<SpellingLists> {
  return (await resolveProjectSpellingTransport()).removeSpellingWord(
    projectId,
    word,
  );
}

/** Adds `word` to the project's ignore list. Rejects on any failure. */
export async function ignoreSpellingWord(
  projectId: string,
  word: string,
): Promise<SpellingLists> {
  return (await resolveProjectSpellingTransport()).ignoreSpellingWord(
    projectId,
    word,
  );
}

/** Removes `word` from the project's ignore list. Rejects on any failure. */
export async function unignoreSpellingWord(
  projectId: string,
  word: string,
): Promise<SpellingLists> {
  return (await resolveProjectSpellingTransport()).unignoreSpellingWord(
    projectId,
    word,
  );
}
