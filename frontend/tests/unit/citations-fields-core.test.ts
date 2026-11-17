/**
 * Feature 116, Task 17 (FR-6, FR-21, FR-22): the one core that reads and
 * writes a Source's `citationFields` through `mutateSidecar`. Survival of the
 * key through the other writers is recorded in `experiments/task-11.md`; the
 * cases here cover the new core only.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { __resetIndexerForTests } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { CITATION_FIELDS_REFUSAL } from "../../src/lib/models/citations-fields-validation";
import {
  CitationFieldsInvalidError,
  CitationFieldsNotFoundError,
  CitationFieldsResourceIdError,
  CitationFieldsSourceTypeError,
  InvalidProjectIdCoreError,
  readCitationFieldsCore,
  writeCitationFieldsCore,
} from "../../src/lib/models/citations-fields-core";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const BOOK = {
  referenceType: "book",
  title: "The Ledger",
  authors: [{ family: "Doe", given: "J" }],
};

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

async function makeResource(
  root: string,
  type: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = generateUUID();
  const sidecar: Record<string, unknown> = {
    id,
    slug: "r",
    type,
    name: "Ledger",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
  await writeSidecar(root, id, sidecar as Record<string, MetadataValue>);
  return id;
}

/** An adapter that records every path it is asked to write, rename or mkdir. */
function spyOnWrites(writes: string[]): StorageAdapter {
  const base = io.getStorageAdapter();
  return {
    ...base,
    writeFile: (p, d, e) => {
      writes.push(p);
      return base.writeFile(p, d, e);
    },
    rename: (a, b) => {
      writes.push(b);
      return base.rename(a, b);
    },
    mkdir: (p, o) => {
      writes.push(p);
      return base.mkdir(p, o);
    },
  };
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-citefields-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "cite" })),
    "utf8",
  );
});

afterEach(async () => {
  if (originalProjectsDir === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  }
  await removeDirRetry(batchRoot);
});

describe("writeCitationFieldsCore", () => {
  it("stores the validated fields under citationFields and touches no other key", async () => {
    const id = await makeResource(projectRoot, "source", {
      userMetadata: { mood: "calm" },
      attachments: [],
      annotations: [],
    });
    const before = (await readSidecar(projectRoot, id)) ?? {};
    const stored = await writeCitationFieldsCore(projectId, id, BOOK);
    expect(stored).toEqual(BOOK);
    const after = (await readSidecar(projectRoot, id)) ?? {};
    const { citationFields, ...afterRest } = after;
    expect(citationFields).toEqual(BOOK);
    expect(afterRest).toEqual(before);
  });

  it("replaces a previously stored value", async () => {
    const id = await makeResource(projectRoot, "source");
    await writeCitationFieldsCore(projectId, id, BOOK);
    await writeCitationFieldsCore(projectId, id, { referenceType: "web-page" });
    expect(await readCitationFieldsCore(projectId, id)).toEqual({
      kind: "fields",
      fields: { referenceType: "web-page" },
    });
  });

  it("validates before any lock or write: an invalid value writes nothing and uses the one refusal text", async () => {
    const id = await makeResource(projectRoot, "source");
    const writes: string[] = [];
    const base = io.getStorageAdapter();
    io.setStorageAdapter(spyOnWrites(writes));
    try {
      await expect(
        writeCitationFieldsCore(projectId, id, {
          referenceType: "book",
          bogus: "secret-client-text",
        }),
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof CitationFieldsInvalidError &&
          err.message === CITATION_FIELDS_REFUSAL &&
          !err.message.includes("secret-client-text"),
      );
    } finally {
      io.setStorageAdapter(base);
    }
    expect(writes).toEqual([]);
    expect(
      (await readSidecar(projectRoot, id))?.citationFields,
    ).toBeUndefined();
  });

  it("refuses a malformed project id and a malformed resource id", async () => {
    const id = await makeResource(projectRoot, "source");
    await expect(
      writeCitationFieldsCore("../x", id, BOOK),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      writeCitationFieldsCore(projectId, "../../etc", BOOK),
    ).rejects.toBeInstanceOf(CitationFieldsResourceIdError);
  });

  it("refuses a resource that is not a Source and writes nothing", async () => {
    const id = await makeResource(projectRoot, "text");
    await expect(
      writeCitationFieldsCore(projectId, id, BOOK),
    ).rejects.toBeInstanceOf(CitationFieldsSourceTypeError);
    expect(
      (await readSidecar(projectRoot, id))?.citationFields,
    ).toBeUndefined();
  });

  it("refuses a missing resource", async () => {
    await expect(
      writeCitationFieldsCore(projectId, generateUUID(), BOOK),
    ).rejects.toBeInstanceOf(CitationFieldsNotFoundError);
  });

  it("keeps a custom field named like a citation field unchanged and keeps citation values out of userMetadata", async () => {
    const id = await makeResource(projectRoot, "source", {
      userMetadata: { title: "custom title", date: "custom date" },
    });
    await writeCitationFieldsCore(projectId, id, {
      referenceType: "book",
      title: "Citation title",
      date: "2001-02-03",
    });
    const sidecar = (await readSidecar(projectRoot, id)) ?? {};
    expect(sidecar.userMetadata).toEqual({
      title: "custom title",
      date: "custom date",
    });
    expect((sidecar.citationFields as Record<string, unknown>).title).toBe(
      "Citation title",
    );
    expect(JSON.stringify(sidecar.userMetadata)).not.toContain(
      "Citation title",
    );
  });
});

