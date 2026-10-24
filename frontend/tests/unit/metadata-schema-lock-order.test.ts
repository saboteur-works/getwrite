import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const events: string[] = [];

vi.mock("../../src/lib/models/locks", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/locks")
  >("../../src/lib/models/locks");
  return {
    ...actual,
    acquireLock: async (key: string) => {
      const release = await actual.acquireLock(key);
      events.push("outer-acquired");
      return () => {
        events.push("outer-released");
        release();
      };
    },
  };
});

vi.mock("../../src/lib/models/io", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/io")
  >("../../src/lib/models/io");
  return {
    ...actual,
    readdir: ((...args: Parameters<typeof actual.readdir>) => {
      if (String(args[0]).endsWith(`${path.sep}meta`)) events.push("sweep");
      return actual.readdir(...args);
    }) as typeof actual.readdir,
  };
});

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import {
  changeFieldTypeWithMigration,
  renameFieldKey,
  updateFieldOptionsWithMigration,
} from "../../src/lib/models/metadata-schema";
import type { MetadataSchema } from "../../src/lib/models/types";

const GROUP_ID = "g";

async function makeTmpProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-lockorder-"));
  const schema: MetadataSchema = {
    groups: [
      {
        id: GROUP_ID,
        label: "G",
        fields: [
          { key: "pick", label: "Pick", type: "select", options: ["a"] },
          { key: "other", label: "Other", type: "text" },
        ],
      },
    ],
  };
  const proj = createProject({ name: "order" });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(
      { ...proj, config: { ...proj.config, metadataSchema: schema } },
      null,
      2,
    ),
    "utf8",
  );
  await fs.mkdir(path.join(dir, "meta"), { recursive: true });
  return dir;
}

describe("sidecar migrations run after the outer project lock is released", () => {
  beforeEach(() => {
    events.length = 0;
  });

  const cases: ReadonlyArray<[string, (dir: string) => Promise<unknown>]> = [
    ["renameFieldKey", (d) => renameFieldKey(d, GROUP_ID, "other", "renamed")],
    [
      "changeFieldTypeWithMigration",
      (d) =>
        changeFieldTypeWithMigration(d, GROUP_ID, "other", "number", [], {
          x: { action: "keep" },
        }),
    ],
    [
      "updateFieldOptionsWithMigration",
      (d) =>
        updateFieldOptionsWithMigration(d, GROUP_ID, "pick", ["x"], {
          a: { action: "keep" },
        }),
    ],
  ];

  it.each(cases)("%s", async (_name, run) => {
    const dir = await makeTmpProject();
    await run(dir);
    expect(events).toEqual(["outer-acquired", "outer-released", "sweep"]);
  });
});
