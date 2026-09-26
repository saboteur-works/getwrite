import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, readFile } from "../../src/lib/models/io";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { rebuildIndexes as rebuildDocx } from "../../src/lib/models/docx/import-docx-project";
import { rebuildIndexes as rebuildScrivener } from "../../src/lib/models/scrivener/import-scrivener-project";

describe.each([
  ["docx", rebuildDocx],
  ["scrivener", rebuildScrivener],
])(
  "%s importer rebuildIndexes — writing log preservation (FR-12)",
  (_name, rebuild) => {
    const projectRoot = "/proj-import-log";
    beforeEach(() => {
      setStorageAdapter(createMemoryAdapter());
    });

    it("leaves meta/writing-log day files byte-identical", async () => {
      await appendWritingLogEntry(
        projectRoot,
        { added: 12, deleted: 3 },
        "2026-09-20T10:00:00.000Z",
      );
      const dayFile = path.join(
        projectRoot,
        "meta",
        "writing-log",
        "2026-09-20.json",
      );
      const before = await readFile(dayFile, "utf8");

      await rebuild(projectRoot);

      expect(await readFile(dayFile, "utf8")).toBe(before);
      // The rebuild really ran (it wrote its own output).
      expect(
        await readFile(
          path.join(projectRoot, "meta", "index", "mentions.json"),
          "utf8",
        ),
      ).toBeTruthy();
    });
  },
);
