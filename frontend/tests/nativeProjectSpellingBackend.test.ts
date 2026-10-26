/**
 * Spell-checker Task 25: the native project-spelling transport runs the same
 * core as the HTTP route (`project-spelling-core.ts`) through
 * `createNativeRunner`, over a fake Capacitor filesystem, with no HTTP. The
 * table mirrors `projectSpellingCore.test.ts` (Task 22) and the route's
 * error table (Task 23). The second block guards the web-bundle exclusion the
 * way `native-*-backend-web-exclusion.test.ts` does.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakeCapacitorFilesystem } from "../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../src/lib/models/capacitorFsAdapter";
import {
  InvalidProjectIdCoreError,
  InvalidSpellingWordError,
  MAX_SPELLING_LIST_SIZE,
  SpellingListFullError,
  type SpellingLists,
} from "../src/lib/models/project-spelling-core";
import type { ProjectSpellingTransport } from "../src/lib/api/project-spelling";
import { createNativeProjectSpellingTransport } from "../src/store/transport/native-project-spelling-backend";
import { createNativeProjectSpellingTransport as webStubFactory } from "../src/store/transport/native-project-spelling-backend.web-stub";

const PID = "55555555-5555-4555-8555-555555555555";
const PROJECTS_DIR = "/projects";
const FILE = `${PROJECTS_DIR}/${PID}/project.json`;

function projectJson(config: Record<string, unknown>): string {
  return JSON.stringify(
    {
      id: PID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      extra: { keep: [1, 2, 3] },
      config,
    },
    null,
    2,
  );
}

type Fs = ReturnType<typeof createFakeCapacitorFilesystem>;

async function seed(fake: Fs, config: Record<string, unknown>): Promise<void> {
  const adapter = capacitorFsAdapter(fake);
  await adapter.mkdir(`${PROJECTS_DIR}/${PID}`, { recursive: true });
  await adapter.writeFile(FILE, projectJson(config));
}

async function raw(fake: Fs): Promise<string> {
  return capacitorFsAdapter(fake).readFile(FILE, "utf8");
}

type Method = keyof ProjectSpellingTransport;
const MUTATIONS: ReadonlyArray<{
  name: string;
  method: Exclude<Method, "getSpellingLists">;
  key: keyof SpellingLists;
  before: Record<string, unknown>;
  after: SpellingLists;
}> = [
  {
    name: "add",
    method: "addSpellingWord",
    key: "spellingProjectWords",
    before: {},
    after: { spellingProjectWords: ["Zorblax"], spellingIgnoredWords: [] },
  },
  {
    name: "ignore",
    method: "ignoreSpellingWord",
    key: "spellingIgnoredWords",
    before: {},
    after: { spellingProjectWords: [], spellingIgnoredWords: ["Zorblax"] },
  },
  {
    name: "remove",
    method: "removeSpellingWord",
    key: "spellingProjectWords",
    before: { spellingProjectWords: ["Zorblax", "keep"] },
    after: { spellingProjectWords: ["keep"], spellingIgnoredWords: [] },
  },
  {
    name: "unignore",
    method: "unignoreSpellingWord",
    key: "spellingIgnoredWords",
    before: { spellingIgnoredWords: ["Zorblax", "keep"] },
    after: { spellingProjectWords: [], spellingIgnoredWords: ["keep"] },
  },
];

describe("native project-spelling transport (spell-checker Task 25)", () => {
  let fake: Fs;
  let transport: ProjectSpellingTransport;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fake = createFakeCapacitorFilesystem();
    transport = createNativeProjectSpellingTransport({
      fs: fake,
      projectsDir: PROJECTS_DIR,
    });
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called in-process");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reads empty lists when both are absent, with no HTTP", async () => {
    await seed(fake, {});
    await expect(transport.getSpellingLists(PID)).resolves.toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
  });

  it("reads stored lists", async () => {
    await seed(fake, {
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: ["teh"],
    });
    await expect(transport.getSpellingLists(PID)).resolves.toEqual({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: ["teh"],
    });
  });

  describe.each(MUTATIONS)("$name", ({ method, key, before, after }) => {
    it("returns both lists and persists the change", async () => {
      await seed(fake, before);
      await expect(transport[method](PID, "Zorblax")).resolves.toEqual(after);
      await expect(transport.getSpellingLists(PID)).resolves.toEqual(after);
    });

    it("is idempotent and does not rewrite the file", async () => {
      await seed(fake, before);
      await transport[method](PID, "Zorblax");
      const bytes = await raw(fake);
      await expect(transport[method](PID, "Zorblax")).resolves.toEqual(after);
      expect(await raw(fake)).toBe(bytes);
    });

    it("changes no other part of project.json", async () => {
      const cfg = { ...before, otherKey: { a: 1 }, dailyWordGoal: 300 };
      await seed(fake, cfg);
      await transport[method](PID, "Zorblax");
      const expected = JSON.parse(projectJson(cfg));
      expected.config[key] = after[key];
      expect(await raw(fake)).toBe(JSON.stringify(expected, null, 2));
    });

    it.each([
      ["empty", ""],
      ["inner space", "two words"],
      ["control character", "a\u0000b"],
      ["101 code units", "a".repeat(101)],
    ])("rejects %s with InvalidSpellingWordError", async (_l, bad) => {
      await seed(fake, before);
      const bytes = await raw(fake);
      await expect(transport[method](PID, bad)).rejects.toBeInstanceOf(
        InvalidSpellingWordError,
      );
      expect(await raw(fake)).toBe(bytes);
    });

    it("rejects a malformed projectId", async () => {
      await expect(transport[method]("nope", "x")).rejects.toBeInstanceOf(
        InvalidProjectIdCoreError,
      );
    });
  });

  it("rejects a malformed projectId on read", async () => {
    await expect(transport.getSpellingLists("nope")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("refuses the 5,001st word and leaves the list unchanged", async () => {
    const full = Array.from(
      { length: MAX_SPELLING_LIST_SIZE },
      (_, i) => `w${i}`,
    );
    await seed(fake, { spellingProjectWords: full });
    const bytes = await raw(fake);
    await expect(
      transport.addSpellingWord(PID, "overflow"),
    ).rejects.toBeInstanceOf(SpellingListFullError);
    expect(await raw(fake)).toBe(bytes);
  });

  it("a read of a missing project rejects rather than resolving to empty lists", async () => {
    await expect(transport.getSpellingLists(PID)).rejects.toBeDefined();
  });
});

describe("native-project-spelling-backend web-bundle exclusion", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const BACKEND = path.join(
    "src",
    "store",
    "transport",
    "native-project-spelling-backend.ts",
  );
  const STUB = path.join(
    "src",
    "store",
    "transport",
    "native-project-spelling-backend.web-stub.ts",
  );
  const SERVICE = path.join("src", "lib", "api", "project-spelling.ts");

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        out.push(...sources(full));
      } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
    }
    return out;
  }

  it("is referenced only from lib/api/project-spelling.ts", () => {
    const re = /native-project-spelling-backend(?!\.web-stub)["']/;
    const offenders: string[] = [];
    for (const d of ["src", "app"]) {
      const dir = path.join(frontendRoot, d);
      if (!fs.existsSync(dir)) continue;
      for (const file of sources(dir)) {
        const rel = path.relative(frontendRoot, file);
        if ([SERVICE, BACKEND, STUB].includes(rel)) continue;
        if (re.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the loader thunk carries the literal dynamic import specifier", () => {
    expect(fs.readFileSync(path.join(frontendRoot, SERVICE), "utf8")).toContain(
      'import("../../store/transport/native-project-spelling-backend")',
    );
  });

  it("next.config.mjs aliases the literal specifier to the stub", () => {
    const config = fs.readFileSync(
      path.join(frontendRoot, "next.config.mjs"),
      "utf8",
    );
    expect(config).toContain("resolveAlias");
    expect(config).toContain(
      '"../../store/transport/native-project-spelling-backend":',
    );
    expect(config).toContain("native-project-spelling-backend.web-stub");
  });

  it("the stub contains no node:* reference and throws if reached", () => {
    const stub = fs.readFileSync(path.join(frontendRoot, STUB), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    expect(stub).not.toMatch(/require\(\s*["']node:/);
    expect(() => webStubFactory()).toThrow(/web-stub/i);
  });
});