describe("writeCitationFieldsCore: the date rule (Task 65)", () => {
  const NOW = new Date("2026-11-16T12:00:00Z");

  it.each([
    ["date", "2005-01-55"],
    ["date", "2026-13"],
    ["date", "2023-02-29"],
    ["date", "2088"],
    ["accessed", "1000-02-98"],
    ["accessed", "2026-11-18"],
  ])(
    "refuses %s %s with the one text, before any lock or write, sidecar unchanged",
    async (name, bad) => {
      const id = await makeResource(projectRoot, "source", {
        citationFields: BOOK,
      });
      const before = await fs.readFile(
        path.join(projectRoot, "meta", `resource-${id}.meta.json`),
        "utf8",
      );
      const writes: string[] = [];
      const base = io.getStorageAdapter();
      io.setStorageAdapter(spyOnWrites(writes));
      try {
        await expect(
          writeCitationFieldsCore(
            projectId,
            id,
            { referenceType: "book", [name]: bad },
            NOW,
          ),
        ).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof CitationFieldsInvalidError &&
            err.message === CITATION_FIELDS_REFUSAL &&
            !err.message.includes(bad),
        );
      } finally {
        io.setStorageAdapter(base);
      }
      expect(writes).toEqual([]);
      expect(
        await fs.readFile(
          path.join(projectRoot, "meta", `resource-${id}.meta.json`),
          "utf8",
        ),
      ).toBe(before);
    },
  );

  it("accepts a leap day, a year long ago and today at UTC+14", async () => {
    const id = await makeResource(projectRoot, "source");
    const fields = {
      referenceType: "web-page",
      date: "1000-02-08",
      accessed: "2026-11-17",
    };
    expect(await writeCitationFieldsCore(projectId, id, fields, NOW)).toEqual(
      fields,
    );
    const leap = { referenceType: "book", date: "2024-02-29" };
    expect(await writeCitationFieldsCore(projectId, id, leap, NOW)).toEqual(
      leap,
    );
  });
});

describe("readCitationFieldsCore: a stored value failing the date rule", () => {
  it("is returned as stored and a read writes nothing", async () => {
    const stored = { referenceType: "interview", date: "2005-01-55" };
    const id = await makeResource(projectRoot, "source", {
      citationFields: stored,
    });
    const file = path.join(projectRoot, "meta", `resource-${id}.meta.json`);
    const before = await fs.readFile(file, "utf8");
    const writes: string[] = [];
    const base = io.getStorageAdapter();
    io.setStorageAdapter(spyOnWrites(writes));
    try {
      expect(await readCitationFieldsCore(projectId, id)).toEqual({
        kind: "fields",
        fields: stored,
      });
    } finally {
      io.setStorageAdapter(base);
    }
    expect(writes).toEqual([]);
    expect(await fs.readFile(file, "utf8")).toBe(before);
  });
});

