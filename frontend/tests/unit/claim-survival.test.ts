/** @vitest-environment jsdom */
/**
 * Feature 108, Task 26 (FR-18, FR-13, FR-9 never rewritten): a claim keeps its
 * marker, status, status date and Source link through copy, duplicate, paste,
 * cut, revision restore, Trash and encryption, or the operation reports it.
 * Real files and locks (an in-memory encrypted adapter for the encryption
 * cases), a real TipTap editor for the paste cases. One test per operation.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationClipboard, {
  clearLastClipboardOperation,
} from "../../components/Editor/Extensions/annotation-clipboard";
import NormalizePastedText from "../../components/Editor/Extensions/NormalizePastedText";
import AnnotationPaste, {
  type AnnotationPasteApi,
  type AnnotationPasteResult,
} from "../../components/Editor/Extensions/annotation-paste";
import { remapCopiedAnnotations } from "../../src/lib/models/annotation-copy";
import {
  addAnnotationCore,
  deleteAnnotationCore,
  listAnnotationsCore,
  reattachAnnotationCore,
  updateAnnotationCore,
} from "../../src/lib/models/annotations-core";
import { addClaimCore } from "../../src/lib/models/claims-add-core";
import { updateClaimCore } from "../../src/lib/models/claims-update-core";
import { isDetachedAnnotation } from "../../src/lib/models/excerpts";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  copyResourceCore,
  createResourceCore,
} from "../../src/lib/models/resource-crud-core";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { duplicateResource } from "../../src/lib/models/resource-templates";
import { setCanonicalRevision } from "../../src/lib/models/revision-core";
import { createRevision as createRevisionRecord } from "../../src/lib/models/revision-manager";
import { listRevisions } from "../../src/lib/models/revision";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import {
  restoreFolder,
  restoreResource,
  softDeleteFolder,
  softDeleteResource,
} from "../../src/lib/models/trash";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import {
  createKeyring,
  unlockKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { convertProject } from "../../src/lib/models/crypto/convert-project";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { __resetIndexerForTests } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { Annotation, MetadataValue } from "../../src/lib/models/types";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const A = "11111111-1111-4111-8111-111111111111";
const STATEMENT = "The bridge opened in 1932";
const OFF_LIST = "legacy-status";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let sourceId = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
const editors: Editor[] = [];

function markedDoc(ids: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "plain " },
          {
            type: "text",
            text: "noted",
            marks: ids.map((id) => ({ type: "annotation", attrs: { id } })),
          },
          { type: "text", text: " tail" },
        ],
      },
    ],
  };
}

function contentPath(id: string): string {
  return path.join(projectRoot, "resources", id, "content.tiptap.json");
}

async function makeText(withMark: boolean): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "text",
    name: "Chapter",
    text: { plainText: "plain noted tail" },
  });
  if (withMark) {
    await fs.writeFile(
      contentPath(created.id),
      JSON.stringify(markedDoc([A])),
      "utf8",
    );
  }
  return created.id;
}

/**
 * A claim with a changed status and a Source link, so the fields under test
 * are not the defaults. Returns the stored annotation.
 */
async function makeClaim(resourceId: string): Promise<Annotation> {
  await addClaimCore(projectId, resourceId, {
    id: A,
    statement: STATEMENT,
    quote: "noted",
  });
  return updateClaimCore(projectId, resourceId, A, {
    status: "verified",
    target: { sourceId },
  });
}

async function stored(resourceId: string): Promise<Annotation[]> {
  return listAnnotationsCore(projectId, resourceId);
}

/** Overwrite the stored claim's status with a value that is not on the list. */
async function setOffListStatus(resourceId: string): Promise<Annotation> {
  const sidecar = (await readSidecar(projectRoot, resourceId))!;
  const list = sidecar.annotations as unknown as Annotation[];
  const changed: Annotation[] = list.map((a) => ({
    ...a,
    claim: { ...a.claim!, status: OFF_LIST as never },
  }));
  await writeSidecar(projectRoot, resourceId, {
    ...sidecar,
    annotations: changed as unknown as MetadataValue,
  });
  return changed[0]!;
}

/** The fields FR-18 names, without the identity and timestamps. */
function claimFields(a: Annotation): Pick<Annotation, "claim" | "target"> {
  return { claim: a.claim, target: a.target };
}

