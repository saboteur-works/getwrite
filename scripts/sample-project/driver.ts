/**
 * Driver for `scripts/sample-project/generate.mjs` (Feature 121, Task 9; test
 * tooling, POS task_23e9c7df). It is bundled with the `cli` esbuild and run
 * with plain node by the wrapper (`experiments/task-8.md`), and builds one
 * synthetic project through the real core functions, so the output stays
 * schema-valid as the app changes. It lives beside the wrapper because the
 * task's Files name no other place for it.
 *
 * Arguments: `--out <dir> --seed <int>`, both already checked by the wrapper.
 * Every name, text and value is synthetic. Nothing is read from a real project.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

// The cores resolve the projects directory from this variable and fall back to
// `../projects` of the working directory when it is unset, so it is set before
// anything else runs.
const argv = process.argv.slice(2);
const argValue = (flag: string): string => {
  const at = argv.indexOf(flag);
  if (at < 0 || argv[at + 1] === undefined) {
    throw new Error(`driver: missing ${flag}`);
  }
  return argv[at + 1];
};
const OUT_DIR = path.resolve(argValue("--out"));
const SEED = Number(argValue("--seed"));
process.env.GETWRITE_PROJECTS_DIR = OUT_DIR;

/** Seeded generator (mulberry32), the one the organizer fixture uses. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(rand: () => number): string {
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join(
      "",
    );
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(rand() * 4)]}${hex(3)}-${hex(12)}`;
}

const rand = mulberry32(SEED);
const nextId = (): string => uuidFrom(rand);

// The cores take ids from `generateUUID`, which calls `crypto.randomUUID`;
// replacing it makes every id the cores draw follow the seed.
Object.defineProperty(globalThis.crypto, "randomUUID", {
  configurable: true,
  writable: true,
  value: () => nextId(),
});

// An EMFILE from an `fs.watch` watcher ended runs inside the command sandbox
// (`experiments/task-8.md`; what starts the watcher was not established). Only
// that error is ignored, and it is reported once on stderr.
let isWatchErrorReported = false;
process.on("uncaughtException", (error: NodeJS.ErrnoException) => {
  if (error.syscall === "watch") {
    if (!isWatchErrorReported) {
      isWatchErrorReported = true;
      process.stderr.write(`ignored a file-watch error: ${error.code}\n`);
    }
    return;
  }
  fail(error);
});

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`generate: ${message}\n`);
  process.exit(1);
}

const WORDS = (
  "river lantern harbor ember quiet winter orchard signal thread marble " +
  "window ledger copper meadow shadow compass velvet anchor whisper granite"
).split(" ");
const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)];
const sentence = (n: number): string => {
  const words = Array.from({ length: n }, () => pick(WORDS));
  return `${words[0][0].toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(" ")}.`;
};

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
  marks?: Mark[];
}
const text = (value: string, marks?: Mark[]): Node => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const para = (...children: (Node | string)[]): Node => ({
  type: "paragraph",
  content: children.map((c) => (typeof c === "string" ? text(c) : c)),
});
const marked = (value: string, annotationId: string): Node =>
  text(value, [{ type: "annotation", attrs: { id: annotationId } }]);
const doc = (...content: Node[]): { type: "doc"; content: Node[] } => ({
  type: "doc",
  content,
});
function plainOf(node: Node): string {
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(plainOf);
  return node.type === "doc" ? inner.join("\n") : inner.join("");
}
const cell = (type: "tableHeader" | "tableCell", value: string): Node => ({
  type,
  content: [para(value)],
});

// A 1 x 1 PNG and a minimal MP3 frame: the upload checks the leading bytes.
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const MP3_BYTES = Uint8Array.from([
  0x49,
  0x44,
  0x33,
  0x03,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0xff,
  0xfb,
  0x90,
  0x64,
  ...new Array<number>(48).fill(0),
]);

/** The project directory this run began writing, for cleanup on failure. */
let createdRoot: string | null = null;

