/**
 * The request gate for home-network sharing (Feature 75, FR-8 to FR-11, FR-20,
 * FR-29). `frontend/proxy.ts` calls {@link runGate} for every request.
 *
 * No module-level state: the classification reaches route code only in the
 * `x-getwrite-classification` request header this function sets on the
 * forwarded request, after removing any client-supplied copy of it. Every
 * decision that cannot be made (unreadable store, no store directory) refuses.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  CLASSIFICATION_HEADER,
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  classifyRequest,
  type ClassifyInput,
  serializeClassification,
  type Classification,
} from "./classify-request";
import {
  readCredentialStore,
  type CredentialStoreState,
} from "./credential-store";
import {
  HOST_NOT_ALLOWED_MESSAGE,
  isAllowedHost,
  parseServerPort,
  readOwnMachine,
  type OwnMachine,
} from "./host-allowlist";
import { isSameOrigin } from "./same-origin";
import { readSharingEnv, type EnvLike } from "./sharing-env";

const PAIR_PAGE = "/pair";
const PAIR_ENDPOINT = "/api/sharing/pair";
const STATIC_PREFIX = "/_next/static/";

/** Shown to a person whose device is refused; the FR-20 working copy, verbatim. */
export const NOT_PAIRED_MESSAGE =
  "This device is not paired. On your computer, open GetWrite, turn on sharing, and enter the code shown there.";

export { HOST_NOT_ALLOWED_MESSAGE };

const GATE_HEADER = "x-getwrite-gate";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Public build output only; any encoded or dotted segment is not trusted as static. */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith(STATIC_PREFIX) &&
    !pathname.includes("%") &&
    !pathname.includes("..") &&
    !pathname.includes("\\")
  );
}

function isPairingException(pathname: string, method: string): boolean {
  if (pathname === PAIR_PAGE) return true;
  return pathname === PAIR_ENDPOINT && method.toUpperCase() === "POST";
}

async function loadStore(
  dir: string | undefined,
): Promise<CredentialStoreState> {
  // Without a directory the store cannot be read, so nothing can be confirmed.
  if (dir === undefined) return { kind: "corrupt" };
  return readCredentialStore(dir);
}

function forward(
  request: NextRequest,
  classification: Classification,
): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete(CLASSIFICATION_HEADER);
  headers.set(CLASSIFICATION_HEADER, serializeClassification(classification));
  return NextResponse.next({ request: { headers } });
}

/**
 * FR-33: sliding renewal. Repeats the presented token (never a new one) with a
 * fresh Max-Age on the forwarded response, with the same attributes as pairing.
 */
function renewDeviceCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const token = request.cookies.get(DEVICE_COOKIE)?.value;
  if (token === undefined) return response;
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

function refuseNotPaired(request: NextRequest, asJson: boolean): NextResponse {
  if (asJson) {
    return NextResponse.json(
      { error: "not-paired", message: NOT_PAIRED_MESSAGE },
      { status: 401, headers: { [GATE_HEADER]: "not-paired" } },
    );
  }
  const target = request.nextUrl.clone();
  target.pathname = PAIR_PAGE;
  target.search = "";
  const status = ["GET", "HEAD"].includes(request.method.toUpperCase())
    ? 307
    : 303;
  const response = NextResponse.redirect(target, status);
  response.headers.set(GATE_HEADER, "not-paired");
  return response;
}

function refuseCrossOrigin(): NextResponse {
  return NextResponse.json(
    { error: "cross-origin" },
    { status: 403, headers: { [GATE_HEADER]: "cross-origin" } },
  );
}

/**
 * The FR-31 refusal: plain text, 403, never a redirect (the redirect target,
 * `/pair`, would be refused for the same Host).
 */
function refuseHostNotAllowed(): NextResponse {
  return new NextResponse(HOST_NOT_ALLOWED_MESSAGE, {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      [GATE_HEADER]: "host-not-allowed",
    },
  });
}

/** True when the Host names this machine on the server's own port; a missing or non-numeric PORT refuses. */
function hostIsAllowed(
  request: NextRequest,
  env: EnvLike,
  machine: OwnMachine,
): boolean {
  const port = parseServerPort(env.PORT);
  if (port === undefined) return false;
  return isAllowedHost({
    hostHeader: request.headers.get("host"),
    port,
    interfaces: machine.interfaces,
    hostname: machine.hostname,
  });
}

function requestInputs(
  request: NextRequest,
  env: EnvLike,
): Omit<ClassifyInput, "store"> {
  return {
    headers: request.headers,
    cookies: request.cookies,
    method: request.method,
    env,
  };
}

/**
 * Runs the gate. `machine` is read at call time by default so an address
 * change needs no restart; tests inject one.
 */
export async function runGate(
  request: NextRequest,
  env: EnvLike,
  machine?: OwnMachine,
): Promise<NextResponse> {
  const inputs = requestInputs(request, env);
  // The window check does not depend on the store, so a window request never reads it.
  const first = classifyRequest({ ...inputs, store: { kind: "empty" } });
  if (first.kind === "off" || first.kind === "window") {
    return forward(request, first);
  }

  // Everything that is not the window, exempt requests and static assets
  // included, must name this machine (FR-31) before anything else is decided.
  const own = machine ?? readOwnMachine();
  if (!hostIsAllowed(request, env, own)) return refuseHostNotAllowed();

  const store = await loadStore(readSharingEnv(env).sharingDir);
  const classification = classifyRequest({ ...inputs, store });
  const { pathname } = request.nextUrl;

  switch (classification.kind) {
    case "off":
    case "window":
      return forward(request, classification);
    case "confirmed":
      return isSameOrigin({ method: request.method, headers: request.headers })
        ? renewDeviceCookie(request, forward(request, classification))
        : refuseCrossOrigin();
    case "not-confirmed": {
      if (isStaticAsset(pathname)) return forward(request, classification);
      const isStoreUsable = classification.reason !== "store-corrupt";
      if (isStoreUsable && isPairingException(pathname, request.method)) {
        return forward(request, classification);
      }
      // A corrupt store refuses the pairing page too, as JSON: redirecting it to
      // itself would loop.
      return refuseNotPaired(
        request,
        isApiPath(pathname) || pathname === PAIR_PAGE,
      );
    }
  }
}
