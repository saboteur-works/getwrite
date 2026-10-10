/** Main-side device-store writer (Feature 76, FR-14, FR-15, FR-16, OQ-12). */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { updateDeviceStore } from "../src/sharing/device-store-writer";
import {
  CREDENTIALS_FILE_NAME,
  readCredentialStoreStatus,
} from "../src/sharing/store-status";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);
const FAST = { retryLimit: 5, retryDelayMs: 5 };

let dir: string;
let storePath: string;
let lockPath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-device-writer-"));
  storePath = path.join(dir, CREDENTIALS_FILE_NAME);
  lockPath = `${storePath}.lock`;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function install(fixture: string): void {
  fs.copyFileSync(path.join(FIXTURES, fixture), storePath);
}
function digest(): string {
  return createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
}
function readJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("updateDeviceStore", () => {
  it("creates the directory and treats ENOENT as an empty store", async () => {
    const nested = path.join(dir, "a", "b");
    const outcome = await updateDeviceStore(nested, (records) => {
      expect(records).toEqual([]);
      return [{ id: "x" }];
    });
    expect(outcome.kind).toBe("written");
    expect(fs.existsSync(path.join(nested, CREDENTIALS_FILE_NAME))).toBe(true);
  });

  it("keeps an unknown record field and unknown top-level key intact", async () => {
    install("device-credentials.unknown-fields.json");
    const before = readJson();
    const outcome = await updateDeviceStore(dir, (records) =>
      records.map((r, i) => (i === 1 ? { ...r, name: "Renamed" } : r)),
    );
    expect(outcome.kind).toBe("written");
    const after = readJson();
    const b = before.devices as Record<string, unknown>[];
    const a = after.devices as Record<string, unknown>[];
    expect(a[0]).toEqual(b[0]);
    expect(a[0].futureField).toEqual({ a: 1 });
    expect(a[1]).toEqual({ ...b[1], name: "Renamed" });
    expect(after.futureTopLevel).toEqual(before.futureTopLevel);
    expect(after.version).toBe(1);
  });

  it("returns unchanged and does not write when mutate returns null", async () => {
    install("device-credentials.valid.json");
    const h = digest();
    const outcome = await updateDeviceStore(dir, () => null);
    expect(outcome.kind).toBe("unchanged");
    expect(digest()).toBe(h);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("reads inside the lock: a mutate sees the file as it is when called", async () => {
    install("device-credentials.valid.json");
    let seen = 0;
    await updateDeviceStore(dir, (records) => {
      seen = records.length;
      return null;
    });
    expect(seen).toBe(2);
  });

  describe("refuses a bad store and leaves its bytes unchanged", () => {
    const cases: Array<[string, () => void]> = [
      ["unparseable JSON", () => fs.writeFileSync(storePath, "{ nope")],
      [
        "version other than 1",
        () => fs.writeFileSync(storePath, '{"version":2,"devices":[]}'),
      ],
      [
        "non-array devices",
        () => fs.writeFileSync(storePath, '{"version":1,"devices":{}}'),
      ],
      [
        "a record failing validity",
        () =>
          fs.writeFileSync(storePath, '{"version":1,"devices":[{"id":"a"}]}'),
      ],
      ["the corrupt fixture", () => install("device-credentials.corrupt.json")],
      [
        "a path that is a directory (read error)",
        () => fs.mkdirSync(storePath),
      ],
    ];
    for (const [name, setup] of cases) {
      it(name, async () => {
        setup();
        const isDir = fs.statSync(storePath).isDirectory();
        const h = isDir ? "" : digest();
        let called = false;
        const outcome = await updateDeviceStore(dir, () => {
          called = true;
          return [];
        });
        expect(outcome.kind).toBe("corrupt");
        expect(called).toBe(false);
        if (!isDir) expect(digest()).toBe(h);
        expect(fs.existsSync(lockPath)).toBe(false);
      });
    }
  });

  describe("lock protocol", () => {
    it("waits for a live holder and then succeeds", async () => {
      fs.writeFileSync(lockPath, "");
      setTimeout(() => fs.rmSync(lockPath, { force: true }), 40);
      const outcome = await updateDeviceStore(dir, () => [], {
        retryLimit: 50,
        retryDelayMs: 10,
      });
      expect(outcome.kind).toBe("written");
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("ends in lock-not-acquired when never released, leaving the holder's lock", async () => {
      fs.writeFileSync(lockPath, "");
      const outcome = await updateDeviceStore(dir, () => [], FAST);
      expect(outcome.kind).toBe("lock-not-acquired");
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(fs.existsSync(storePath)).toBe(false);
    });

    it("removes a lock older than 30 s by mtime and writes", async () => {
      fs.writeFileSync(lockPath, "");
      const old = new Date(Date.now() - 31_000);
      fs.utimesSync(lockPath, old, old);
      const outcome = await updateDeviceStore(dir, () => [{ id: "x" }], FAST);
      expect(outcome.kind).toBe("written");
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("does not remove a lock younger than 30 s", async () => {
      fs.writeFileSync(lockPath, "");
      const young = new Date(Date.now() - 20_000);
      fs.utimesSync(lockPath, young, young);
      const outcome = await updateDeviceStore(dir, () => [], FAST);
      expect(outcome.kind).toBe("lock-not-acquired");
    });

    it("throws a non-EEXIST open error at once, without retrying", async () => {
      const blocker = path.join(dir, "blocker");
      fs.writeFileSync(blocker, "");
      const started = Date.now();
      await expect(
        updateDeviceStore(blocker, () => [], {
          retryLimit: 200,
          retryDelayMs: 100,
        }),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it("releases the lock after a mutate that throws", async () => {
      await expect(
        updateDeviceStore(dir, () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("releases the lock and cleans up after a failed write", async () => {
      // mutate returns something JSON.stringify cannot serialise
      await expect(
        updateDeviceStore(dir, () => [{ n: BigInt(1) }]),
      ).rejects.toThrow();
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it("cleans up the temp file when the final rename fails", async () => {
      // A directory at the store path cannot be reached (corrupt), so make
      // rename fail by making the store path a non-empty directory AFTER read.
      const outcome = await updateDeviceStore(dir, () => {
        fs.mkdirSync(storePath);
        fs.writeFileSync(path.join(storePath, "keep"), "");
        return [{ id: "x" }];
      }).catch((e: unknown) => e);
      expect(outcome).toBeInstanceOf(Error);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    });

    it("defaults to 200 attempts at 25 ms (no options)", async () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/sharing/device-store-writer.ts"),
        "utf8",
      );
      expect(src).toMatch(/DEFAULT_RETRY_LIMIT = 200/);
      expect(src).toMatch(/DEFAULT_RETRY_DELAY_MS = 25/);
      expect(src).toMatch(/STALE_LOCK_MS = 30_000/);
    });
  });

  it.skipIf(process.platform === "win32")(
    "writes the file with mode 0600 (not asserted on Windows)",
    async () => {
      await updateDeviceStore(dir, () => [{ id: "x" }]);
      expect(fs.statSync(storePath).mode & 0o777).toBe(0o600);
    },
  );

  it("never writes the final path directly with writeFileSync", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/sharing/device-store-writer.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/writeFileSync/);
  });
});

describe("contract with the server's classification (shared fixtures)", () => {
  it("the valid fixture is accepted and the corrupt fixture refused, as readCredentialStoreStatus says", async () => {
    for (const [fixture, expected] of [
      ["device-credentials.valid.json", "written"],
      ["device-credentials.unknown-fields.json", "written"],
      ["device-credentials.corrupt.json", "corrupt"],
    ] as const) {
      install(fixture);
      const status = readCredentialStoreStatus(dir);
      const outcome = await updateDeviceStore(dir, (r) => r);
      expect(outcome.kind).toBe(expected);
      expect(status === "corrupt").toBe(expected === "corrupt");
    }
  });
});