beforeEach(async () => {
  clearLastClipboardOperation();
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-claim-survive-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "claim survival" })),
    "utf8",
  );
  const source = await createResourceCore(projectId, {
    type: "source",
    name: "Bridge records",
    text: { plainText: "records" },
  });
  sourceId = source.id;
});

afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

describe("copy and duplicate of a resource", () => {
  it("remapCopiedAnnotations gives a new id and keeps claim and target", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const sidecar = (await readSidecar(projectRoot, id))!;
    const out = await remapCopiedAnnotations(projectRoot, id, sidecar);
    const notes = out.annotations as unknown as Annotation[];
    expect(notes).toHaveLength(1);
    expect(notes[0]!.id).not.toBe(A);
    expect(claimFields(notes[0]!)).toEqual(claimFields(claim));
    expect(notes[0]!.body).toBe(STATEMENT);
  });

  it("duplicateResource keeps status, date and Source link under a new id, and the mark follows the new id", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const { newId } = await duplicateResource(projectRoot, id);
    const notes = await stored(newId);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.id).not.toBe(A);
    expect(claimFields(notes[0]!)).toEqual(claimFields(claim));
    const doc = await fs.readFile(contentPath(newId), "utf8");
    expect(doc).toContain(notes[0]!.id);
    expect(doc).not.toContain(A);
    expect((await stored(id))[0]!.id).toBe(A);
  });

  it("copyResourceCore keeps status, date and Source link under a new id", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const copy = await copyResourceCore(projectId, id, "Chapter copy");
    const notes = await stored(copy.id as string);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.id).not.toBe(A);
    expect(claimFields(notes[0]!)).toEqual(claimFields(claim));
  });

  it("a copy keeps a stored off-list status as stored", async () => {
    const id = await makeText(true);
    await makeClaim(id);
    const offList = await setOffListStatus(id);
    const { newId } = await duplicateResource(projectRoot, id);
    expect((await stored(newId))[0]!.claim).toEqual(offList.claim);
  });
});

