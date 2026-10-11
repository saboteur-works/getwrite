import { NextResponse } from "next/server";

import {
  READINESS_KEY_ENV,
  computeReadinessProof,
  isValidChallenge,
} from "../../../../src/lib/readiness/readiness-proof";

/**
 * GET /api/sharing/ready?challenge=<64 hex> (Feature 80, FR-10, FR-11)
 *
 * Lets the Electron main process confirm that the server answering on the
 * port is the one it forked. Returns the HMAC of the caller's own challenge
 * under a per-launch key held only in this process's environment; the key is
 * never returned. It reads no header, cookie, store or
 * project, so what it returns cannot depend on who asks. Without the key
 * (every non-desktop deployment) it is a 404.
 *
 * The gate lets this one GET through unclassified because the poll happens
 * before the desktop sends its per-launch secrets to anything; see `gate.ts`.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function GET(request: Request): NextResponse {
  const key = process.env[READINESS_KEY_ENV];
  if (key === undefined || key === "") {
    return NextResponse.json(
      { error: "not-available" },
      { status: 404, headers: NO_STORE },
    );
  }
  const challenge = new URL(request.url).searchParams.get("challenge");
  if (challenge === null || !isValidChallenge(challenge)) {
    return NextResponse.json(
      { error: "invalid-challenge" },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { proof: computeReadinessProof(key, challenge) },
    { headers: NO_STORE },
  );
}
