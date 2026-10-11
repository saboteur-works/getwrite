/**
 * The one shared check enforcing routes call (Feature 77, FR-10, FR-13, FR-16).
 * `decideLimit` is a pure decision over the forwarded classification header
 * and parsed limits. `checkLimit` reads the header, reads the limits file only
 * for a classified paired device (fresh on every call), and returns null (allowed) or a
 * ready refusal. Fails closed: a missing, empty or unparseable
 * classification is refused for every limited action without reading the
 * limits file, and for a classified paired device an unreadable file means
 * every limit is on (`readLimits`).
 */
import { NextResponse } from "next/server";

import { CLASSIFICATION_HEADER, parseClassification } from "./classify-request";
import { LIMIT_REFUSAL_MESSAGES } from "./limits-copy";
import { allOn, readLimits, type LimitKey, type Limits } from "./limits-store";

type LimitDecision = "allowed" | "refused";

/** True when the header is missing, empty or does not parse (refused for every limit). */
function isUnclassified(headerValue: string | null): boolean {
  return parseClassification(headerValue) === undefined;
}

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
  if (isUnclassified(headerValue)) return "refused";
  return limits[key] ? "refused" : "allowed";
}

/**
 * HTTP 403 `{ error, limit }`; never the gate's 401, no gate header. `message`
 * replaces the key's own sentence for a route whose action it misdescribes.
 */
export function refusalFor(key: LimitKey, message?: string): NextResponse {
  return NextResponse.json(
    { error: message ?? LIMIT_REFUSAL_MESSAGES[key], limit: key },
    { status: 403 },
  );
}

/** Null when allowed; otherwise the refusal to return from the route. */
export function checkLimit(
  request: Request,
  key: LimitKey,
  read: () => Limits = () => readLimits(process.env),
  message?: string,
): NextResponse | null {
  const headerValue = request.headers.get(CLASSIFICATION_HEADER);
  if (isExempt(headerValue)) return null;
  if (isUnclassified(headerValue)) return refusalFor(key, message);
  return decideLimit(headerValue, read(), key) === "refused"
    ? refusalFor(key, message)
    : null;
}

/** What `GET /api/sharing/limits` tells a caller about its own limits. */
export type LimitsRole =
  | { role: "exempt" }
  | { role: "paired"; limits: Limits };

/**
 * The caller's role from the forwarded header. Window and off are exempt and
 * the file is not read; a missing or unparseable header is a paired caller
 * with every limit on, again without a read (fail closed); only a classified
 * paired device reads the file, fresh.
 */
export function limitsRoleFor(
  request: Request,
  read: () => Limits = () => readLimits(process.env),
): LimitsRole {
  const headerValue = request.headers.get(CLASSIFICATION_HEADER);
  if (isExempt(headerValue)) return { role: "exempt" };
  if (isUnclassified(headerValue)) return { role: "paired", limits: allOn() };
  return { role: "paired", limits: read() };
}
