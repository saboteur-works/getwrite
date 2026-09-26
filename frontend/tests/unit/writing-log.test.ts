import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import type { StorageAdapter } from "../../src/lib/models/io";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  appendWritingLogEntry,
  readWritingLogEntries,
  WritingLogCorruptError,
  InvalidWritingLogTimestampError,
} from "../../src/lib/models/writing-log";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const ROOT = "/ws/proj";
const file = (day: string) => `${ROOT}/meta/writing-log/${day}.json`;
const readEntries = async (day: string) =>
  JSON.parse(await readFile(file(day), "utf8")).entries;

describe("writing-log model (Feature 59 Task 3)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("append creates the day file keyed by the UTC date", async () => {
    const e = await appendWritingLogEntry(
      ROOT,
      { added: 5, deleted: 2 },
      "2026-09-26T10:00:00.000Z",
    );
    expect(e).toEqual({
      added: 5,
      deleted: 2,
      net: 3,
      timestamp: "2026-09-26T10:00:00.000Z",
    });
    expect(await readEntries("2026-09-26")).toEqual([e]);
  });

  it("a second append keeps the first entry byte-for-byte and adds one with its own timestamp", async () => {
    await appendWritingLogEntry(
      ROOT,
      { added: 1, deleted: 0 },
      "2026-09-26T10:00:00.000Z",
    );
    const first = (await readEntries("2026-09-26"))[0];
    await appendWritingLogEntry(
      ROOT,
      { skipped: true },
      "2026-09-26T11:00:00.000Z",
    );
    const entries = await readEntries("2026-09-26");
    expect(entries).toHaveLength(2);
    expect(JSON.stringify(entries[0])).toBe(JSON.stringify(first));
    expect(entries[1]).toEqual({
      skipped: true,
      timestamp: "2026-09-26T11:00:00.000Z",
    });
  });

  it("assigns the timestamp itself (current instant) when none is injected", async () => {
    const e = await appendWritingLogEntry(ROOT, { added: 1, deleted: 0 });
    expect(Math.abs(Date.now() - Date.parse(e.timestamp))).toBeLessThan(5000);
    expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp);
  });

  it("records an import source", async () => {
    const e = await appendWritingLogEntry(
      ROOT,
      { added: 9, deleted: 0, source: "docx" },
      "2026-09-26T10:00:00Z",
    );
    expect(e).toMatchObject({ source: "docx" });
  });

  it("20 concurrent appends lose none", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        appendWritingLogEntry(
          ROOT,
          { added: i, deleted: 0 },
          `2026-09-26T10:00:${String(i).padStart(2, "0")}.000Z`,
        ),
      ),
    );
    const entries = await readEntries("2026-09-26");
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((e: { added: number }) => e.added)).size).toBe(
      20,
    );
  });

  it("files entries just before and just after UTC midnight in different files", async () => {
    await appendWritingLogEntry(
      ROOT,
      { added: 1, deleted: 0 },
      "2026-09-26T23:59:59.999Z",
    );
    await appendWritingLogEntry(
      ROOT,
      { added: 2, deleted: 0 },
      "2026-09-27T00:00:00.000Z",
    );
    expect(await readEntries("2026-09-26")).toHaveLength(1);
    expect(await readEntries("2026-09-27")).toHaveLength(1);
  });

  it("uses the UTC date for an offset timestamp", async () => {
    await appendWritingLogEntry(
      ROOT,
      { added: 1, deleted: 0 },
      "2026-09-27T05:00:00+10:00",
    );
    expect((await readEntries("2026-09-26"))[0].timestamp).toBe(
      "2026-09-26T19:00:00.000Z",
    );
  });

  it("rejects malformed timestamps before any path is built", async () => {
    const bad: Array<string | Date> = [
      "2026",
      "Sep 26 2026",
      "../../etc/passwd",
      "2026-13-40T00:00:00Z",
      "",
      "2026-09-26",
      new Date(NaN),
      new Date(8.64e15),
    ];
    for (const b of bad) {
      await expect(
        appendWritingLogEntry(ROOT, { added: 1, deleted: 0 }, b),
      ).rejects.toBeInstanceOf(InvalidWritingLogTimestampError);
    }
    await expect(
      readFile(`${ROOT}/meta/writing-log`, "utf8"),
    ).rejects.toBeTruthy();
  });

  it("reports a corrupt day file on append and read instead of treating it as empty", async () => {
    await mkdir(`${ROOT}/meta/writing-log`, { recursive: true });
    await writeFile(file("2026-09-26"), "{not json", "utf8");
    await expect(
      appendWritingLogEntry(
        ROOT,
        { added: 1, deleted: 0 },
        "2026-09-26T10:00:00Z",
      ),
    ).rejects.toBeInstanceOf(WritingLogCorruptError);
    await expect(
      readWritingLogEntries(
        ROOT,
        "2026-09-26T00:00:00Z",
        "2026-09-27T00:00:00Z",
      ),
    ).rejects.toBeInstanceOf(WritingLogCorruptError);

    // schema-invalid (net != added - deleted) is also corrupt
    await writeFile(
      file("2026-09-26"),
      JSON.stringify({
        entries: [
          { added: 1, deleted: 0, net: 5, timestamp: "2026-09-26T10:00:00Z" },
        ],
      }),
      "utf8",
    );
    await expect(
      readWritingLogEntries(
        ROOT,
        "2026-09-26T00:00:00Z",
        "2026-09-27T00:00:00Z",
      ),
    ).rejects.toBeInstanceOf(WritingLogCorruptError);
    expect(await readFile(file("2026-09-26"), "utf8")).toContain('"net":5');
  });

  it("reads a UTC+10 local day spanning two UTC files, ordered, loading only those two", async () => {
    // local day 2026-09-27 at UTC+10 = 2026-09-26T14:00Z .. 2026-09-27T14:00Z
    const mem = createMemoryAdapter();
    const reads: string[] = [];
    const orig = mem.readFile.bind(mem);
    (mem as StorageAdapter).readFile = ((p: string, e?: BufferEncoding) => {
      reads.push(p);
      return orig(p, e);
    }) as StorageAdapter["readFile"];
    setStorageAdapter(mem);

    for (const [ts, added] of [
      ["2026-09-27T03:00:00.000Z", 3],
      ["2026-09-26T15:00:00.000Z", 1],
      ["2026-09-26T13:59:59.999Z", 9], // before window
      ["2026-09-27T14:00:00.000Z", 8], // at `to`, excluded
    ] as const) {
      await appendWritingLogEntry(ROOT, { added, deleted: 0 }, ts);
    }
    reads.length = 0;
    const out = await readWritingLogEntries(
      ROOT,
      "2026-09-26T14:00:00.000Z",
      "2026-09-27T14:00:00.000Z",
    );
    expect(out.map((e) => e.timestamp)).toEqual([
      "2026-09-26T15:00:00.000Z",
      "2026-09-27T03:00:00.000Z",
    ]);
    expect([...reads].sort()).toEqual([file("2026-09-26"), file("2026-09-27")]);
  });

  it("reads a UTC-8 local day spanning two UTC files", async () => {
    // 2026-09-26 local at UTC-8 = 2026-09-26T08:00Z .. 2026-09-27T08:00Z
    await appendWritingLogEntry(
      ROOT,
      { added: 1, deleted: 0 },
      "2026-09-26T09:00:00.000Z",
    );
    await appendWritingLogEntry(
      ROOT,
      { skipped: true },
      "2026-09-27T07:00:00.000Z",
    );
    const out = await readWritingLogEntries(
      ROOT,
      "2026-09-26T08:00:00.000Z",
      "2026-09-27T08:00:00.000Z",
    );
    expect(out).toHaveLength(2);
  });

  it("read with no files yields an empty list", async () => {
    expect(
      await readWritingLogEntries(
        ROOT,
        "2026-09-26T00:00:00Z",
        "2026-09-27T00:00:00Z",
      ),
    ).toEqual([]);
  });

  it("rethrows locked-access errors on append and read", async () => {
    const base = createMemoryAdapter();
    const tenantRoot = "/ws";
    const projectId = "55555555-5555-4555-8555-555555555555";
    const root = `${tenantRoot}/${projectId}`;
    await base.mkdir(root, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(projectId);
    await writeProjectMarker(root, base);
    keyring.lock();
    setStorageAdapter(workspaceEncryptionAdapter(base, tenantRoot, keyring));

    const a = appendWritingLogEntry(
      root,
      { added: 1, deleted: 0 },
      "2026-09-26T10:00:00Z",
    );
    await expect(a).rejects.toBeTruthy();
    await a.catch((e: unknown) => expect(isLockedAccessError(e)).toBe(true));
    const r = readWritingLogEntries(
      root,
      "2026-09-26T00:00:00Z",
      "2026-09-27T00:00:00Z",
    );
    await expect(r).rejects.toBeTruthy();
    await r.catch((e: unknown) => expect(isLockedAccessError(e)).toBe(true));
  });
});