describe("paste, cut and partial cut", () => {
  interface Mounted {
    editor: Editor;
    results: AnnotationPasteResult[];
    add: ReturnType<typeof vi.fn<AnnotationPasteApi["add"]>>;
    settled: () => Promise<AnnotationPasteResult>;
  }

  function mount(resourceId: string, content: JSONContent): Mounted {
    const results: AnnotationPasteResult[] = [];
    let wake: (() => void) | null = null;
    const add = vi.fn<AnnotationPasteApi["add"]>(addAnnotationCore);
    const api: AnnotationPasteApi = { list: listAnnotationsCore, add };
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        ...baseSchemaExtensions,
        NormalizePastedText.configure({ bodyFontSize: undefined }),
        AnnotationClipboard.configure({ getResourceId: () => resourceId }),
        AnnotationPaste.configure({
          getResourceId: () => resourceId,
          getProjectId: () => projectId,
          api,
          onResult: (result) => {
            results.push(result);
            wake?.();
          },
        }),
      ],
      content,
    });
    editors.push(editor);
    return {
      editor,
      results,
      add,
      settled: () =>
        results.length > 0
          ? Promise.resolve(results[results.length - 1]!)
          : new Promise((resolve) => {
              wake = () => resolve(results[results.length - 1]!);
            }),
    };
  }

  const emptyDoc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };

  function select(editor: Editor, from: number, to: number): void {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, from, to),
      ),
    );
  }

  function take(m: Mounted, kind: "cut" | "copy", from = 7, to = 12): string {
    select(m.editor, from, to);
    const html = m.editor.view.serializeForClipboard(
      m.editor.state.selection.content(),
    ).dom.innerHTML;
    vi.useFakeTimers();
    try {
      m.editor.view.dom.dispatchEvent(
        new Event(kind, { bubbles: true, cancelable: true }),
      );
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
    return html;
  }

  function paste(m: Mounted, html: string): void {
    const end = m.editor.state.doc.content.size - 1;
    select(m.editor, end, end);
    m.editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
  }

  function ids(editor: Editor): string[] {
    const found: string[] = [];
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "annotation")
          found.push(mark.attrs.id as string);
      }
    });
    return found;
  }

  async function sidecarText(id: string): Promise<string> {
    return fs.readFile(
      path.join(projectRoot, "meta", `resource-${id}.meta.json`),
      "utf8",
    );
  }

  it("a copy pasted in the same resource has a new id and keeps status, date and Source link", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const m = mount(id, markedDoc([A]));
    paste(m, take(m, "copy"));
    expect(await m.settled()).toEqual({ ok: true });
    const notes = await stored(id);
    expect(notes).toHaveLength(2);
    const fresh = notes.find((a) => a.id !== A)!;
    expect(claimFields(fresh)).toEqual(claimFields(claim));
    expect(fresh.body).toBe(STATEMENT);
    expect(claimFields(notes.find((a) => a.id === A)!)).toEqual(
      claimFields(claim),
    );
  });

  it("a copy pasted into another resource has a new id and keeps status, date and Source link", async () => {
    const from = await makeText(true);
    const to = await makeText(false);
    const claim = await makeClaim(from);
    const src = mount(from, markedDoc([A]));
    const dst = mount(to, emptyDoc);
    paste(dst, take(src, "copy"));
    expect(await dst.settled()).toEqual({ ok: true });
    const notes = await stored(to);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.id).not.toBe(A);
    expect(claimFields(notes[0]!)).toEqual(claimFields(claim));
    expect(claimFields((await stored(from))[0]!)).toEqual(claimFields(claim));
  });

  it("a same-resource cut-paste keeps the id and writes nothing", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const m = mount(id, markedDoc([A]));
    const before = await sidecarText(id);
    paste(m, take(m, "cut"));
    expect(ids(m.editor)).toEqual([A]);
    expect(m.add).not.toHaveBeenCalled();
    expect(await sidecarText(id)).toBe(before);
    expect(claimFields((await stored(id))[0]!)).toEqual(claimFields(claim));
  });

  it("a cross-resource cut-paste gives the target a new id with the claim kept; the source claim stays, detached", async () => {
    const from = await makeText(true);
    const to = await makeText(false);
    const claim = await makeClaim(from);
    const src = mount(from, markedDoc([A]));
    const dst = mount(to, emptyDoc);
    paste(dst, take(src, "cut"));
    expect(await dst.settled()).toEqual({ ok: true });
    const copied = await stored(to);
    expect(copied).toHaveLength(1);
    expect(copied[0]!.id).not.toBe(A);
    expect(claimFields(copied[0]!)).toEqual(claimFields(claim));
    const left = await stored(from);
    expect(left.map((a) => a.id)).toEqual([A]);
    expect(claimFields(left[0]!)).toEqual(claimFields(claim));
    expect(isDetachedAnnotation(left[0]!, ids(src.editor).includes(A))).toBe(
      true,
    );
  });

  it("a partial cut pasted in the same resource is a copy with the claim kept; the original stays", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const m = mount(id, markedDoc([A]));
    const html = take(m, "cut", 7, 10);
    expect(ids(m.editor)).toEqual([A]);
    paste(m, html);
    expect(await m.settled()).toEqual({ ok: true });
    const notes = await stored(id);
    expect(notes).toHaveLength(2);
    const fresh = notes.find((a) => a.id !== A)!;
    expect(claimFields(fresh)).toEqual(claimFields(claim));
    expect(claimFields(notes.find((a) => a.id === A)!)).toEqual(
      claimFields(claim),
    );
  });

  it("pasting a claim whose stored status is off the list carries it as stored (OQ-11) and never rewrites the source", async () => {
    const from = await makeText(true);
    const to = await makeText(false);
    await makeClaim(from);
    const offList = await setOffListStatus(from);
    const before = await sidecarText(from);
    const src = mount(from, markedDoc([A]));
    const dst = mount(to, emptyDoc);
    paste(dst, take(src, "copy"));
    const result = await dst.settled();
    expect(result.ok).toBe(true);
    expect(ids(dst.editor)).toHaveLength(1);
    expect((await stored(to))[0]!.claim).toEqual(offList.claim);
    expect(await sidecarText(from)).toBe(before);
    expect((await stored(from))[0]!.claim).toEqual(offList.claim);
  });
});

