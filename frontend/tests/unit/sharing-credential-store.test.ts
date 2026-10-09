import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  CREDENTIALS_FILE_NAME,
  addDevice,
  findDeviceByToken,
  matchDeviceByToken,
  mintCredential,
  readCredentialStore,
} from "../../src/lib/sharing/credential-store";
import {
  SHARING_DIR_ENV,
  SHARING_ENV,
  WINDOW_SECRET_ENV,
  readSharingEnv,
} from "../../src/lib/sharing/sharing-env";

const FIXTURES = path.resolve(__dirname, "../fixtures/sharing");

let dir: string;
let otherDir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gw-cred-"));
  otherDir = await mkdtemp(path.join(os.tmpdir(), "gw-cred-other-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(otherDir, { recursive: true, force: true });
});

describe("sharing-env", () => {
  it("exports the three variable names", () => {
    expect(SHARING_DIR_ENV).toBe("GETWRITE_SHARING_DIR");
    expect(SHARING_ENV).toBe("GETWRITE_SHARING");
    expect(WINDOW_SECRET_ENV).toBe("GETWRITE_WINDOW_SECRET");
  });

  it("reads values from the env object passed in", () => {
    const env = readSharingEnv({
      GETWRITE_SHARING_DIR: "/x",
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: "s",
    });
    expect(env).toEqual({
      sharingDir: "/x",
      sharingOn: true,
      windowSecret: "s",
    });
  });

  it("treats absent or empty values as off/undefined", () => {
    expect(readSharingEnv({})).toEqual({
      sharingDir: undefined,
      sharingOn: false,
      windowSecret: undefined,
    });
    expect(
      readSharingEnv({ GETWRITE_SHARING_DIR: "", GETWRITE_SHARING: "0" }),
    ).toEqual({
      sharingDir: undefined,
      sharingOn: false,
      windowSecret: undefined,
    });
  });
});

