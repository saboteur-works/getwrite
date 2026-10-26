/**
 * @module api/user-word-list
 *
 * **Feature 96, Task 8.** Client transport for the cross-project user word
 * list: `getUserWords`, `addUserWord`, `removeUserWord`. Each resolves to the
 * list the store persisted, from whichever of three independent stores fits
 * the runtime (no sync between them): the Electron IPC bridge, the
 * `/api/user-word-list` route, or the native Android device file.
 *
 * Same shape as `global-noise-words.ts`: one `createTransport` call decides
 * native-vs-not at build time; the Electron/web split is a call-time
 * `getDesktopBridge()` check inside `httpImpl`.
 *
 * **A failure never renders as an empty list.** Every failure rejects, and
 * no function here resolves to `[]` unless the store returned `[]`. A
 * refusal, rejected word, full list or corrupt store rejects with a
 * {@link UserWordListTransportError} carrying a `reason`; a network failure
 * or a rejecting bridge call propagates unchanged; a body failing its schema
 * is reported through `reportTransportValidationFailure` and rejects.
 */
import { createTransport } from "../../store/transport/create-transport";
import { getDesktopBridge } from "../desktop-bridge";
import {
  UserWordListErrorResponseSchema,
  UserWordListRefusalSchema,
  UserWordListResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The user-word-list operations every runtime implements. */
export interface UserWordListTransport {
  /** The persisted list. Rejects on failure; never `[]` for a failed read. */
  getUserWords(): Promise<string[]>;
  /** Adds one word; resolves to the persisted list. */
  addUserWord(word: string): Promise<string[]>;
  /** Removes one word; resolves to the persisted list. */
  removeUserWord(word: string): Promise<string[]>;
}

/**
 * A user-word-list call the store or the server refused or could not
 * complete. `reason` is the server/bridge reason (`list-full`, `corrupt`,
 * `unreadable`, ...), or `"refused"` for a paired-device 403, or `"http"`
 * when the response carried no usable reason.
 */
export class UserWordListTransportError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "UserWordListTransportError";
    this.reason = reason;
  }
}

const ENDPOINT = "/api/user-word-list";

type Method = "getUserWords" | "addUserWord" | "removeUserWord";

/** Validates a success payload; reports and rejects when it is malformed. */
function parseWords(method: Method, body: unknown): string[] {
  const parsed = UserWordListResponseSchema.safeParse(body);
  if (!parsed.success) {
    reportTransportValidationFailure(
      `user-word-list.${method}`,
      parsed.error.issues,
    );
    throw new Error("The user word list response was malformed.");
  }
  return parsed.data;
}

/** Builds the rejection for a non-2xx response from its (possibly absent) body. */
async function errorFor(
  response: Response,
): Promise<UserWordListTransportError> {
  const body: unknown = await response.json().catch(() => null);
  const fallback = `The user word list request failed (HTTP ${response.status}).`;
  if (response.status === 403) {
    const refusal = UserWordListRefusalSchema.safeParse(body);
    return new UserWordListTransportError(
      "refused",
      refusal.success ? refusal.data.error : fallback,
    );
  }
  const error = UserWordListErrorResponseSchema.safeParse(body);
  if (!error.success) {
    return new UserWordListTransportError("http", fallback);
  }
  return new UserWordListTransportError(
    error.data.reason ?? "http",
    error.data.error,
  );
}

async function fetchWords(
  method: Method,
  init?: { verb: "POST" | "DELETE"; word: string },
): Promise<string[]> {
  const response = init
    ? await fetch(ENDPOINT, {
        method: init.verb,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: init.word }),
      })
    : await fetch(ENDPOINT);
  if (!response.ok) {
    throw await errorFor(response);
  }
  return parseWords(method, await response.json());
}

/** Unwraps a bridge result: `ok:false` becomes a rejection with its reason. */
function fromBridge(
  method: Method,
  result:
    | { ok: true; words: string[] }
    | { ok: false; reason: string; message: string },
): string[] {
  if (!result.ok) {
    throw new UserWordListTransportError(result.reason, result.message);
  }
  return parseWords(method, result.words);
}

/**
 * Web/desktop transport: the Electron bridge when present (checked on every
 * call, a runtime `window` check), otherwise the HTTP route.
 */
const httpUserWordListTransport: UserWordListTransport = {
  async getUserWords() {
    const bridge = getDesktopBridge();
    if (bridge) {
      return fromBridge("getUserWords", await bridge.getUserWordList());
    }
    return fetchWords("getUserWords");
  },

  async addUserWord(word) {
    const bridge = getDesktopBridge();
    if (bridge) {
      return fromBridge("addUserWord", await bridge.addUserWord(word));
    }
    return fetchWords("addUserWord", { verb: "POST", word });
  },

  async removeUserWord(word) {
    const bridge = getDesktopBridge();
    if (bridge) {
      return fromBridge("removeUserWord", await bridge.removeUserWord(word));
    }
    return fetchWords("removeUserWord", { verb: "DELETE", word });
  },
};

/**
 * The thunk carries the literal dynamic-import specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can swap in the web-stub.
 */
const resolveUserWordListTransport: () => Promise<UserWordListTransport> =
  createTransport(httpUserWordListTransport, () =>
    import("../../store/transport/native-user-word-list-backend").then(
      ({ createNativeUserWordListTransport }) =>
        createNativeUserWordListTransport(),
    ),
  );

/** The persisted user word list; rejects on any failure. */
export async function getUserWords(): Promise<string[]> {
  const transport = await resolveUserWordListTransport();
  return transport.getUserWords();
}

/** Adds one word to the user word list; resolves to the persisted list. */
export async function addUserWord(word: string): Promise<string[]> {
  const transport = await resolveUserWordListTransport();
  return transport.addUserWord(word);
}

/** Removes one word from the user word list; resolves to the persisted list. */
export async function removeUserWord(word: string): Promise<string[]> {
  const transport = await resolveUserWordListTransport();
  return transport.removeUserWord(word);
}
