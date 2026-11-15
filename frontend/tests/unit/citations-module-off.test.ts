/**
 * Feature 116, Task 48 (FR-4, FR-6, FR-8): pins on the Citations module's
 * independence from the Sources module, on switching it off deleting nothing,
 * on citation fields staying apart from custom fields, and on citation
 * creation and storage being unchanged.
 *
 * The server-side cores never read `config.modules`; the module switch is a
 * UI gate (the sidebar section and the compile switch, pinned in
 * tests/component/citations-sources-off.test.tsx). The cases here pin what the
 * stored data does when `config.modules` is changed through
 * `setModuleEnabledCore`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import {
  mutateSidecar,
  readSidecar,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import { setModuleEnabledCore } from "../../src/lib/models/module-config-core";
import {
  readCitationFieldsCore,
  writeCitationFieldsCore,
} from "../../src/lib/models/citations-fields-core";
import {
  checkCitationsCore,
  type MissingDetailFn,
} from "../../src/lib/models/citations-precheck-core";
import {
  CITATION_FIELDS_BY_TYPE,
  CITATION_FIELDS_KEY,
  CITATION_REFERENCE_TYPES,
} from "../../src/lib/models/citations-types";
import { collectCitations } from "../../src/lib/models/citations-collect";
import {
  addAnnotationCore,
  listAnnotationsCore,
} from "../../src/lib/models/annotations-core";
import { validateAnnotationTarget } from "../../src/lib/models/annotation-validation";
import { getSchema } from "../../src/lib/models/metadata-schema";
import {
  compilePdfCore,
  registerCitationsPass,
  type CompileCitationsPass,
} from "../../src/lib/models/compile-core";
import type { CompileBody } from "../../src/lib/export/types";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const STYLE_ID = "chicago-notes-bibliography";
const BOOK = {
  referenceType: "book",
  title: "The Ledger",
  authors: [{ family: "Doe", given: "J" }],
};
/** The style stand-in: a Source needs a title. */
const NEEDS_TITLE: MissingDetailFn = (fields) =>
  fields?.title ? [] : ["title"];

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

async function makeResource(
  type: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = generateUUID();
  const sidecar: Record<string, unknown> = {
    id,
    slug: "r",
    type,
    name: type === "source" ? "Ledger" : "Chapter",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
  await writeSidecar(projectRoot, id, sidecar as Record<string, MetadataValue>);
  await fs.mkdir(path.join(projectRoot, "resources", id), { recursive: true });
  return id;
}

function citingAnnotation(sourceId: string): Record<string, unknown> {
  return {
    id: generateUUID(),
    body: "",
    quote: "a passage",
    createdAt: T0,
    updatedAt: T0,
    target: { sourceId, sourceName: "Ledger" },
  };
}

async function setModules(modules: Record<string, boolean>): Promise<void> {
  for (const [moduleId, isOn] of Object.entries(modules)) {
    await setModuleEnabledCore({ projectId, moduleId, enabled: isOn });
  }
}

/** Raw bytes of every sidecar file, by name. */
async function sidecarBytes(): Promise<Record<string, string>> {
  const dir = path.join(projectRoot, "meta");
  const out: Record<string, string> = {};
  for (const name of (await fs.readdir(dir)).sort()) {
    if (!name.startsWith("resource-")) continue;
    out[name] = await fs.readFile(path.join(dir, name), "utf8");
  }
  return out;
}

async function readProjectJson(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(projectRoot, PROJECT_FILENAME), "utf8"),
  ) as Record<string, unknown>;
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-citemod-"));
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
  registerCitationsPass(undefined);
  if (originalProjectsDir === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  }
  await removeDirRetry(batchRoot);
});

