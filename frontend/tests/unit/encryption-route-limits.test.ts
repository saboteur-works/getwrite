/**
 * Feature 77, Task 11: per-action limits on `POST /api/encryption`.
 */
// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/api/_tenant/resolve-tenant", async (importOriginal) => {
  const { createMemoryAdapter } =
    await import("../../src/lib/models/memoryAdapter");
  return {
    ...(await importOriginal<
      typeof import("../../app/api/_tenant/resolve-tenant")
    >()),
    resolveTenant: vi.fn(async () => ({
      userId: "user-1",
      dataRoot: "/ws",
      adapter: createMemoryAdapter(),
    })),
  };
});

vi.mock("../../src/lib/models/crypto/keyring-session", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/crypto/keyring-session")
  >("../../src/lib/models/crypto/keyring-session");
  return {
    ...actual,
    unlockSession: vi.fn(async () => undefined),
    lockSession: vi.fn(() => undefined),
    requireSessionKeyring: vi.fn(() => ({
      projectKey: () => new Uint8Array(32),
    })),
  };
});
vi.mock("../../src/lib/models/crypto/enable-encryption", () => ({
  enableProjectEncryption: vi.fn(async () => undefined),
  resumeInterruptedConversions: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/models/crypto/export-plaintext", () => ({
  exportProjectAsPlaintext: vi.fn(async () => undefined),
}));

import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import {
  enableProjectEncryption,
  resumeInterruptedConversions,
} from "../../src/lib/models/crypto/enable-encryption";
import { exportProjectAsPlaintext } from "../../src/lib/models/crypto/export-plaintext";
import { WrongPassphraseError } from "../../src/lib/models/crypto/keyring";
import {
  NoKeyringError,
  lockSession,
  unlockSession,
} from "../../src/lib/models/crypto/keyring-session";
import { LIMITS_FILE_NAME } from "../../src/lib/sharing/limits-store";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const KEYS = [
  "projectDeletion",
  "unlocking",
  "locking",
  "encryptionChanges",
  "permanentDeletion",
] as const;
type Key = (typeof KEYS)[number];

const tmpDirs: string[] = [];
let originalSharingDir: string | undefined;

beforeEach(() => {
  originalSharingDir = process.env.GETWRITE_SHARING_DIR;
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalSharingDir === undefined) delete process.env.GETWRITE_SHARING_DIR;
  else process.env.GETWRITE_SHARING_DIR = originalSharingDir;
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]) {
    delete process.env[key];
  }
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Points the sharing dir at a temp dir holding the given limits text (or no file). */
function seedLimits(text: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-enc-limits-"));
  tmpDirs.push(dir);
  if (text !== null) fs.writeFileSync(path.join(dir, LIMITS_FILE_NAME), text);
  process.env.GETWRITE_SHARING_DIR = dir;
  return dir;
}

function limitsOnly(on: readonly Key[]): string {
  const limits = Object.fromEntries(KEYS.map((k) => [k, on.includes(k)]));
  return JSON.stringify({ version: 1, limits });
}

async function post(
  body: unknown,
  classification: string | null,
  raw?: string,
): Promise<Response> {
  const { POST } = await import("../../app/api/encryption/route");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost",
  };
  if (classification !== null) {
    headers["x-getwrite-classification"] = classification;
  }
  return POST(
    new Request("http://localhost/api/encryption", {
      method: "POST",
      body: raw ?? JSON.stringify(body),
      headers,
    }),
  );
}

function expectNoModelCalls(): void {
  expect(unlockSession).not.toHaveBeenCalled();
  expect(lockSession).not.toHaveBeenCalled();
  expect(enableProjectEncryption).not.toHaveBeenCalled();
  expect(resumeInterruptedConversions).not.toHaveBeenCalled();
  expect(exportProjectAsPlaintext).not.toHaveBeenCalled();
}

async function expectRefusal(res: Response, limit: Key): Promise<string> {
  expect(res.status).toBe(403);
  const json = (await res.json()) as { error: string; limit: string };
  expect(json.limit).toBe(limit);
  expect(typeof json.error).toBe("string");
  expect(json.error.length).toBeGreaterThan(0);
  return json.error;
}

const PAIRED = "confirmed:d1";

const PER_ACTION: ReadonlyArray<{ name: string; body: unknown; limit: Key }> = [
  {
    name: "unlock",
    body: { action: "unlock", passphrase: "pw" },
    limit: "unlocking",
  },
  { name: "resume", body: { action: "resume" }, limit: "unlocking" },
  { name: "lock", body: { action: "lock" }, limit: "locking" },
  {
    name: "enable (null passphrase)",
    body: {
      action: "enable",
      projectId: PROJECT_ID,
      projectName: "P",
      passphrase: null,
    },
    limit: "encryptionChanges",
  },
  {
    name: "export",
    body: { action: "export", projectId: PROJECT_ID },
    limit: "encryptionChanges",
  },
];