describe("mintCredential", () => {
  it("returns a base64url token of at least 32 bytes and a hash-only record", () => {
    const { token, device } = mintCredential("Kitchen tablet");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(32);
    expect(device.name).toBe("Kitchen tablet");
    expect(device.id).toMatch(/\S+/);
    expect(Number.isNaN(Date.parse(device.createdAt))).toBe(false);
    expect(device.credentialHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(JSON.stringify(device)).not.toContain(token);
  });

  it("mints a different token each time", () => {
    expect(mintCredential("a").token).not.toBe(mintCredential("a").token);
  });
});

describe("readCredentialStore", () => {
  it("missing file is empty", async () => {
    expect(await readCredentialStore(dir)).toEqual({ kind: "empty" });
  });

  it("empty-but-valid file is ok with no devices", async () => {
    await writeFile(
      path.join(dir, CREDENTIALS_FILE_NAME),
      JSON.stringify({ version: 1, devices: [] }),
    );
    expect(await readCredentialStore(dir)).toEqual({ kind: "ok", devices: [] });
  });

  it("reads the valid fixture", async () => {
    await copyFile(
      path.join(FIXTURES, "device-credentials.valid.json"),
      path.join(dir, CREDENTIALS_FILE_NAME),
    );
    const state = await readCredentialStore(dir);
    expect(state.kind).toBe("ok");
    if (state.kind === "ok") expect(state.devices).toHaveLength(2);
  });

  it("unparseable JSON (corrupt fixture) is corrupt", async () => {
    await copyFile(
      path.join(FIXTURES, "device-credentials.corrupt.json"),
      path.join(dir, CREDENTIALS_FILE_NAME),
    );
    expect(await readCredentialStore(dir)).toEqual({ kind: "corrupt" });
  });

  it("schema-invalid file is corrupt", async () => {
    const file = path.join(dir, CREDENTIALS_FILE_NAME);
    await writeFile(
      file,
      JSON.stringify({ version: 1, devices: [{ id: "x" }] }),
    );
    expect(await readCredentialStore(dir)).toEqual({ kind: "corrupt" });
    await writeFile(file, JSON.stringify({ version: 2, devices: [] }));
    expect(await readCredentialStore(dir)).toEqual({ kind: "corrupt" });
    await writeFile(file, JSON.stringify([]));
    expect(await readCredentialStore(dir)).toEqual({ kind: "corrupt" });
  });

  it("an unreadable file (a directory at the path) is corrupt", async () => {
    await mkdir(path.join(dir, CREDENTIALS_FILE_NAME));
    expect(await readCredentialStore(dir)).toEqual({ kind: "corrupt" });
  });
});

describe("addDevice", () => {
  it("persists hash only, never the token, with mode 0600", async () => {
    const { token, device } = mintCredential("Phone");
    await addDevice(dir, device);
    const file = path.join(dir, CREDENTIALS_FILE_NAME);
    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain(token);
    expect(raw).toContain(device.credentialHash);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readCredentialStore(dir)).toEqual({
      kind: "ok",
      devices: [device],
    });
  });

  it("creates the directory if absent", async () => {
    const nested = path.join(dir, "a", "b");
    await addDevice(nested, mintCredential("Phone").device);
    expect((await readCredentialStore(nested)).kind).toBe("ok");
  });

  it("two concurrent adds both persist and leave no temp or lock files", async () => {
    const minted = Array.from({ length: 8 }, (_, i) => mintCredential(`d${i}`));
    await Promise.all(minted.map((m) => addDevice(dir, m.device)));
    const state = await readCredentialStore(dir);
    expect(state.kind).toBe("ok");
    if (state.kind === "ok") {
      expect(state.devices.map((d) => d.id).sort()).toEqual(
        minted.map((m) => m.device.id).sort(),
      );
    }
    expect(await readdir(dir)).toEqual([CREDENTIALS_FILE_NAME]);
  });

  it("refuses to overwrite a corrupt store", async () => {
    const file = path.join(dir, CREDENTIALS_FILE_NAME);
    await writeFile(file, "{not json");
    await expect(addDevice(dir, mintCredential("x").device)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("{not json");
  });

  it("recovers from a stale lock file", async () => {
    const lock = path.join(dir, `${CREDENTIALS_FILE_NAME}.lock`);
    await writeFile(lock, "");
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const { utimes } = await import("node:fs/promises");
    await utimes(lock, old, old);
    await addDevice(dir, mintCredential("x").device);
    expect((await readCredentialStore(dir)).kind).toBe("ok");
  });
});

describe("findDeviceByToken", () => {
  it("finds a stored token and returns the device", async () => {
    const { token, device } = mintCredential("Phone");
    await addDevice(dir, device);
    expect(await findDeviceByToken(dir, token)).toEqual({
      kind: "found",
      device,
    });
  });

  it("returns unknown for an unknown, empty, malformed or foreign-install token", async () => {
    const { device } = mintCredential("Phone");
    await addDevice(dir, device);
    const foreign = mintCredential("Elsewhere");
    await addDevice(otherDir, foreign.device);
    for (const t of [
      mintCredential("z").token,
      "",
      "not a token!",
      "a".repeat(10_000),
      foreign.token,
    ]) {
      expect(await findDeviceByToken(dir, t)).toEqual({ kind: "unknown" });
    }
  });

  it("returns unknown when the file is missing", async () => {
    expect(await findDeviceByToken(dir, mintCredential("z").token)).toEqual({
      kind: "unknown",
    });
  });

  it("returns corrupt, never unknown, for a corrupt store", async () => {
    await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{nope");
    expect(await findDeviceByToken(dir, mintCredential("z").token)).toEqual({
      kind: "corrupt",
    });
  });

  it("reads from disk on every call", async () => {
    const { token, device } = mintCredential("Late");
    expect(await findDeviceByToken(dir, token)).toEqual({ kind: "unknown" });
    await addDevice(dir, device);
    expect(await findDeviceByToken(dir, token)).toEqual({
      kind: "found",
      device,
    });
  });
});

describe("matchDeviceByToken", () => {
  it("returns the device for a stored token and undefined otherwise", () => {
    const a = mintCredential("a");
    const b = mintCredential("b");
    expect(matchDeviceByToken([a.device], a.token)).toEqual(a.device);
    expect(matchDeviceByToken([a.device], b.token)).toBeUndefined();
    expect(matchDeviceByToken([a.device], "")).toBeUndefined();
    expect(matchDeviceByToken([], a.token)).toBeUndefined();
  });
});