describe("independence from the Sources module (FR-4)", () => {
  it("reads sources off and citations on as two separate states", async () => {
    await setModules({ sources: false, citations: true });
    const config = (await readProjectJson()).config as {
      modules: Record<string, boolean>;
    };
    expect(isModuleEnabled(config, "sources")).toBe(false);
    expect(isModuleEnabled(config, "citations")).toBe(true);
  });

  it("with sources off and citations on, fields write and read, and the check works", async () => {
    await setModules({ sources: false, citations: true });
    const sourceId = await makeResource("source");
    const chapterId = await makeResource("text", {
      annotations: [citingAnnotation(sourceId)],
    });
    const before = await checkCitationsCore(projectId, [chapterId], {
      missingDetails: NEEDS_TITLE,
    });
    expect(before.status === "ok" && before.gaps.map((g) => g.kind)).toEqual([
      "missing-detail",
    ]);
    await writeCitationFieldsCore(projectId, sourceId, BOOK);
    expect(await readCitationFieldsCore(projectId, sourceId)).toEqual({
      kind: "fields",
      fields: BOOK,
    });
    const after = await checkCitationsCore(projectId, [chapterId], {
      missingDetails: NEEDS_TITLE,
    });
    expect(after).toMatchObject({ status: "ok", gaps: [] });
  });

  it("with sources off and citations on, a PDF compile with the option reaches the citations pass", async () => {
    await setModules({ sources: false, citations: true });
    const resourceId = await makeResource("text");
    const resDir = path.join(projectRoot, "resources", resourceId);
    await fs.writeFile(path.join(resDir, "content.txt"), "Hello world");
    await fs.writeFile(
      path.join(resDir, "content.tiptap.json"),
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      }),
    );
    const pass = vi.fn<CompileCitationsPass>(async () => ({
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }));
    registerCitationsPass(pass);
    const body = {
      projectId,
      resourceIds: [resourceId],
      resources: [{ id: resourceId, name: "Ch", type: "text" }],
      includeHeaders: true,
      projectName: "Book",
      citations: { styleId: STYLE_ID },
    } as unknown as CompileBody;
    const out = await compilePdfCore(body);
    expect(pass).toHaveBeenCalledTimes(1);
    expect(out.arrayBuffer.byteLength).toBe(3);
  });
});

describe("switching the module off keeps the data (FR-4, FR-6)", () => {
  it("rewrites no sidecar byte, and the same values read back after switching on again", async () => {
    const sourceId = await makeResource("source", {
      attachments: [],
      annotations: [],
    });
    const chapterId = await makeResource("text", {
      annotations: [citingAnnotation(sourceId)],
    });
    await setModules({ citations: true });
    await writeCitationFieldsCore(projectId, sourceId, BOOK);
    const bytesOn = await sidecarBytes();
    const checkOn = await checkCitationsCore(projectId, [chapterId], {
      missingDetails: NEEDS_TITLE,
    });

    await setModules({ citations: false });
    expect(await sidecarBytes()).toEqual(bytesOn);

    await setModules({ citations: true });
    expect(await sidecarBytes()).toEqual(bytesOn);
    expect(await readCitationFieldsCore(projectId, sourceId)).toEqual({
      kind: "fields",
      fields: BOOK,
    });
    expect(
      await checkCitationsCore(projectId, [chapterId], {
        missingDetails: NEEDS_TITLE,
      }),
    ).toEqual(checkOn);
  });

  it("changes only config.modules.citations in project.json", async () => {
    await setModules({ citations: true, sources: true });
    const on = await readProjectJson();
    await setModules({ citations: false });
    const off = await readProjectJson();
    const strip = (p: Record<string, unknown>): unknown => {
      const config = { ...(p.config as Record<string, unknown>) };
      const modules = { ...(config.modules as Record<string, boolean>) };
      delete modules.citations;
      return { ...p, config: { ...config, modules } };
    };
    expect(strip(off)).toEqual(strip(on));
    expect(
      (off.config as { modules: Record<string, boolean> }).modules,
    ).toEqual({ citations: false, sources: true });
  });
});

describe("citation fields are apart from custom fields (FR-6)", () => {
  const ALL_NAMES: string[] = [
    ...new Set(
      CITATION_REFERENCE_TYPES.flatMap((t) =>
        CITATION_FIELDS_BY_TYPE[t].map((f) => f.name),
      ),
    ),
  ];

  it("a custom field named like each citation field is untouched by a fields write", async () => {
    const userMetadata: Record<string, MetadataValue> = {};
    for (const name of ALL_NAMES) userMetadata[name] = `custom ${name}`;
    userMetadata.referenceType = "custom referenceType";
    const id = await makeResource("source", { userMetadata });
    await writeCitationFieldsCore(projectId, id, BOOK);
    const sidecar = (await readSidecar(projectRoot, id)) ?? {};
    expect(sidecar.userMetadata).toEqual(userMetadata);
    expect(sidecar[CITATION_FIELDS_KEY]).toEqual(BOOK);
  });

  it("a custom field write leaves the stored citation fields untouched", async () => {
    const id = await makeResource("source", {
      userMetadata: { title: "custom title" },
    });
    await writeCitationFieldsCore(projectId, id, BOOK);
    await mutateSidecar(projectRoot, id, (current) => ({
      ...(current as Record<string, MetadataValue>),
      userMetadata: { title: "edited custom title" },
    }));
    expect(await readCitationFieldsCore(projectId, id)).toEqual({
      kind: "fields",
      fields: BOOK,
    });
    const sidecar = (await readSidecar(projectRoot, id)) ?? {};
    expect(sidecar.userMetadata).toEqual({ title: "edited custom title" });
  });

  it("the citation fields appear in neither userMetadata nor the metadata schema", async () => {
    const id = await makeResource("source", { userMetadata: { mood: "calm" } });
    await setModules({ citations: true });
    const schemaBefore = await getSchema(projectRoot);
    await writeCitationFieldsCore(projectId, id, BOOK);
    const sidecar = (await readSidecar(projectRoot, id)) ?? {};
    const userKeys = Object.keys(
      (sidecar.userMetadata ?? {}) as Record<string, unknown>,
    );
    expect(userKeys).toEqual(["mood"]);
    expect(userKeys).not.toContain(CITATION_FIELDS_KEY);

    const schema = await getSchema(projectRoot);
    const keys = schema.groups.flatMap((g) => g.fields.map((f) => f.key));
    expect(keys).not.toContain(CITATION_FIELDS_KEY);
    expect(keys).not.toContain("referenceType");
    expect(schema).toEqual(schemaBefore);
    expect(JSON.stringify(await readProjectJson())).not.toContain(
      CITATION_FIELDS_KEY,
    );
  });
});

