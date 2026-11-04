// Feature 101 Task 19 (FR-17, FR-16, OQ-11): restoring a revision (making it
// canonical) strips annotation marks that have no body, leaves bodies alone,
// and does not rewrite a document at any other time.
import { beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, readFile } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { createRevision as createRevisionRecord } from "../../src/lib/models/revision-manager";
import { setCanonicalRevision } from "../../src/lib/models/revision-core";
import { revisionDir, listRevisions } from "../../src/lib/models/revision";
import { stripBodylessAnnotationMarks } from "../../src/lib/models/annotation-mark-strip";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import type { MetadataValue } from "../../src/lib/models/types";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { sidecarPathForProject } from "../../src/lib/models/sidecar";
import { createNativeRevisionTransport } from "../../src/store/transport/native-revision-backend";

type Mark = { type: string; attrs?: Record<string, unknown> };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type Doc = {
  type: "doc";
  content: { type: "paragraph"; content: TextNode[] }[];
};

const KEPT = generateUUID();
const ORPHAN = generateUUID();
const ABSENT = generateUUID();

function annotated(id: string): Mark {
  return { type: "annotation", attrs: { id } };
}

function docWith(): Doc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain. " },
          { type: "text", text: "kept", marks: [annotated(KEPT)] },
          { type: "text", text: " and " },
          {
            type: "text",
            text: "orphan",
            marks: [{ type: "bold" }, annotated(ORPHAN)],
          },
          { type: "text", text: " end.", marks: [{ type: "italic" }] },
        ],
      },
    ],
  };
}

