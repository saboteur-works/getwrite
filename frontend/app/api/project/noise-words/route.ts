/**
 * @module app/api/project/noise-words/route
 *
 * Transport for a project's two noise-word lists (Entity Mention Noise
 * Flagging, Task 6): `config.customNoiseWords` (FR-3) and
 * `config.excludedGlobalNoiseWords` (FR-6).
 *
 * Routes:
 * - `GET /api/project/noise-words?projectId=` — both lists (defaults `[]`
 *   filled in).
 * - `POST /api/project/noise-words` — body
 *   `{ projectId, action, word }`, where `action` is one of `"add-custom"`,
 *   `"remove-custom"`, `"exclude-global"`, `"unexclude-global"`; `word` is a
 *   non-empty string. Returns the resulting lists. Add/remove are each
 *   idempotent — adding an already-present word, or removing an absent one,
 *   is a no-op, not an error.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  addCustomNoiseWordCore,
  excludeGlobalNoiseWordCore,
  getNoiseWordListsCore,
  InvalidNoiseWordError,
  InvalidProjectIdCoreError,
  removeCustomNoiseWordCore,
  unexcludeGlobalNoiseWordCore,
  type NoiseWordLists,
} from "../../../../src/lib/models/project-noise-words-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

const NOISE_WORD_ACTIONS = [
  "add-custom",
  "remove-custom",
  "exclude-global",
  "unexclude-global",
] as const;
type NoiseWordAction = (typeof NOISE_WORD_ACTIONS)[number];

function isNoiseWordAction(value: unknown): value is NoiseWordAction {
  return (
    typeof value === "string" &&
    (NOISE_WORD_ACTIONS as readonly string[]).includes(value)
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
  if (error instanceof InvalidNoiseWordError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const lists = await getNoiseWordListsCore(params.get("projectId") ?? "");
    return NextResponse.json(lists, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

const ACTION_HANDLERS: Record<
  NoiseWordAction,
  (projectId: string, word: unknown) => Promise<NoiseWordLists>
> = {
  "add-custom": addCustomNoiseWordCore,
  "remove-custom": removeCustomNoiseWordCore,
  "exclude-global": excludeGlobalNoiseWordCore,
  "unexclude-global": unexcludeGlobalNoiseWordCore,
};

async function handlePost(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; action?: unknown; word?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (!isNoiseWordAction(body.action)) {
    return badRequest(
      `action must be one of: ${NOISE_WORD_ACTIONS.join(", ")}.`,
    );
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
