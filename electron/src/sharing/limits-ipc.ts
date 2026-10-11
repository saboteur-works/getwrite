/**
 * IPC handlers for reading and changing the paired-device limits
 * (Feature 77, FR-8, FR-29 bridge half).
 *
 * Plain module (no Electron import) so it is testable. Every handler's first
 * statement is the sender check; the renderer's payload is validated before
 * the store is called, and a refusal never echoes the payload.
 */
import {
  LIMIT_KEYS,
  readLimitsFile,
  setLimit,
  type LimitKey,
  type Limits,
  type LimitsRead,
  type SetLimitOutcome,
} from "./limits-store";

/** The part of an Electron IPC event the sender check reads. */
interface SenderEvent {
  senderFrame?: { url?: string | null } | null;
}

/** The store operations; injectable so tests can spy on them. */
interface LimitsOperations {
  readLimitsFile(dir: string): LimitsRead;
  setLimit(
    dir: string,
    key: LimitKey,
    value: boolean,
  ): Promise<SetLimitOutcome>;
}

interface LimitsHandlerDeps {
  /** `app.getPath("userData")`: holds the file and is shown when it is unreadable. */
  userDataDir: string;
  /** True only for a sender URL on the local origin. */
  isTrustedSender: (url: string | null | undefined) => boolean;
  /** Test seam; defaults to the real operations. */
  operations?: LimitsOperations;
}

/** The file's status plus the five effective limits. */
interface GetLimitsResult {
  kind: LimitsRead["kind"];
  limits: Limits;
  storeDirectory: string;
}

interface LimitsHandlers {
  getLimits(event: SenderEvent): Promise<GetLimitsResult>;
  setLimit(
    event: SenderEvent,
    key: unknown,
    value: unknown,
  ): Promise<SetLimitOutcome>;
}

function isLimitKey(value: unknown): value is LimitKey {
  return (
    typeof value === "string" &&
    (LIMIT_KEYS as readonly string[]).includes(value)
  );
}

function allOn(): Limits {
  return {
    projectDeletion: true,
    unlocking: true,
    locking: true,
    encryptionChanges: true,
    permanentDeletion: true,
  };
}

/**
 * Builds the two limits handlers.
 *
 * @param deps - Directory, sender check and optional operation seam.
 * @returns `getLimits` and `setLimit` handlers taking the IPC event first.
 */
export function createLimitsHandlers(deps: LimitsHandlerDeps): LimitsHandlers {
  const operations: LimitsOperations = deps.operations ?? {
    readLimitsFile,
    setLimit,
  };
  const assertTrusted = (event: SenderEvent): void => {
    if (!deps.isTrustedSender(event.senderFrame?.url)) {
      throw new Error("Refused: untrusted sender");
    }
  };

  return {
    async getLimits(event) {
      assertTrusted(event);
      const read = operations.readLimitsFile(deps.userDataDir);
      return {
        kind: read.kind,
        limits: read.kind === "ok" ? read.limits : allOn(),
        storeDirectory: deps.userDataDir,
      };
    },
    async setLimit(event, key, value) {
      assertTrusted(event);
      if (!isLimitKey(key) || typeof value !== "boolean") {
        return { kind: "invalid-input" };
      }
      return operations.setLimit(deps.userDataDir, key, value);
    },
  };
}