describe("revision restore", () => {
  it("restoring a revision keeps the claim, its status, date and Source link, and its mark", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const older = await createRevisionRecord(
      projectRoot,
      id,
      JSON.stringify(markedDoc([A])),
      { isCanonical: false },
    );
    await setCanonicalRevision(projectRoot, id, older.id);
    const notes = await stored(id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(claim);
    const restored = (await listRevisions(projectRoot, id)).find(
      (r) => r.id === older.id,
    )!;
    expect(restored.isCanonical).toBe(true);
    const doc = await fs.readFile(contentPath(id), "utf8");
    expect(doc).toContain(A);
  });

  it("restoring a revision leaves a stored off-list status as stored", async () => {
    const id = await makeText(true);
    await makeClaim(id);
    const offList = await setOffListStatus(id);
    const older = await createRevisionRecord(
      projectRoot,
      id,
      JSON.stringify(markedDoc([A])),
      { isCanonical: false },
    );
    await setCanonicalRevision(projectRoot, id, older.id);
    expect((await stored(id))[0]!.claim).toEqual(offList.claim);
  });
});

describe("Trash and restore", () => {
  it("a resource sent to Trash and restored keeps the claim and its mark", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    await softDeleteResource(projectRoot, id);
    await restoreResource(projectRoot, id);
    const notes = await stored(id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(claim);
    expect(await fs.readFile(contentPath(id), "utf8")).toContain(A);
  });

  it("a folder holding the resource, trashed and restored, keeps the claim and its mark", async () => {
    const folder = createFolderResource({ name: "F" });
    await writeResourceToFile(projectRoot, folder);
    const inside = createTextResource({ name: "Inside", folderId: folder.id });
    await writeResourceToFile(projectRoot, inside);
    await fs.writeFile(
      contentPath(inside.id),
      JSON.stringify(markedDoc([A])),
      "utf8",
    );
    const claim = await makeClaim(inside.id);
    await softDeleteFolder(projectRoot, folder.id);
    await restoreFolder(projectRoot, folder.id);
    const notes = await stored(inside.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(claim);
    expect(await fs.readFile(contentPath(inside.id), "utf8")).toContain(A);
  });

  it("a restored resource keeps a stored off-list status as stored", async () => {
    const id = await makeText(true);
    await makeClaim(id);
    const offList = await setOffListStatus(id);
    await softDeleteResource(projectRoot, id);
    await restoreResource(projectRoot, id);
    expect((await stored(id))[0]!.claim).toEqual(offList.claim);
  });
});

describe("encrypting and unlocking the project", () => {
  const WORKSPACE = "/ws";
  const previousAdapter = io.getStorageAdapter();
  let base: io.StorageAdapter;
  let keyring: Keyring;
  let wrapped: Awaited<ReturnType<Keyring["addProject"]>>;
  let encProjectId: string;
  let encRoot: string;
  let ctx: StorageContext;
  let resourceId: string;
  let claim: Annotation;
  const PASSPHRASE = "correct horse battery staple";

  function contextFor(k: Keyring): StorageContext {
    return {
      tenantRoot: WORKSPACE,
      adapter: workspaceEncryptionAdapter(base, WORKSPACE, k),
      projectRoot: encRoot,
    };
  }

  beforeEach(async () => {
    __resetIndexerForTests();
    base = createMemoryAdapter();
    encProjectId = generateUUID();
    encRoot = `${WORKSPACE}/${encProjectId}`;
    await base.mkdir(encRoot, { recursive: true });
    keyring = await createKeyring(PASSPHRASE, TEST_ARGON2_PARAMS);
    wrapped = await keyring.addProject(encProjectId);
    await writeProjectMarker(encRoot, base);
    ctx = contextFor(keyring);
    resourceId = generateUUID();
    const T0 = "2026-01-01T00:00:00.000Z";
    await runInStorageContext(ctx, () =>
      writeSidecar(encRoot, resourceId, {
        id: resourceId,
        slug: "r",
        type: "text",
        name: "R",
        orderIndex: 0,
        folderId: null,
        createdAt: T0,
        updatedAt: T0,
      } as Record<string, MetadataValue>),
    );
    await runInStorageContext(ctx, () =>
      addClaimCore(encProjectId, resourceId, {
        id: A,
        statement: STATEMENT,
        quote: "noted",
      }),
    );
    claim = await runInStorageContext(ctx, () =>
      updateClaimCore(encProjectId, resourceId, A, { status: "disputed" }),
    );
  });

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  it("the claim is stored sealed, and is read back whole after the keyring is locked and unlocked", async () => {
    const file = `${encRoot}/meta/resource-${resourceId}.meta.json`;
    const raw = await base.readFile(file, "utf8");
    expect(raw).not.toContain(STATEMENT);
    expect(raw).not.toContain("disputed");
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () => readSidecar(encRoot, resourceId)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
    const reopened = await unlockKeyring(wrapped, PASSPHRASE);
    const read = await runInStorageContext(contextFor(reopened), () =>
      listAnnotationsCore(encProjectId, resourceId),
    );
    expect(read).toEqual([claim]);
  });

  it("converting a plain project to encrypted and back keeps the claim", async () => {
    const plain = createMemoryAdapter();
    const root = `${WORKSPACE}/${generateUUID()}`;
    const id = generateUUID();
    const sidecar = { id, type: "text", name: "R", annotations: [claim] };
    const file = `${root}/meta/resource-${id}.meta.json`;
    await plain.mkdir(`${root}/meta`, { recursive: true });
    await plain.writeFile(file, JSON.stringify(sidecar));
    const key = keyring.projectKey(encProjectId);
    await convertProject({
      projectRoot: root,
      direction: "encrypt",
      key,
      adapter: plain,
    });
    expect(await plain.readFile(file, "utf8").catch(() => "")).not.toContain(
      STATEMENT,
    );
    await convertProject({
      projectRoot: root,
      direction: "decrypt",
      key,
      adapter: plain,
    });
    const back = JSON.parse(await plain.readFile(file, "utf8")) as {
      annotations: Annotation[];
    };
    expect(back.annotations).toEqual([claim]);
  });

  it("an encrypted-then-unlocked claim keeps a stored off-list status as stored", async () => {
    const offList = await runInStorageContext(ctx, async () => {
      const sidecar = (await readSidecar(encRoot, resourceId))!;
      const list = sidecar.annotations as unknown as Annotation[];
      const changed = list.map((a) => ({
        ...a,
        claim: { ...a.claim!, status: OFF_LIST as never },
      }));
      await writeSidecar(encRoot, resourceId, {
        ...sidecar,
        annotations: changed as unknown as MetadataValue,
      });
      return changed[0]!;
    });
    keyring.lock();
    const reopened = await unlockKeyring(wrapped, PASSPHRASE);
    const read = await runInStorageContext(contextFor(reopened), () =>
      listAnnotationsCore(encProjectId, resourceId),
    );
    expect(read[0]!.claim).toEqual(offList.claim);
  });
});

describe("other annotation operations on a claim", () => {
  it("updateAnnotationCore keeps claim and target", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const out = await updateAnnotationCore(projectId, id, A, "new statement");
    expect(out.body).toBe("new statement");
    expect(claimFields(out)).toEqual(claimFields(claim));
    expect(claimFields((await stored(id))[0]!)).toEqual(claimFields(claim));
    expect(claim.target?.sourceId).toBe(sourceId);
  });

  it("reattachAnnotationCore keeps claim and target", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    const out = await reattachAnnotationCore(projectId, id, A, "tail");
    expect(out.quote).toBe("tail");
    expect(claimFields(out)).toEqual(claimFields(claim));
    expect(claimFields((await stored(id))[0]!)).toEqual(claimFields(claim));
  });

  it("updateAnnotationCore and reattachAnnotationCore leave a stored off-list status as stored", async () => {
    const id = await makeText(true);
    await makeClaim(id);
    const offList = await setOffListStatus(id);
    await updateAnnotationCore(projectId, id, A, "edited");
    await reattachAnnotationCore(projectId, id, A, "tail");
    expect((await stored(id))[0]!.claim).toEqual(offList.claim);
  });

  it("removing only the passage text leaves the claim stored and detached", async () => {
    const id = await makeText(true);
    const claim = await makeClaim(id);
    await fs.writeFile(contentPath(id), JSON.stringify(markedDoc([])), "utf8");
    const notes = await stored(id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(claim);
    const doc = await fs.readFile(contentPath(id), "utf8");
    expect(isDetachedAnnotation(notes[0]!, doc.includes(A))).toBe(true);
  });

  it("a claim is removed only by the existing delete", async () => {
    const id = await makeText(true);
    await makeClaim(id);
    await updateAnnotationCore(projectId, id, A, "edited");
    await reattachAnnotationCore(projectId, id, A, "tail");
    await fs.writeFile(contentPath(id), JSON.stringify(markedDoc([])), "utf8");
    expect(await stored(id)).toHaveLength(1);
    await deleteAnnotationCore(projectId, id, A);
    expect(await stored(id)).toEqual([]);
  });
});