describe("POST /api/encryption limits (Feature 77)", () => {
  for (const { name, body, limit } of PER_ACTION) {
    it(`${name}: refused for a paired device with ${limit} on, no model call`, async () => {
      seedLimits(limitsOnly([limit]));
      await expectRefusal(await post(body, PAIRED), limit);
      expectNoModelCalls();
    });

    it(`${name}: not refused for a paired device with ${limit} off but the other four on`, async () => {
      seedLimits(limitsOnly(KEYS.filter((k) => k !== limit)));
      const res = await post(body, PAIRED);
      expect(res.status).not.toBe(403);
    });

    it(`${name}: reaches the model for off and window, even with an unreadable limits file`, async () => {
      seedLimits("{ not json");
      for (const classification of ["off", "window"]) {
        vi.clearAllMocks();
        const res = await post(body, classification);
        expect(res.status).not.toBe(403);
        expect(
          vi.mocked(unlockSession).mock.calls.length +
            vi.mocked(lockSession).mock.calls.length +
            vi.mocked(enableProjectEncryption).mock.calls.length +
            vi.mocked(resumeInterruptedConversions).mock.calls.length +
            vi.mocked(exportProjectAsPlaintext).mock.calls.length,
        ).toBe(1);
      }
    });

    it(`${name}: a missing classification header is treated as paired (the limit is read from the file)`, async () => {
      seedLimits(limitsOnly([limit]));
      await expectRefusal(await post(body, null), limit);
      expectNoModelCalls();
    });

    it.each([null, "", "garbage", "confirmed:"])(
      `${name}: header %s is refused with ${limit} even when the file sets it false`,
      async (header) => {
        seedLimits(limitsOnly([]));
        await expectRefusal(await post(body, header), limit);
        expectNoModelCalls();
      },
    );

    it(`${name}: refused before the projectId validation and the availability check`, async () => {
      seedLimits(limitsOnly([limit]));
      process.env.DATABASE_URL = "postgres://localhost/getwrite";
      process.env.BETTER_AUTH_SECRET = "a-secret";
      process.env.BETTER_AUTH_URL = "http://localhost";
      const res = await post(
        { ...(body as object), projectId: "../x" },
        PAIRED,
      );
      await expectRefusal(res, limit);
    });
  }

  describe("enable with a passphrase", () => {
    const body = {
      action: "enable",
      projectId: PROJECT_ID,
      projectName: "P",
      passphrase: "correct horse battery staple",
    };

    it("is refused for a paired device even with all five limits off", async () => {
      seedLimits(limitsOnly([]));
      const text = await expectRefusal(
        await post(body, PAIRED),
        "encryptionChanges",
      );
      expect(text).toMatch(/desktop/i);
      expect(text).toMatch(/passphrase/i);
      expect(enableProjectEncryption).not.toHaveBeenCalled();
    });

    it("is refused with the limits file missing, and with it unreadable", async () => {
      for (const text of [null, "{ nope"]) {
        seedLimits(text);
        await expectRefusal(await post(body, PAIRED), "encryptionChanges");
      }
      expect(enableProjectEncryption).not.toHaveBeenCalled();
    });

    it("has its own text, different from the plain encryption-changes refusal", async () => {
      seedLimits(limitsOnly(["encryptionChanges"]));
      const plain = await expectRefusal(
        await post({ ...body, passphrase: null }, PAIRED),
        "encryptionChanges",
      );
      seedLimits(limitsOnly([]));
      const creation = await expectRefusal(
        await post(body, PAIRED),
        "encryptionChanges",
      );
      expect(creation).not.toBe(plain);
    });

    it("is not refused for off or window", async () => {
      seedLimits(limitsOnly([...KEYS]));
      for (const classification of ["off", "window"]) {
        const res = await post(body, classification);
        expect(res.status).not.toBe(403);
      }
      expect(enableProjectEncryption).toHaveBeenCalledTimes(2);
    });
  });

  describe("unknown action and unparseable body", () => {
    it("are refused for a paired device even with all limits off, no model call", async () => {
      seedLimits(limitsOnly([]));
      await expectRefusal(
        await post({ action: "frobnicate" }, PAIRED),
        "encryptionChanges",
      );
      await expectRefusal(
        await post(null, PAIRED, "not json"),
        "encryptionChanges",
      );
      await expectRefusal(
        await post(null, PAIRED, "null"),
        "encryptionChanges",
      );
      await expectRefusal(
        await post({ action: "frobnicate" }, null),
        "encryptionChanges",
      );
      expectNoModelCalls();
    });

    it("keep their present responses for off and window", async () => {
      seedLimits(limitsOnly([...KEYS]));
      for (const classification of ["off", "window"]) {
        const unknown = await post({ action: "frobnicate" }, classification);
        expect(unknown.status).toBe(400);
        expect(((await unknown.json()) as { error: string }).error).toBe(
          "Unknown action.",
        );
        const bad = await post(null, classification, "not json");
        expect(bad.status).toBe(400);
        expect("limit" in ((await bad.json()) as object)).toBe(false);
      }
      expectNoModelCalls();
    });
  });

  describe("GET and the limits file", () => {
    it("GET is not refused for a paired device with every limit on", async () => {
      seedLimits(limitsOnly([...KEYS]));
      const { GET } = await import("../../app/api/encryption/route");
      const res = await GET();
      expect(res.status).toBe(200);
    });

    it("off and window never read the limits file", async () => {
      const dir = seedLimits(limitsOnly([...KEYS]));
      const spy = vi.spyOn(fs, "readFileSync");
      try {
        for (const classification of ["off", "window"]) {
          await post({ action: "lock" }, classification);
        }
        const hasTouched = spy.mock.calls.some((c) =>
          String(c[0]).startsWith(dir),
        );
        expect(hasTouched).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it("reads the file fresh on every request", async () => {
      const dir = seedLimits(limitsOnly(["locking"]));
      await expectRefusal(await post({ action: "lock" }, PAIRED), "locking");
      fs.writeFileSync(path.join(dir, LIMITS_FILE_NAME), limitsOnly([]));
      expect((await post({ action: "lock" }, PAIRED)).status).toBe(200);
    });
  });

  describe("existing failures stay distinguishable for off", () => {
    it("wrong passphrase is 401 without a limit field", async () => {
      seedLimits(limitsOnly([...KEYS]));
      vi.mocked(unlockSession).mockRejectedValueOnce(
        new WrongPassphraseError(),
      );
      const res = await post({ action: "unlock", passphrase: "x" }, "off");
      expect(res.status).toBe(401);
      expect("limit" in ((await res.json()) as object)).toBe(false);
    });

    it("locked project is 401 without a limit field", async () => {
      seedLimits(limitsOnly([...KEYS]));
      vi.mocked(unlockSession).mockRejectedValueOnce(
        new ProjectLockedError(PROJECT_ID),
      );
      const res = await post({ action: "unlock", passphrase: "x" }, "off");
      expect(res.status).toBe(401);
      expect("limit" in ((await res.json()) as object)).toBe(false);
    });

    it("no keyring is 409 without a limit field", async () => {
      seedLimits(limitsOnly([...KEYS]));
      vi.mocked(unlockSession).mockRejectedValueOnce(new NoKeyringError());
      const res = await post({ action: "unlock", passphrase: "x" }, "off");
      expect(res.status).toBe(409);
      expect("limit" in ((await res.json()) as object)).toBe(false);
    });

    it("encryption unavailable is 403 with the availability text, not a limit refusal", async () => {
      seedLimits(limitsOnly([...KEYS]));
      process.env.DATABASE_URL = "postgres://localhost/getwrite";
      process.env.BETTER_AUTH_SECRET = "a-secret";
      process.env.BETTER_AUTH_URL = "http://localhost";
      const res = await post({ action: "lock" }, "off");
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: string; limit?: string };
      expect(json.limit).toBeUndefined();
      expect(json.error).toMatch(/not available/i);
    });

    it("cross-site is 403 from the wrapper, not a limit refusal", async () => {
      seedLimits(limitsOnly([...KEYS]));
      process.env.DATABASE_URL = "postgres://localhost/getwrite";
      process.env.BETTER_AUTH_SECRET = "a-secret";
      process.env.BETTER_AUTH_URL = "http://localhost";
      const { POST } = await import("../../app/api/encryption/route");
      const res = await POST(
        new Request("http://localhost/api/encryption", {
          method: "POST",
          body: JSON.stringify({ action: "lock" }),
          headers: {
            "content-type": "application/json",
            origin: "http://evil.example",
            "x-getwrite-classification": "off",
          },
        }),
      );
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: string; limit?: string };
      expect(json.limit).toBeUndefined();
      expect(lockSession).not.toHaveBeenCalled();
    });
  });
});
