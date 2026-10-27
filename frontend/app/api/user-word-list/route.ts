/**
 * @module app/api/user-word-list/route
 *
 * Transport for the web/hosted cross-project user word list (Feature 96,
 * FR-1, FR-12, FR-19).
 *
 * - `GET /api/user-word-list` returns the list as a bare JSON array.
 * - `POST /api/user-word-list` body `{ "word": string }` adds one word and
 *   returns the persisted list.
 * - `DELETE /api/user-word-list` body `{ "word": string }` removes one word
 *   and returns the persisted list.
 *
 * Every method is refused with HTTP 403 `{ error, limit }` for a paired or
 * unclassified caller before the store is touched (`checkUserWordListAccess`).
 * A rejected word is 400 `{ error, reason }`, a full list 409; a corrupt
 * stored file is 500 `{ error, reason }`, never an empty list. The storage
 * root comes only from `withStorageContext`; nothing in the request names a
 * path.
 */
import { NextResponse } from "next/server";
import { checkUserWordListAccess } from "../../../src/lib/sharing/limits-check";
import {
  UserWordListFormatError,
  addUserWord,
  readUserWords,
  removeUserWord,
} from "../../../src/lib/models/user-word-list";
import { UserWordListError } from "../../../src/lib/models/user-word-list-core";
import { withStorageContext } from "../_tenant/with-storage-context";

function errorResponse(
  message: string,
  status: number,
  reason: string,
): Response {
  return NextResponse.json({ error: message, reason }, { status });
}

/** Maps the store's known failures; anything else propagates. */
function toErrorResponse(error: unknown): Response {
  if (error instanceof UserWordListError) {
    return errorResponse(
      error.message,
      error.reason === "list-full" ? 409 : 400,
      error.reason,
    );
  }
  if (error instanceof UserWordListFormatError) {
    return errorResponse(error.message, 500, "corrupt");
  }
  throw error;
}

async function readWord(
  request: Request,
): Promise<{ word: unknown } | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body.", 400, "invalid-body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(
      'Body must be { "word": string }.',
      400,
      "invalid-body",
    );
  }
  return { word: (body as Record<string, unknown>).word };
}

async function handleGet(request: Request): Promise<Response> {
  const refused = checkUserWordListAccess(request);
  if (refused) return refused;
  try {
    return NextResponse.json(await readUserWords(), { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function mutation(
  apply: (word: unknown) => Promise<string[]>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const refused = checkUserWordListAccess(request);
    if (refused) return refused;
    const parsed = await readWord(request);
    if (parsed instanceof Response) return parsed;
    try {
      return NextResponse.json(await apply(parsed.word), { status: 200 });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(mutation(addUserWord));
export const DELETE = withStorageContext(mutation(removeUserWord));

export const dynamic = "force-dynamic";
