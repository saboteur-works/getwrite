/**
 * @module app/api/project/spelling/route
 *
 * Transport for a project's two spelling word lists (spell-checker FR-14):
 * `config.spellingProjectWords` ("Add to project dictionary") and
 * `config.spellingIgnoredWords` ("Ignore").
 *
 * Routes:
 * - `GET /api/project/spelling?projectId=` — both lists (defaults `[]`
 *   filled in).
 * - `POST /api/project/spelling` — body `{ projectId, action, word }`, where
 *   `action` is one of `"add-word"`, `"remove-word"`, `"ignore-word"`,
 *   `"unignore-word"` and `word` is a string. Returns the resulting lists.
 *   Every action is idempotent. A word the core rejects, or a 5,001st word,
 *   answers 400 and changes nothing.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. There is no paired-device
 * branch: a word-list write is not one of the five paired-device limits.
 * Locked-access errors are rethrown for `withStorageContext` to map to
 * 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  addSpellingWordCore,
  getSpellingListsCore,
  ignoreSpellingWordCore,
  InvalidProjectIdCoreError,
  InvalidSpellingWordError,
  removeSpellingWordCore,
  SpellingListFullError,
  unignoreSpellingWordCore,
  type SpellingLists,
} from "../../../../src/lib/models/project-spelling-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

const SPELLING_ACTIONS = [
  "add-word",
  "remove-word",
  "ignore-word",
  "unignore-word",
] as const;
type SpellingAction = (typeof SPELLING_ACTIONS)[number];

function isSpellingAction(value: unknown): value is SpellingAction {
  return (
    typeof value === "string" &&
    (SPELLING_ACTIONS as readonly string[]).includes(value)
  );
}

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof InvalidSpellingWordError ||
    error instanceof SpellingListFullError
  ) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const lists = await getSpellingListsCore(params.get("projectId") ?? "");
    return NextResponse.json(lists, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

const ACTION_HANDLERS: Record<
  SpellingAction,
  (projectId: string, word: unknown) => Promise<SpellingLists>
> = {
  "add-word": addSpellingWordCore,
  "remove-word": removeSpellingWordCore,
  "ignore-word": ignoreSpellingWordCore,
  "unignore-word": unignoreSpellingWordCore,
};

async function handlePost(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; action?: unknown; word?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (body === null || typeof body !== "object") {
    return badRequest("Invalid JSON body.");
  }
  if (!isSpellingAction(body.action)) {
    return badRequest(`action must be one of: ${SPELLING_ACTIONS.join(", ")}.`);
  }
  try {
    const result = await ACTION_HANDLERS[body.action](
      typeof body.projectId === "string" ? body.projectId : "",
      body.word,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
