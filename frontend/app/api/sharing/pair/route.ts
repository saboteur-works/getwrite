/**
 * POST /api/sharing/pair (Feature 75, FR-11, FR-17, FR-18, FR-19).
 *
 * The one endpoint an unconfirmed device may use. It verifies a submitted
 * pairing code, mints a device credential, stores only its hash with a device
 * name derived from the User-Agent header, and sets the device cookie. It
 * touches no project, so it is deliberately not wrapped in
 * `withStorageContext`.
 *
 * Responses carry no detail beyond `ok` and `reason` ("wrong" or "unusable");
 * the internal reason for an unusable code is never sent (FR-11). Nothing here
 * logs a code, a token or a hash.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
} from "../../../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
  readCredentialStore,
} from "../../../../src/lib/sharing/credential-store";
import { deriveDeviceName } from "../../../../src/lib/sharing/device-name";
import {
  HOST_NOT_ALLOWED_MESSAGE,
  isAllowedHost,
  parseServerPort,
  readOwnMachine,
} from "../../../../src/lib/sharing/host-allowlist";
import { verifyAndConsume } from "../../../../src/lib/sharing/pairing-verify";
import { isSameOrigin } from "../../../../src/lib/sharing/same-origin";
import { readSharingEnv } from "../../../../src/lib/sharing/sharing-env";

const WRONG = { ok: false, reason: "wrong" } as const;
const UNUSABLE = { ok: false, reason: "unusable" } as const;

function wrong(): NextResponse {
  return NextResponse.json(WRONG, { status: 400 });
}

function unusable(): NextResponse {
  return NextResponse.json(UNUSABLE, { status: 400 });
}

/** The submitted code, or undefined for anything that is not a JSON object with a string `code`. */
async function readSubmittedCode(
  request: NextRequest,
): Promise<string | undefined> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) return undefined;
  const code = (body as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function serverFailure(): NextResponse {
  // Verification or storage could not complete; this is not an answer about the code.
  return NextResponse.json(UNUSABLE, { status: 500 });
}

/**
 * FR-31, checked here as well as in the gate so the endpoint does not rely
 * only on `proxy.ts`. A missing or non-numeric PORT refuses.
 */
function hostIsAllowed(request: NextRequest): boolean {
  const port = parseServerPort(process.env.PORT);
  if (port === undefined) return false;
  const machine = readOwnMachine();
  return isAllowedHost({
    hostHeader: request.headers.get("host"),
    port,
    interfaces: machine.interfaces,
    hostname: machine.hostname,
  });
}

function hostNotAllowed(): NextResponse {
  return new NextResponse(HOST_NOT_ALLOWED_MESSAGE, {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-getwrite-gate": "host-not-allowed",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sharing = readSharingEnv(process.env);
  if (!sharing.sharingOn) return new NextResponse(null, { status: 404 });

  if (!hostIsAllowed(request)) return hostNotAllowed();

  if (!isSameOrigin({ method: request.method, headers: request.headers })) {
    return NextResponse.json({ error: "cross-origin" }, { status: 403 });
  }

  const code = await readSubmittedCode(request);
  if (code === undefined) return wrong();

  const dir = sharing.sharingDir;
  if (dir === undefined) return unusable();

  try {
    // Checked before the code is consumed: a code must not be spent when the
    // credential could not then be stored.
    if ((await readCredentialStore(dir)).kind === "corrupt") return unusable();

    const result = await verifyAndConsume(dir, code, Date.now());
    if (result.kind === "wrong") return wrong();
    if (result.kind === "unusable") return unusable();

    const name = deriveDeviceName(request.headers.get("user-agent") ?? "");
    const { token, device } = mintCredential(name);
    await addDevice(dir, device);

    const response = NextResponse.json({ ok: true }, { status: 200 });
    // Known limitation: no `Secure` attribute, because the server speaks plain
    // HTTP on the home network (no TLS in this feature). Long Max-Age (FR-33),
    // renewed by the gate on every confirmed request.
    response.cookies.set({
      name: DEVICE_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error(
      "Pairing failed with an I/O error:",
      (error as NodeJS.ErrnoException).code ?? "unknown",
    );
    return serverFailure();
  }
}
