/**
 * Feature 76, FR-14 to FR-16: the main-side writer (revoke, rename) and the
 * server's `addDevice` share one `device-credentials.json` and one lock file.
 * Both real implementations run here against one temp directory; interleavings
 * are started with `Promise.all` and serialised by the real lock file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  renameDevice,
  revokeDevice,
} from "../../../electron/src/sharing/device-management";
import {
  addDevice,
  CREDENTIALS_FILE_NAME,
  mintCredential,
  readCredentialStore,
  type DeviceRecord,
} from "../../src/lib/sharing/credential-store";

const STORE_FILE = CREDENTIALS_FILE_NAME;
const LOCK_FILE = `${CREDENTIALS_FILE_NAME}.lock`;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-device-concurrency-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed(names: string[]): Promise<DeviceRecord[]> {
  const devices: DeviceRecord[] = [];
  for (const name of names) {
    const { device } = mintCredential(name);
    await addDevice(dir, device);
    devices.push(device);
  }
  return devices;
}

async function storedDevices(): Promise<DeviceRecord[]> {
  const state = await readCredentialStore(dir);
  expect(state.kind).toBe("ok");
  return state.kind === "ok" ? state.devices : [];
}

function expectNoLeftovers(): void {
  expect(fs.readdirSync(dir)).toEqual([STORE_FILE]);
}

describe("device store concurrency (real lock file, real store)", () => {
  it("(a) addDevice started together with a revoke of another device keeps the new device and drops only the revoked one, 50 fresh stores", async () => {
    for (let round = 0; round < 50; round += 1) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-device-concurrency-"));
      const [keep1, revoked, keep2] = await seed([
        "keep-1",
        "revoked",
        "keep-2",
      ]);
      const fresh = mintCredential("freshly-paired").device;

      const [, outcome] = await Promise.all([
        addDevice(dir, fresh),
        revokeDevice(dir, revoked.id),
      ]);

      expect(outcome).toEqual({ kind: "ok" });
      const ids = (await storedDevices()).map((d) => d.id).sort();
      expect(ids).toEqual([keep1.id, keep2.id, fresh.id].sort());
      expectNoLeftovers();
    }
  });

  it("(a) addDevice and a revoke both started while a test-held lock is released 50 ms later end with the new device present and the revoked one absent", async () => {
    const [keep, revoked] = await seed(["keep", "revoked"]);
    const fresh = mintCredential("freshly-paired").device;
    const lockPath = path.join(dir, LOCK_FILE);
    fs.writeFileSync(lockPath, "", { mode: 0o600 });
    const release = setTimeout(() => fs.rmSync(lockPath, { force: true }), 50);

    try {
      const [, outcome] = await Promise.all([
        addDevice(dir, fresh),
        revokeDevice(dir, revoked.id, { retryLimit: 400, retryDelayMs: 10 }),
      ]);
      expect(outcome).toEqual({ kind: "ok" });
    } finally {
      clearTimeout(release);
    }

    expect((await storedDevices()).map((d) => d.id).sort()).toEqual(
      [keep.id, fresh.id].sort(),
    );
    expectNoLeftovers();
  });

  it("(b) a rename of device X started together with a revoke of device Y persists both", async () => {
    const [x, y, z] = await seed(["x", "y", "z"]);

    const [renamed, revoked] = await Promise.all([
      renameDevice(dir, x.id, "x renamed"),
      revokeDevice(dir, y.id),
    ]);

    expect(renamed).toEqual({ kind: "ok" });
    expect(revoked).toEqual({ kind: "ok" });
    const stored = await storedDevices();
    expect(stored.map((d) => d.id).sort()).toEqual([x.id, z.id].sort());
    expect(stored.find((d) => d.id === x.id)?.name).toBe("x renamed");
    expect(stored.find((d) => d.id === z.id)).toEqual(z);
    expectNoLeftovers();
  });

  it("(c) two renames of one device started together end with one of the two names", async () => {
    const [target, other] = await seed(["target", "other"]);

    const results = await Promise.all([
      renameDevice(dir, target.id, "first"),
      renameDevice(dir, target.id, "second"),
    ]);

    expect(results).toEqual([{ kind: "ok" }, { kind: "ok" }]);
    const stored = await storedDevices();
    expect(["first", "second"]).toContain(
      stored.find((d) => d.id === target.id)?.name,
    );
    expect(stored.find((d) => d.id === other.id)).toEqual(other);
    expect(stored).toHaveLength(2);
    expectNoLeftovers();
  });

  it("(d) a revoke started while a live holder has the lock waits for its release and then succeeds", async () => {
    const [gone, kept] = await seed(["gone", "kept"]);
    const lockPath = path.join(dir, LOCK_FILE);
    fs.writeFileSync(lockPath, "", { mode: 0o600 });
    const release = setTimeout(() => fs.rmSync(lockPath, { force: true }), 200);

    try {
      const outcome = await revokeDevice(dir, gone.id, {
        retryLimit: 400,
        retryDelayMs: 10,
      });
      expect(outcome).toEqual({ kind: "ok" });
    } finally {
      clearTimeout(release);
    }

    expect((await storedDevices()).map((d) => d.id)).toEqual([kept.id]);
    expectNoLeftovers();
  });

  it("(d) a rename while the lock is never released returns lock-not-acquired and leaves the store unchanged", async () => {
    const [device] = await seed(["only"]);
    const before = fs.readFileSync(path.join(dir, STORE_FILE), "utf8");
    const lockPath = path.join(dir, LOCK_FILE);
    fs.writeFileSync(lockPath, "", { mode: 0o600 });

    const outcome = await renameDevice(dir, device.id, "never written", {
      retryLimit: 5,
      retryDelayMs: 5,
    });

    expect(outcome).toEqual({ kind: "lock-not-acquired" });
    expect(fs.readFileSync(path.join(dir, STORE_FILE), "utf8")).toBe(before);
    expect(fs.existsSync(lockPath)).toBe(true);
    fs.rmSync(lockPath, { force: true });
    expectNoLeftovers();
  });

  it("(e) a store written by an addDevice, a rename and a revoke started together is read as ok by the server", async () => {
    const [a, b] = await seed(["a", "b"]);
    const fresh = mintCredential("fresh").device;

    await Promise.all([
      addDevice(dir, fresh),
      renameDevice(dir, a.id, "a renamed"),
      revokeDevice(dir, b.id),
    ]);

    const state = await readCredentialStore(dir);
    expect(state.kind).toBe("ok");
    if (state.kind === "ok") {
      expect(state.devices.map((d) => d.id).sort()).toEqual(
        [a.id, fresh.id].sort(),
      );
      expect(state.devices.find((d) => d.id === a.id)?.name).toBe("a renamed");
    }
    expectNoLeftovers();
  });
});