async function main(): Promise<void> {
  const { createProjectFromType } =
    await import("../../frontend/src/lib/models/project-creator");
  const { loadProjectCore } =
    await import("../../frontend/src/lib/models/project-crud-core");
  const { createResourceCore, updateSidecarCore, uploadMediaResourceCore } =
    await import("../../frontend/src/lib/models/resource-crud-core");
  const { addAnnotationCore, listAnnotationsCore } =
    await import("../../frontend/src/lib/models/annotations-core");
  const { addClaimCore } =
    await import("../../frontend/src/lib/models/claims-add-core");
  const { addAttachmentCore } =
    await import("../../frontend/src/lib/models/source-attachments-core");
  const { captureToInboxCore } =
    await import("../../frontend/src/lib/models/inbox-capture-core");
  const { dispatchSavedQueryAction } =
    await import("../../frontend/src/lib/models/saved-query-dispatch-core");
  const { addField } =
    await import("../../frontend/src/lib/models/metadata-schema");
  const { shutdownIndexer } =
    await import("../../frontend/src/lib/models/indexer-queue");
  const { rebuildDerivedIndexes } =
    await import("../../frontend/src/lib/models/derived-index-rebuild");
  const { seedCompileExclusion, CAPTURE_NOT_EXCLUDED_MESSAGES } =
    await import("../../frontend/src/lib/models/saved-defaults-core");
  const { writeMergedMark } =
    await import("../../frontend/src/lib/models/merge-mark-core");
  const { listRevisions } =
    await import("../../frontend/src/lib/models/revision");

  // The directory name is the id the cores take as `projectId`; the id inside
  // `project.json` is a different one (`experiments/task-8.md`).
  const projectId = nextId();
  const projectRoot = path.join(OUT_DIR, projectId);
  if (existsSync(projectRoot) && readdirSync(projectRoot).length > 0) {
    throw new Error(`refusing to write into non-empty ${projectRoot}`);
  }

  createdRoot = projectRoot;
  const created = await createProjectFromType({
    projectRoot,
    name: "Sample project",
    spec: {
      id: "sample-project",
      name: "Sample project",
      folders: [
        { name: "Manuscript" },
        { name: "Story Elements" },
        { name: "Research" },
        { name: "Merge checks" },
      ],
      statuses: ["Idea", "Draft", "Revising", "Final"],
      subtypes: ["Scene", "Character", "Reference", "Narrative", "Variant"],
      modules: { sources: true, claims: true, citations: true, folklore: true },
    },
  });
  const topFolder = (name: string): string => {
    const f = created.folders.find((x) => x.name === name);
    if (!f) throw new Error(`folder ${name} missing`);
    return f.id;
  };
  const manuscript = topFolder("Manuscript");
  const elements = topFolder("Story Elements");
  const research = topFolder("Research");
  const mergeChecks = topFolder("Merge checks");

  const newFolder = async (name: string, folderId: string): Promise<string> =>
    (await createResourceCore(projectId, { name, type: "folder", folderId }))
      .id;
  const partOne = await newFolder("Part One", manuscript);
  const chapterOne = await newFolder("Chapter One", partOne);
  const scenes = await newFolder("Scenes", chapterOne);

  await addField(projectRoot, "builtin-document", {
    key: "genre",
    label: "Genre",
    type: "select",
    options: ["Fantasy", "Mystery", "Romance"],
  });
  await addField(projectRoot, "builtin-document", {
    key: "themes",
    label: "Themes",
    type: "multiselect",
    options: ["Loss", "Betrayal", "Home", "Memory"],
  });

  const makeText = async (
    name: string,
    folderId: string,
    body: ReturnType<typeof doc>,
    userMetadata: Record<string, string | string[]>,
    subtype?: string,
  ): Promise<string> => {
    const resource = await createResourceCore(projectId, {
      name,
      type: "text",
      folderId,
      userMetadata,
      text: { plainText: plainOf(body as Node), tiptap: body as never },
    });
    if (subtype !== undefined) {
      await updateSidecarCore(projectId, resource.id, {
        resourceSubtype: subtype,
      });
    }
    return resource.id;
  };

  // An image resource that a document shows.
  const image = await uploadMediaResourceCore(projectId, {
    fileBytes: PNG_BYTES,
    fileName: "sample-figure.png",
    mimeType: "image/png",
    fileSize: PNG_BYTES.length,
    title: "Sample figure",
    folderId: research,
  });

  // A Source with an image and an audio attachment and a text excerpt.
  const excerptMarkId = nextId();
  const sourceBody = doc(
    para(
      sentence(8),
      " ",
      marked("The lantern burned all winter.", excerptMarkId),
      " ",
      sentence(6),
    ),
  );
  const source = await createResourceCore(projectId, {
    name: "Field notes",
    type: "source",
    folderId: research,
    text: { plainText: plainOf(sourceBody), tiptap: sourceBody as never },
  });
  await updateSidecarCore(projectId, source.id, {
    resourceSubtype: "Reference",
  });
  const imageAttachment = await addAttachmentCore(projectId, source.id, {
    fileName: "map.png",
    mimeType: "image/png",
    fileBytes: PNG_BYTES,
  });
  await addAttachmentCore(projectId, source.id, {
    fileName: "interview.mp3",
    mimeType: "audio/mpeg",
    fileBytes: MP3_BYTES,
  });

  // Text documents. One carries a note, one a table and a code block, one a
  // citation and a claim; the entity document and two that mention it.
  const noteId = nextId();
  const claimId = nextId();
  const claimTwoId = nextId();
  const citationId = nextId();

  const opening = await makeText(
    "Opening scene",
    scenes,
    doc(
      para(sentence(10), " ", marked("A remembered kindness.", noteId)),
      para(sentence(12)),
      {
        type: "image",
        attrs: {
          src: `/api/resource/${image.id}/file`,
          alt: "Sample figure",
          resourceId: image.id,
        },
      },
      para("Mara Venn crossed the harbor at dusk. ", sentence(9)),
    ),
    {
      status: "Draft",
      genre: "Fantasy",
      themes: ["Loss", "Memory"],
      synopsis: sentence(7),
    },
    "Scene",
  );
  await makeText(
    "Tide table",
    chapterOne,
    doc(
      para(sentence(8)),
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableHeader", "Hour"), cell("tableHeader", "Tide")],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "06:00"), cell("tableCell", "High")],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "12:00"), cell("tableCell", "Low")],
          },
        ],
      },
      {
        type: "codeBlock",
        content: [text("const tide = lookup(hour);\nreturn tide;")],
      },
      para("The aunt Mara kept the ledger. ", sentence(7)),
    ),
    { status: "Revising", genre: "Mystery", themes: ["Betrayal"] },
    "Scene",
  );
  const claimsDoc = await makeText(
    "Harbor history",
    manuscript,
    doc(
      para(
        sentence(6),
        " ",
        marked("The harbor wall was built in a single year.", claimId),
        " ",
        marked("The ledger lists forty ships.", claimTwoId),
      ),
      para(
        "As the notes say, ",
        marked("the lantern burned all winter", citationId),
        ". ",
        sentence(8),
      ),
    ),
    { status: "Idea", genre: "Romance", themes: ["Home", "Loss", "Memory"] },
    "Scene",
  );
  const entityDoc = await makeText(
    "Mara Venn",
    elements,
    doc(para("Mara Venn keeps the harbor lantern. ", sentence(10))),
    { status: "Final", genre: "Fantasy" },
    "Character",
  );
  await updateSidecarCore(projectId, entityDoc, {
    entityKind: "character",
    aliases: ["Mara", "the cartographer"],
  });
  await makeText(
    "Second scene",
    scenes,
    doc(
      para(sentence(11)),
      para("Venn waved to the cartographer. ", sentence(6)),
    ),
    { status: "Draft", themes: ["Memory"] },
    "Scene",
  );

  // Annotations of each kind.
  await addAnnotationCore(projectId, opening, {
    id: noteId,
    body: "Check this memory against chapter three.",
    quote: "A remembered kindness.",
  });
  await addAnnotationCore(projectId, source.id, {
    id: excerptMarkId,
    body: "Useful for the harbor description.",
    quote: "The lantern burned all winter.",
    target: {
      sourceId: source.id,
      sourceName: "Field notes",
      locator: { type: "page", value: "12" },
    },
  });
  await addAnnotationCore(projectId, source.id, {
    id: nextId(),
    body: "",
    quote: "",
    target: {
      sourceId: source.id,
      attachmentId: imageAttachment.id,
      locator: { type: "page", value: "1" },
      sourceName: "Field notes",
    },
  });
  await addAnnotationCore(projectId, claimsDoc, {
    id: citationId,
    body: "",
    quote: "the lantern burned all winter",
    target: {
      sourceId: source.id,
      sourceName: "Field notes",
      locator: { type: "page", value: "12" },
    },
  });
  await addClaimCore(projectId, claimsDoc, {
    id: claimId,
    statement: "The harbor wall was built in a single year.",
    quote: "The harbor wall was built in a single year.",
    target: { sourceId: source.id, sourceName: "Field notes" },
  });
  await addClaimCore(projectId, claimsDoc, {
    id: claimTwoId,
    statement: "The ledger lists forty ships.",
    quote: "The ledger lists forty ships.",
  });

  // The Inbox, with one captured item.
  const capture = await captureToInboxCore({
    projectId,
    text: `Idea for later: ${sentence(9)}`,
    origin: "typed",
  });
  if (capture.status !== "created") {
    throw new Error(`capture was not created: ${capture.status}`);
  }

  // A smart folder.
  await dispatchSavedQueryAction(projectRoot, {
    action: "write",
    query: {
      id: nextId(),
      name: "Drafts",
      definition: { op: "eq", field: "status", value: "Draft" },
    },
  });

  // ---- Merge-specific coverage (Task 10) -----------------------------------
  // Every id below is named in the JSON line so an owner can find it.
  const longBody = (words: number): ReturnType<typeof doc> => {
    const paragraphs: Node[] = [];
    let left = words;
    while (left > 0) {
      const n = Math.min(left, 100);
      const parts: string[] = [];
      for (let i = 0; i < n; i += 10) {
        parts.push(sentence(Math.min(10, n - i)));
      }
      paragraphs.push(para(parts.join(" ")));
      left -= n;
    }
    return doc(...paragraphs);
  };

  // A cross-folder selection: three documents in three sibling folders. Tree
  // order is folder A, B, C; the selection starts with the document in C.
  const crossA = await newFolder("Cross A", mergeChecks);
  const crossB = await newFolder("Cross B", mergeChecks);
  const crossC = await newFolder("Cross C", mergeChecks);
  const crossDocA = await makeText(
    "Cross A document",
    crossA,
    doc(para(sentence(12))),
    { status: "Draft" },
  );
  const crossDocB = await makeText(
    "Cross B document",
    crossB,
    doc(para(sentence(12))),
    { status: "Draft" },
  );
  const crossDocC = await makeText(
    "Cross C document",
    crossC,
    doc(para(sentence(12))),
    { status: "Draft" },
  );

  // An absorbed document with a note, a citation and a claim, and its target.
  const absorbFolder = await newFolder("Absorb", mergeChecks);
  const absorbTarget = await makeText(
    "Absorb target",
    absorbFolder,
    doc(para(sentence(10))),
    { status: "Draft" },
  );
  const absorbNoteId = nextId();
  const absorbCitationId = nextId();
  const absorbClaimId = nextId();
  const absorbed = await makeText(
    "Absorbed with notes",
    absorbFolder,
    doc(
      para(
        sentence(6),
        " ",
        marked("A passage with a note.", absorbNoteId),
        " ",
        marked("A passage that cites the field notes.", absorbCitationId),
        " ",
        marked("A passage that makes a claim.", absorbClaimId),
      ),
    ),
    { status: "Draft" },
  );
  await addAnnotationCore(projectId, absorbed, {
    id: absorbNoteId,
    body: "A note that must travel with the passage.",
    quote: "A passage with a note.",
  });
  await addAnnotationCore(projectId, absorbed, {
    id: absorbCitationId,
    body: "",
    quote: "A passage that cites the field notes.",
    target: {
      sourceId: source.id,
      sourceName: "Field notes",
      locator: { type: "page", value: "3" },
    },
  });
  await addClaimCore(projectId, absorbed, {
    id: absorbClaimId,
    statement: "A claim that must travel with the passage.",
    quote: "A passage that makes a claim.",
  });

  // Documents whose metadata differs: status, select and multiselect values.
  const metaFolder = await newFolder("Metadata differs", mergeChecks);
  const metaDocs = [
    await makeText("Metadata one", metaFolder, doc(para(sentence(8))), {
      status: "Draft",
      genre: "Fantasy",
      themes: ["Loss", "Memory"],
    }),
    await makeText("Metadata two", metaFolder, doc(para(sentence(8))), {
      status: "Final",
      genre: "Mystery",
      themes: ["Memory", "Home"],
    }),
    await makeText("Metadata three", metaFolder, doc(para(sentence(8))), {
      status: "Revising",
      themes: ["Betrayal"],
    }),
  ];

  // A fully empty document, a target left out of compile, a target in the Inbox.
  const edgeFolder = await newFolder("Edge cases", mergeChecks);
  const emptyDocument = await makeText(
    "Empty document",
    edgeFolder,
    doc(para()),
    {},
  );
  const excludedTarget = await makeText(
    "Target left out of compile",
    edgeFolder,
    doc(para(sentence(9))),
    { status: "Draft" },
  );
  const seeded = await seedCompileExclusion(
    projectRoot,
    excludedTarget,
    CAPTURE_NOT_EXCLUDED_MESSAGES,
  );
  if (seeded.notice !== undefined) {
    throw new Error(`compile exclusion not saved: ${seeded.notice}`);
  }
  const inboxTarget = await makeText(
    "Target in the Inbox",
    capture.inboxFolderId,
    doc(para(sentence(9))),
    { status: "Idea" },
  );

  // An audio resource for refusals (the Source, entity document, folder and
  // image resource already exist above).
  const audio = await uploadMediaResourceCore(projectId, {
    fileBytes: MP3_BYTES,
    fileName: "sample-recording.mp3",
    mimeType: "audio/mpeg",
    fileSize: MP3_BYTES.length,
    title: "Sample recording",
    folderId: research,
  });

  // A document already marked as merged. No merge core exists yet, so the mark
  // is written by the real mark store with the target's existing revision id.
  const markedFolder = await newFolder("Already merged", mergeChecks);
  const markTarget = await makeText(
    "Mark target",
    markedFolder,
    doc(para(sentence(8))),
    { status: "Draft" },
  );
  const markedDocument = await makeText(
    "Already merged document",
    markedFolder,
    doc(para(sentence(8))),
    { status: "Draft" },
  );
  const targetRevisions = await listRevisions(projectRoot, markTarget);
  if (targetRevisions.length === 0) {
    throw new Error("the mark target has no revision to name");
  }
  await writeMergedMark(projectRoot, markedDocument, {
    targetDocumentId: markTarget,
    targetSnapshotRevisionId: targetRevisions[0].id,
    date: new Date().toISOString(),
  });

  // 50 further eligible documents of about 5000 words in one folder; the first
  // 2 and the first 10 are the smaller selections for the timing check.
  const timingFolder = await newFolder("Timing 50", mergeChecks);
  const timingIds: string[] = [];
  for (let i = 1; i <= 50; i += 1) {
    timingIds.push(
      await makeText(
        `Timing ${String(i).padStart(2, "0")}`,
        timingFolder,
        longBody(5000),
        { status: "Draft" },
      ),
    );
  }
  const mergeSummary = {
    crossFolder: {
      selection: [crossDocC, crossDocA, crossDocB],
      treeOrder: [crossDocA, crossDocB, crossDocC],
    },
    absorbedWithAnnotations: { id: absorbed, targetId: absorbTarget },
    metadataDiffers: metaDocs,
    emptyDocument,
    excludedTarget,
    inboxTarget,
    refusals: {
      source: source.id,
      entity: entityDoc,
      folder: scenes,
      image: image.id,
      audio: audio.id,
      marked: markedDocument,
    },
    markedDocument: { id: markedDocument, targetId: markTarget },
    timing: {
      folderId: timingFolder,
      two: timingIds.slice(0, 2),
      ten: timingIds.slice(0, 10),
      fifty: timingIds,
    },
  };

  // Saves queued index tasks; they are drained (and any watcher stopped) before
  // the from-scratch rebuild, so no write is still running when the process ends.
  await shutdownIndexer();
  await rebuildDerivedIndexes(projectRoot);

  const loaded = await loadProjectCore(projectId);
  const counts: Record<string, number> = {
    folders: loaded.folders.length,
    resources: loaded.resources.length,
  };
  for (const r of loaded.resources as { type: string }[]) {
    counts[r.type] = (counts[r.type] ?? 0) + 1;
  }
  counts.annotations = 0;
  for (const r of loaded.resources as { id: string; type: string }[]) {
    if (r.type === "text" || r.type === "source") {
      counts.annotations += (await listAnnotationsCore(projectId, r.id)).length;
    }
  }
  createdRoot = null;
  process.stdout.write(
    `${JSON.stringify({
      path: projectRoot,
      projectId,
      seed: SEED,
      counts,
      merge: mergeSummary,
    })}\n`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  // A project directory this run made is removed, so a retry is not refused.
  if (createdRoot !== null)
    rmSync(createdRoot, { recursive: true, force: true });
  fail(error);
});
