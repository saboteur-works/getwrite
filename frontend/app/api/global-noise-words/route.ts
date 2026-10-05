/**
 * @module app/api/global-noise-words/route
 *
 * Transport for the web/hosted cross-project global noise-word list (Entity
 * Mention Noise Flagging, FR-5a / Task 8).
 *
 * Routes:
 * - `GET /api/global-noise-words` — returns the full list as a bare JSON
 *   array of strings (`[]` when none has ever been saved for this tenant).
 * - `PUT /api/global-noise-words` — body is a bare JSON array of strings
 *   (the full replacement list); returns the persisted (trimmed) list.
 *
 * No `projectId` is accepted or needed — this is explicitly cross-project
 * (FR-5) — so there is nothing here resembling `project-path.ts`'s
 * client-supplied-id validation. The tenant root itself is resolved by
 * `withStorageContext` (never from anything the client sends), matching
 * every other tenant-scoped route.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  InvalidGlobalNoiseWordsError,
  readGlobalNoiseWords,
  writeGlobalNoiseWords,
} from "../../../src/lib/models/global-noise-words";
import { withStorageContext } from "../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function handleGet(): Promise<Response> {
  // Locked-access errors cannot occur here — this file has no project id in
  // its path, so it is never routed through project-level encryption — but
  // nothing here catches one defensively; any unexpected throw propagates to
  // `withStorageContext` like every other route.
  const words = await readGlobalNoiseWords();
  return NextResponse.json(words, { status: 200 });
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  try {
    const saved = await writeGlobalNoiseWords(body);
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidGlobalNoiseWordsError) {
      return badRequest(error.message);
    }
    throw error;
  }
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
