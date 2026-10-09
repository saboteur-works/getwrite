/**
 * Server-side device-credential store (Feature 75, FR-17, FR-27).
 *
 * The store is one JSON file, `device-credentials.json`, in the directory the
 * caller passes (the server's `GETWRITE_SHARING_DIR`). It holds the SHA-256
 * hash of each device credential, never the credential. No state is held in
 * module variables: every read goes to disk, because Next may load this
 * module more than once.
 *
 * A missing file means no devices are paired. Anything else that prevents a
 * clean read (unparseable, schema-invalid, unreadable) is reported as
 * `corrupt`, which callers must treat as refusing (fail closed).
 */
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const CREDENTIALS_FILE_NAME = "device-credentials.json";
const LOCK_SUFFIX = ".lock";

const TOKEN_BYTES = 32;
/** base64url length of TOKEN_BYTES bytes, unpadded. */
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

const LOCK_RETRY_LIMIT = 200;
const LOCK_RETRY_DELAY_MS = 25;
/**
 * A lock file older than this is assumed to belong to a process that died
 * while holding it, and is removed. The critical section is a read plus one
 * small write, so a held lock this old cannot be live.
 */
const LOCK_STALE_MS = 30_000;

const DeviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  credentialHash: z.string().regex(/^[0-9a-f]{64}$/),
});

const CredentialFileSchema = z.object({
  version: z.literal(1),
  devices: z.array(DeviceRecordSchema),
});

export type DeviceRecord = z.infer<typeof DeviceRecordSchema>;

export type CredentialStoreState =
  | { kind: "empty" }
  | { kind: "ok"; devices: DeviceRecord[] }
  | { kind: "corrupt" };

export type DeviceLookup =
  | { kind: "found"; device: DeviceRecord }
  | { kind: "unknown" }
  | { kind: "corrupt" };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a credential. The token is returned once and is never stored. */
export function mintCredential(name: string): {
  token: string;
  device: DeviceRecord;
} {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    device: {
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      credentialHash: hashToken(token),
    },
  };
}

export async function readCredentialStore(
  dir: string,
): Promise<CredentialStoreState> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, CREDENTIALS_FILE_NAME), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "empty" };
    return { kind: "corrupt" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  const parsed = CredentialFileSchema.safeParse(json);
  return parsed.success
    ? { kind: "ok", devices: parsed.data.devices }
    : { kind: "corrupt" };
}

/** Pure match of a presented token against stored devices; constant-time per comparison. */
export function matchDeviceByToken(
  devices: readonly DeviceRecord[],
  token: string,
): DeviceRecord | undefined {
  if (token.length !== TOKEN_LENGTH || !TOKEN_PATTERN.test(token))
    return undefined;
  const presented = Buffer.from(hashToken(token), "hex");
  let match: DeviceRecord | undefined;
  for (const device of devices) {
    const stored = Buffer.from(device.credentialHash, "hex");
    if (
      stored.length === presented.length &&
      timingSafeEqual(stored, presented)
    ) {
      match = device;
    }
  }
  return match;
}

/** Reads the store from disk on every call, then matches. */
export async function findDeviceByToken(
  dir: string,
  token: string,
): Promise<DeviceLookup> {
  const state = await readCredentialStore(dir);
  if (state.kind === "corrupt") return { kind: "corrupt" };
  if (state.kind === "empty") return { kind: "unknown" };
  const device = matchDeviceByToken(state.devices, token);
  return device ? { kind: "found", device } : { kind: "unknown" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeIfStale(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function acquireLock(lockPath: string): Promise<void> {
  for (let attempt = 0; attempt < LOCK_RETRY_LIMIT; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await removeIfStale(lockPath);
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }
  throw new Error("Could not acquire the credential store lock");
}

async function writeAtomically(
  filePath: string,
  devices: DeviceRecord[],
): Promise<void> {
  const tempPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  const body = `${JSON.stringify({ version: 1, devices }, null, 2)}\n`;
  try {
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(tempPath, 0o600);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * Append a device. Serialised by an exclusive lock file so concurrent calls
 * all persist. Refuses (throws) when the existing store is corrupt, so a
 * damaged file is never silently replaced.
 */
export async function addDevice(
  dir: string,
  device: DeviceRecord,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, CREDENTIALS_FILE_NAME);
  const lockPath = `${filePath}${LOCK_SUFFIX}`;
  await acquireLock(lockPath);
  try {
    const state = await readCredentialStore(dir);
    if (state.kind === "corrupt") {
      throw new Error(
        "The credential store is corrupt; refusing to overwrite it",
      );
    }
    const existing = state.kind === "ok" ? state.devices : [];
    await writeAtomically(filePath, [...existing, device]);
  } finally {
    await rm(lockPath, { force: true });
  }
}