describe("citation creation and storage are unchanged (FR-8)", () => {
  it("validateAnnotationTarget accepts exactly the five known keys", () => {
    const id = generateUUID();
    const ok = validateAnnotationTarget({
      sourceId: id,
      attachmentId: id,
      excerptId: id,
      locator: { type: "page", value: "12" },
      sourceName: "Ledger",
    });
    expect(ok).toEqual({
      ok: true,
      value: {
        sourceId: id,
        attachmentId: id,
        excerptId: id,
        locator: { type: "page", value: "12" },
        sourceName: "Ledger",
      },
    });
  });

  it("validateAnnotationTarget still refuses a citation-field key on a target", () => {
    const id = generateUUID();
    for (const key of [CITATION_FIELDS_KEY, "referenceType", "title"]) {
      const refused = validateAnnotationTarget({ sourceId: id, [key]: "x" });
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.message).toBe(
          `An annotation target can't have a "${key}" field.`,
        );
      }
    }
  });

  it("a citation made through the annotations core stores no citation-field key and no new key", async () => {
    const sourceId = await makeResource("source");
    const chapterId = await makeResource("text", { annotations: [] });
    const stored = await addAnnotationCore(projectId, chapterId, {
      id: generateUUID(),
      body: "",
      quote: "a passage",
      target: { sourceId, sourceName: "Ledger" },
    });
    expect(Object.keys(stored).sort()).toEqual([
      "body",
      "createdAt",
      "id",
      "quote",
      "target",
      "updatedAt",
    ]);
    expect(stored.target).toEqual({ sourceId, sourceName: "Ledger" });
    const raw = JSON.stringify(
      (await readSidecar(projectRoot, chapterId)) ?? {},
    );
    expect(raw).not.toContain(CITATION_FIELDS_KEY);
  });

  it("a citation made before the module existed reads back with no migration and is checked once the Source's fields are filled in", async () => {
    // Stored exactly as an earlier build wrote it; the Source has no
    // `citationFields` key and no `config.modules.citations` entry exists.
    const sourceId = await makeResource("source");
    const annotation = citingAnnotation(sourceId);
    const chapterId = await makeResource("text", { annotations: [annotation] });
    const bytesBefore = await sidecarBytes();

    const listed = await listAnnotationsCore(projectId, chapterId);
    expect(listed).toEqual([annotation]);
    expect(await readCitationFieldsCore(projectId, sourceId)).toEqual({
      kind: "fields",
      fields: null,
    });
    const collected = collectCitations({
      resourceId: chapterId,
      included: true,
      annotations: listed,
      excerptAnnotationsBySource: {},
    });
    expect(collected.map((c) => c.sourceId)).toEqual([sourceId]);
    // Reading changed nothing on disk.
    expect(await sidecarBytes()).toEqual(bytesBefore);

    const before = await checkCitationsCore(projectId, [chapterId], {
      missingDetails: NEEDS_TITLE,
    });
    expect(before).toMatchObject({
      status: "ok",
      gaps: [{ kind: "missing-detail", sourceId, missingDetails: ["title"] }],
    });

    await writeCitationFieldsCore(projectId, sourceId, BOOK);
    const after = await checkCitationsCore(projectId, [chapterId], {
      missingDetails: NEEDS_TITLE,
    });
    expect(after).toMatchObject({ status: "ok", gaps: [] });
    // The citing resource's own sidecar is the same bytes: nothing migrated.
    const bytesAfter = await sidecarBytes();
    const chapterFile = `resource-${chapterId}.meta.json`;
    expect(bytesAfter[chapterFile]).toBe(bytesBefore[chapterFile]);
  });
});