describe("readCitationFieldsCore", () => {
  it("returns the stored fields and writes nothing (write spy)", async () => {
    const id = await makeResource(projectRoot, "source", {
      citationFields: BOOK,
    });
    const writes: string[] = [];
    const base = io.getStorageAdapter();
    io.setStorageAdapter(spyOnWrites(writes));
    try {
      expect(await readCitationFieldsCore(projectId, id)).toEqual({
        kind: "fields",
        fields: BOOK,
      });
    } finally {
      io.setStorageAdapter(base);
    }
    expect(writes).toEqual([]);
  });

  it("returns fields null for a Source with none stored, distinct from failed", async () => {
    const id = await makeResource(projectRoot, "source");
    expect(await readCitationFieldsCore(projectId, id)).toEqual({
      kind: "fields",
      fields: null,
    });
  });

  it("returns a failed outcome, never no fields, when the sidecar cannot be read", async () => {
    const id = await makeResource(projectRoot, "source");
    await fs.writeFile(
      path.join(projectRoot, "meta", `resource-${id}.meta.json`),
      '{"secret-stored-text": ',
      "utf8",
    );
    const result = await readCitationFieldsCore(projectId, id);
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.message).not.toContain("secret-stored-text");
      expect(result.message).not.toContain(batchRoot);
    }
  });

  it("returns a failed outcome when the stored value is not valid", async () => {
    const id = await makeResource(projectRoot, "source", {
      citationFields: { referenceType: "nonsense" },
    });
    const result = await readCitationFieldsCore(projectId, id);
    expect(result.kind).toBe("failed");
  });

  it("refuses a non-Source, a missing resource and malformed ids", async () => {
    const text = await makeResource(projectRoot, "text");
    await expect(
      readCitationFieldsCore(projectId, text),
    ).rejects.toBeInstanceOf(CitationFieldsSourceTypeError);
    await expect(
      readCitationFieldsCore(projectId, generateUUID()),
    ).rejects.toBeInstanceOf(CitationFieldsNotFoundError);
    await expect(readCitationFieldsCore("../x", text)).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(
      readCitationFieldsCore(projectId, "nope"),
    ).rejects.toBeInstanceOf(CitationFieldsResourceIdError);
  });
});

describe("citations-fields-core under a StorageContext", () => {
  const previousAdapter = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  it("a hosted write touches only the signed-in tenant's project", async () => {
    const pid = generateUUID();
    const rid = generateUUID();
    async function seed(workspace: string): Promise<StorageContext> {
      const adapter = createMemoryAdapter();
      const root = `${workspace}/${pid}`;
      await adapter.mkdir(root, { recursive: true });
      await adapter.writeFile(
        `${root}/${PROJECT_FILENAME}`,
        JSON.stringify(createProject({ name: workspace })),
        "utf8",
      );
      const ctx: StorageContext = {
        tenantRoot: workspace,
        adapter,
        projectRoot: root,
      };
      await runInStorageContext(ctx, async () => {
        await writeSidecar(root, rid, {
          id: rid,
          slug: "r",
          type: "source",
          name: "S",
        } as Record<string, MetadataValue>);
      });
      return ctx;
    }
    const a = await seed("/tenant-a");
    const b = await seed("/tenant-b");
    await runInStorageContext(a, () =>
      writeCitationFieldsCore(pid, rid, { referenceType: "book", title: "A" }),
    );
    const inA = await runInStorageContext(a, () =>
      readCitationFieldsCore(pid, rid),
    );
    const inB = await runInStorageContext(b, () =>
      readCitationFieldsCore(pid, rid),
    );
    expect(inA).toEqual({
      kind: "fields",
      fields: { referenceType: "book", title: "A" },
    });
    expect(inB).toEqual({ kind: "fields", fields: null });
  });

  describe("an encrypted project", () => {
    const WORKSPACE = "/ws";
    let keyring: Keyring;
    let encProjectId: string;
    let rid: string;
    let ctx: StorageContext;

    beforeEach(async () => {
      __resetIndexerForTests();
      const base = createMemoryAdapter();
      encProjectId = generateUUID();
      const encRoot = `${WORKSPACE}/${encProjectId}`;
      await base.mkdir(encRoot, { recursive: true });
      keyring = await createKeyring(
        "correct horse battery staple",
        TEST_ARGON2_PARAMS,
      );
      await keyring.addProject(encProjectId);
      await writeProjectMarker(encRoot, base);
      ctx = {
        tenantRoot: WORKSPACE,
        adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
        projectRoot: encRoot,
      };
      await runInStorageContext(ctx, async () => {
        await io.writeFile(
          `${encRoot}/${PROJECT_FILENAME}`,
          JSON.stringify(createProject({ name: "enc" })),
          "utf8",
        );
        rid = await makeResource(encRoot, "source");
      });
    });

    it("reads and writes while unlocked", async () => {
      await runInStorageContext(ctx, () =>
        writeCitationFieldsCore(encProjectId, rid, BOOK),
      );
      const r = await runInStorageContext(ctx, () =>
        readCitationFieldsCore(encProjectId, rid),
      );
      expect(r).toEqual({ kind: "fields", fields: BOOK });
    });

    it("rethrows the locked-access error from a read and a write, never a failed outcome", async () => {
      keyring.lock();
      await expect(
        runInStorageContext(ctx, () =>
          readCitationFieldsCore(encProjectId, rid),
        ),
      ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
      await expect(
        runInStorageContext(ctx, () =>
          writeCitationFieldsCore(encProjectId, rid, BOOK),
        ),
      ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
    });
  });
});
