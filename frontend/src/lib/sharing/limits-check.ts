/**
 * The one shared check enforcing routes call (Feature 77, FR-10, FR-13, FR-16).
 * `decideLimit` is a pure decision over the forwarded classification header
 * and parsed limits. `checkLimit` reads the header, reads the limits file only
 * for a paired device (fresh on every call), and returns null (allowed) or a
 * ready refusal. Fails closed: a missing, unparseable or non-confirmed
 * classification is treated as a paired device, and an unreadable file means
 * every limit is on (`readLimits`).
 */
import { NextResponse } from "next/server";

import { CLASSIFICATION_HEADER, parseClassification } from "./classify-request";
import { LIMIT_REFUSAL_MESSAGES } from "./limits-copy";
import { readLimits, type LimitKey, type Limits } from "./limits-store";

type LimitDecision = "allowed" | "refused";

/** True when the header value names the desktop window or sharing off. */
function isExempt(headerValue: string | null): boolean {
  const kind = parseClassification(headerValue)?.kind;
  return kind === "off" || kind === "window";
}

export function decideLimit(
  headerValue: string | null,
  limits: Limits,
  key: LimitKey,
): LimitDecision {
  if (isExempt(headerValue)) return "allowed";
  return limits[key] ? "refused" : "allowed";
}

/** HTTP 403 `{ error, limit }`; never the gate's 401, no gate header. */
export function refusalFor(key: LimitKey): NextResponse {
  return NextResponse.json(
    { error: LIMIT_REFUSAL_MESSAGES[key], limit: key },
    { status: 403 },
  );
}

/** Null when allowed; otherwise the refusal to return from the route. */
export function checkLimit(
  request: Request,
  key: LimitKey,
  read: () => Limits = () => readLimits(process.env),
): NextResponse | null {
  const headerValue = request.headers.get(CLASSIFICATION_HEADER);
  if (isExempt(headerValue)) return null;
  return decideLimit(headerValue, read(), key) === "refused"
    ? refusalFor(key)
    : null;
}