function annotation(id: string, body: string): Record<string, string> {
  return {
    id,
    body,
    quote: "q",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function marksOf(doc: Doc): (Mark[] | undefined)[] {
  return doc.content[0]!.content.map((n) => n.marks);
}

describe("stripBodylessAnnotationMarks", () => {
  it("removes only body-less annotation marks and keeps text and other marks", () => {
    const before = docWith();
    const snapshot = JSON.stringify(before);
    const { doc, removed } = stripBodylessAnnotationMarks(
      before,
      new Set([KEPT]),
    );
    const after = doc as Doc;
    expect(removed).toBe(1);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(tiptapToPlainText(after as never)).toBe(
      tiptapToPlainText(before as never),
    );
    expect(marksOf(after)).toEqual([
      undefined,
      [annotated(KEPT)],
      undefined,
      [{ type: "bold" }],
      [{ type: "italic" }],
    ]);
  });

  it("removes an annotation mark with no string id and returns the same doc when nothing is removed", () => {
    const odd: Doc = docWith();
    odd.content[0]!.content[0]!.marks = [{ type: "annotation" }];
    expect(stripBodylessAnnotationMarks(odd, new Set([KEPT])).removed).toBe(2);
    const clean = docWith();
    const same = stripBodylessAnnotationMarks(clean, new Set([KEPT, ORPHAN]));
    expect(same.removed).toBe(0);
    expect(same.doc).toBe(clean);
  });
});

describe("restoring a revision strips body-less annotation marks", () => {
  const projectRoot = "/proj-restore";
  let resourceId: string;

  async function revisionDoc(versionNumber: number): Promise<Doc> {
    const raw = await readFile(
      path.join(
        revisionDir(projectRoot, resourceId, versionNumber),
        "content.bin",
      ),
      "utf8",
    );
    return JSON.parse(raw) as Doc;
  }

  async function seed(
    annotations: Record<string, string>[] | undefined,
  ): Promise<void> {
    resourceId = generateUUID();
    const sidecar: Record<string, MetadataValue> = {
      id: resourceId,
      name: "r",
      type: "text",
    };
    if (annotations) {
      sidecar.annotations = annotations as unknown as MetadataValue;
    }
    await writeSidecar(projectRoot, resourceId, sidecar);
    await createRevisionRecord(
      projectRoot,
      resourceId,
      JSON.stringify(docWith()),
      { isCanonical: false },
    );
    await createRevisionRecord(projectRoot, resourceId, "{}", {
      isCanonical: true,
    });
  }

  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("drops the body-less mark, keeps text and other marks, and deletes no body", async () => {
    // KEPT has a body; ORPHAN has none; ABSENT has a body but no mark (detached).
    await seed([annotation(KEPT, "k"), annotation(ABSENT, "gone")]);
    const target = (await listRevisions(projectRoot, resourceId)).find(
      (r) => r.versionNumber === 1,
    )!;
    const beforeDoc = await revisionDoc(1);

    await setCanonicalRevision(projectRoot, resourceId, target.id);

    const afterDoc = await revisionDoc(1);
    expect(tiptapToPlainText(afterDoc as never)).toBe(
      tiptapToPlainText(beforeDoc as never),
    );
    expect(marksOf(afterDoc)).toEqual([
      undefined,
      [annotated(KEPT)],
      undefined,
      [{ type: "bold" }],
      [{ type: "italic" }],
    ]);
    const stored = (await readSidecar(projectRoot, resourceId))!;
    expect(stored.annotations).toEqual([
      annotation(KEPT, "k"),
      annotation(ABSENT, "gone"),
    ]);
  });

  it("strips every annotation mark when the sidecar has no annotations", async () => {
    await seed(undefined);
    const target = (await listRevisions(projectRoot, resourceId)).find(
      (r) => r.versionNumber === 1,
    )!;
    await setCanonicalRevision(projectRoot, resourceId, target.id);
    const afterDoc = await revisionDoc(1);
    expect(JSON.stringify(afterDoc)).not.toContain("annotation");
  });

  it("leaves a document whose marks all have bodies byte-for-byte", async () => {
    await seed([annotation(KEPT, "k"), annotation(ORPHAN, "o")]);
    const revs = await listRevisions(projectRoot, resourceId);
    const withMarks = revs.find((r) => r.versionNumber === 1)!;
    const rawBefore = await readFile(
      path.join(revisionDir(projectRoot, resourceId, 1), "content.bin"),
      "utf8",
    );
    await setCanonicalRevision(projectRoot, resourceId, withMarks.id);
    const rawAfter = await readFile(
      path.join(revisionDir(projectRoot, resourceId, 1), "content.bin"),
      "utf8",
    );
    expect(rawAfter).toBe(rawBefore);
  });

  it("does not rewrite the document at ordinary load or listing (OQ-11)", async () => {
    await seed([annotation(KEPT, "k")]);
    const rawBefore = await readFile(
      path.join(revisionDir(projectRoot, resourceId, 1), "content.bin"),
      "utf8",
    );
    await listRevisions(projectRoot, resourceId);
    await readSidecar(projectRoot, resourceId);
    const rawAfter = await readFile(
      path.join(revisionDir(projectRoot, resourceId, 1), "content.bin"),
      "utf8",
    );
    expect(rawAfter).toBe(rawBefore);
    expect(rawAfter).toContain(ORPHAN);
  });
});

describe("native transport restore behaves as the core does (FR-17)", () => {
  it("strips the body-less mark through the in-process backend", async () => {
    const projectsDir = "/projects";
    const fs = createFakeCapacitorFilesystem();
    const adapter = capacitorFsAdapter(fs);
    const projectId = generateUUID();
    const resourceId = generateUUID();
    const projectRoot = path.join(projectsDir, projectId);
    const resourceDir = path.join(projectRoot, "resources", resourceId);
    await adapter.mkdir(resourceDir, { recursive: true });
    await adapter.writeFile(
      path.join(resourceDir, "content.txt"),
      JSON.stringify(docWith()),
    );
    const sidecarPath = sidecarPathForProject(projectRoot, resourceId);
    await adapter.mkdir(path.dirname(sidecarPath), { recursive: true });
    await adapter.writeFile(
      sidecarPath,
      JSON.stringify({
        id: resourceId,
        name: "r",
        type: "text",
        annotations: [annotation(KEPT, "k"), annotation(ABSENT, "d")],
      }),
    );

    const transport = createNativeRevisionTransport({ fs, projectsDir });
    const context = { projectId, resourceId };
    const revision = await transport.create(context, "Old");
    await transport.setCanonical(context, revision.id);

    const read = await transport.read(context, revision.id);
    const restored = JSON.parse(read.content) as Doc;
    expect(marksOf(restored)).toEqual([
      undefined,
      [annotated(KEPT)],
      undefined,
      [{ type: "bold" }],
      [{ type: "italic" }],
    ]);
    const sidecar = JSON.parse(await adapter.readFile(sidecarPath, "utf8"));
    expect(sidecar.annotations).toHaveLength(2);
  });
});
