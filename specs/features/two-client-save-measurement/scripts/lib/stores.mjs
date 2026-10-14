/**
 * Feature 78 harness: the store reader, the classifier and the verdict.
 *
 * The four stores of the definition (Task 1, spec FR-1), read from the
 * throwaway project on disk:
 *   1. the canonical revision's `revisions/<resource>/v-N/content.bin`;
 *   2. `resources/<resource>/content.tiptap.json`;
 *   3. `resources/<resource>/content.txt`;
 *   4. the sidecar `meta/resource-<resource>.meta.json` keys `wordCount` and
 *      `updatedAt` (and `name`).
 *
 * What is actually on disk (read from `revision.ts` `writeRevision`,
 * `revision-core.ts` `writeRevisionContent`, `tiptap-utils.ts`
 * `persistResourceContent`, and then checked against a real fixture in the
 * dry run): `content.bin` is a UTF-8 text file holding the JSON string the
 * client sent (`JSON.stringify(doc)`, compact); it is not binary. Its sibling
 * is `metadata.json` (the Revision object, pretty-printed).
 *
 * EXPECTED DERIVED FORMS (read, not run; from `syncDerivedResourceContent` and
 * `persistResourceContent`): for a saved document string `content`,
 *   content.bin        === content                                  (byte for byte)
 *   content.tiptap.json === JSON.stringify(JSON.parse(content), null, 2)
 *   content.txt        === tiptapToPlainText(JSON.parse(content))
 *   sidecar.wordCount  === countWords(content.txt)
 * `tiptapToPlainText`, `countWords` and `diffWords` below are ports (by
 * reading) of `src/lib/tiptap-text.ts`, `src/lib/word-count.ts` and
 * `src/lib/models/word-diff.ts`; they are not imported because those are
 * TypeScript modules. A port that differs from the source would show as a
 * disagreement in the dry run and the self-check cannot detect it: that is a
 * stated limit.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hostNow, normalizeWs, sha256, sleep } from "./util.mjs";

// ---------------------------------------------------------------------------
// Ports of product helpers (read, not run)
// ---------------------------------------------------------------------------

function extractTextFromNode(node) {
  let out = "";
  if (node.text) out += node.text;
  if (node.content) for (const c of node.content) out += extractTextFromNode(c);
  if (node.type === "paragraph" || node.type === "heading") out += "\n";
  return out;
}

export function tiptapToPlainText(doc) {
  return doc.content.map(extractTextFromNode).join("").replace(/\n+$/g, "");
}

export function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /\w/.test(t)).length;
}

function tokenize(text) {
  if (!text || !text.trim()) return [];
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /\w/.test(t));
}
function bag(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
function unmatched(a, b) {
  let n = 0;
  for (const [tok, count] of a) n += Math.max(0, count - (b.get(tok) ?? 0));
  return n;
}
/** Word-bag difference (word-diff.ts, read, not run). */
export function diffWords(before, after) {
  const b = bag(tokenize(before));
  const a = bag(tokenize(after));
  const added = unmatched(a, b);
  const deleted = unmatched(b, a);
  return { added, deleted, net: added - deleted };
}

/** A one-paragraph TipTap document string (compact JSON) holding `text`. */
export function docString(text) {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

/** Plain text of a saved document string, or null when it is not a TipTap doc. */
export function plainOfContent(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return tiptapToPlainText(parsed);
    }
  } catch {
    // not JSON
  }
  return null;
}

/** The expected form of every store for a saved document string (read, not run). */
export function expectedForms(content) {
  const plain = plainOfContent(content);
  if (plain === null) return null;
  return {
    contentBin: content,
    tiptapJson: JSON.stringify(JSON.parse(content), null, 2),
    txt: plain,
    wordCount: countWords(plain),
  };
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

const readText = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
const parseJson = (raw) => {
  if (raw === null) return { ok: false, error: "missing" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "parse error" };
  }
};

function listFilesRec(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRec(full));
    else out.push(full);
  }
  return out.sort();
}

/** One digest over everything the quiet check must see unchanged. */
export function snapshotDigest(projectPath, resourceId) {
  const files = [
    ...listFilesRec(path.join(projectPath, "revisions", resourceId)),
    ...listFilesRec(path.join(projectPath, "resources", resourceId)),
    ...listFilesRec(path.join(projectPath, "meta", "index")),
    ...listFilesRec(path.join(projectPath, "meta", "writing-log")),
    path.join(projectPath, "meta", `resource-${resourceId}.meta.json`),
    path.join(projectPath, "meta", "backlinks.json"),
  ];
  const lines = files.map((f) => {
    const raw = readText(f);
    return `${path.relative(projectPath, f)}:${raw === null ? "-" : sha256(raw)}`;
  });
  return sha256(lines.join("\n"));
}

/**
 * Read every store for one resource. `raw` strings stay in memory for
 * classification and are never written out; use `summarizeSnapshot`.
 */
export function readSnapshot(projectPath, resourceId) {
  const revRoot = path.join(projectPath, "revisions", resourceId);
  const revisions = [];
  const otherRevisionEntries = [];
  if (existsSync(revRoot)) {
    for (const name of readdirSync(revRoot)) {
      if (!/^v-\d+$/.test(name)) {
        otherRevisionEntries.push(name.startsWith(".tmp-") ? ".tmp-*" : name);
        continue;
      }
      const dir = path.join(revRoot, name);
      const metaParsed = parseJson(readText(path.join(dir, "metadata.json")));
      const meta = metaParsed.ok ? metaParsed.value : null;
      revisions.push({
        dir: name,
        versionNumber: Number(name.slice(2)),
        metadataParsed: metaParsed.ok,
        meta: meta && {
          isCanonical: meta.isCanonical === true,
          name: meta.metadata?.name ?? null,
          automaticSnapshot: meta.metadata?.automaticSnapshot === true,
          preserve: meta.metadata?.preserve === true,
          createdAt: meta.createdAt ?? null,
          savedAt: meta.savedAt ?? null,
          hasId: typeof meta.id === "string",
        },
        contentBin: readText(path.join(dir, "content.bin")),
      });
    }
    revisions.sort((a, b) => a.versionNumber - b.versionNumber);
  }

  const resDir = path.join(projectPath, "resources", resourceId);
  const tiptap = readText(path.join(resDir, "content.tiptap.json"));
  const txt = readText(path.join(resDir, "content.txt"));

  const sidecarRaw = readText(path.join(projectPath, "meta", `resource-${resourceId}.meta.json`));
  const sidecarParsed = parseJson(sidecarRaw);
  const sc = sidecarParsed.ok ? sidecarParsed.value : null;

  const logDir = path.join(projectPath, "meta", "writing-log");
  const writingLog = [];
  if (existsSync(logDir)) {
    for (const f of readdirSync(logDir).filter((n) => n.endsWith(".json")).sort()) {
      const parsed = parseJson(readText(path.join(logDir, f)));
      if (!parsed.ok) {
        writingLog.push({ day: f.slice(0, -5), unparseable: true, entries: [] });
        continue;
      }
      writingLog.push({ day: f.slice(0, -5), entries: parsed.value.entries ?? [] });
    }
  }

  const mentions = parseJson(readText(path.join(projectPath, "meta", "index", "mentions.json")));
  const diagnostics = parseJson(readText(path.join(projectPath, "meta", "index", "diagnostics.json")));

  return {
    resourceId,
    readAt: hostNow(),
    revisions,
    otherRevisionEntries,
    files: { tiptap, txt },
    sidecar: {
      parsed: sidecarParsed.ok,
      wordCount: sc?.wordCount ?? null,
      updatedAt: sc?.updatedAt ?? null,
      name: sc?.name ?? null,
      keys: sc ? Object.keys(sc).sort() : [],
    },
    writingLog,
    mentionRecords: mentions.ok ? (mentions.value?.[resourceId] ?? []) : null,
    diagnosticsRecord: diagnostics.ok ? (diagnostics.value?.[resourceId] ?? null) : null,
    mentionsFilePresent: mentions.ok,
    diagnosticsFilePresent: diagnostics.ok,
  };
}

/** Writing-log entries (flattened, timestamp order) at or after `sinceMs`. */
export function logEntriesSince(snapshot, sinceMs) {
  return snapshot.writingLog
    .flatMap((d) => d.entries)
    .filter((e) => Date.parse(e.timestamp) >= sinceMs)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Everything in the snapshot except document text. */
export function summarizeSnapshot(snapshot, docs = {}) {
  const hashOf = (raw) => (raw === null ? null : { bytes: Buffer.byteLength(raw), sha256: sha256(raw) });
  const labelByHash = (raw) =>
    raw === null
      ? []
      : Object.entries(docs)
          .filter(([, content]) => content === raw)
          .map(([label]) => label);
  return {
    revisions: snapshot.revisions.map((r) => ({
      dir: r.dir,
      versionNumber: r.versionNumber,
      metadataParsed: r.metadataParsed,
      ...r.meta,
      contentBin: hashOf(r.contentBin),
      contentEquals: labelByHash(r.contentBin),
    })),
    otherRevisionEntries: snapshot.otherRevisionEntries,
    contentTiptapJson: hashOf(snapshot.files.tiptap),
    contentTxt: hashOf(snapshot.files.txt),
    sidecar: snapshot.sidecar,
    writingLog: snapshot.writingLog,
    mentionsFilePresent: snapshot.mentionsFilePresent,
    mentionRecords: snapshot.mentionRecords,
    diagnosticsFilePresent: snapshot.diagnosticsFilePresent,
    diagnosticsRecord: snapshot.diagnosticsRecord,
  };
}

/** Quiet wait: no request in flight, then the digest unchanged across two reads `intervalMs` apart. */
export async function waitQuiet({ inflight = () => 0, digest, intervalMs = 1000, maxMs = 60000 }) {
  const t0 = hostNow();
  let reads = 0;
  for (;;) {
    while (inflight() > 0 && hostNow() - t0 < maxMs) await sleep(100);
    const d1 = digest();
    reads += 1;
    await sleep(intervalMs);
    const d2 = digest();
    reads += 1;
    if (d1 === d2 && inflight() === 0) {
      return { quiet: true, waitedMs: Math.round(hostNow() - t0), reads, intervalMs };
    }
    if (hostNow() - t0 > maxMs) {
      return { quiet: false, waitedMs: Math.round(hostNow() - t0), reads, intervalMs };
    }
  }
}

/** Search the project for each token with `get(path) -> {status, json}`. */
export async function searchTokens(get, projectId, tokens) {
  const out = {};
  for (const token of tokens) {
    try {
      const res = await get(`/api/project/${projectId}/search?q=${encodeURIComponent(token)}`);
      out[token] = {
        status: res.status,
        count: Array.isArray(res.json) ? res.json.length : null,
        resourceIds: Array.isArray(res.json) ? res.json.map((r) => r.resourceId) : [],
      };
    } catch (e) {
      out[token] = { error: e instanceof Error ? e.message.slice(0, 100) : "error" };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function lcp(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}
function lcs(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i += 1;
  return i;
}
const clip = (s, n = 300) => (s.length > n ? `${s.slice(0, n)}...(+${s.length - n})` : s);

function describeDiff(raw, expectedByLabel) {
  let best = null;
  for (const [label, exp] of Object.entries(expectedByLabel)) {
    const p = lcp(raw, exp);
    const s = Math.min(lcs(raw, exp), Math.min(raw.length, exp.length) - p);
    if (!best || p + s > best.p + best.s) best = { label, p, s, exp };
  }
  if (!best) return null;
  return {
    nearest: best.label,
    commonPrefixChars: best.p,
    commonSuffixChars: best.s,
    storedChars: raw.length,
    nearestChars: best.exp.length,
    storedMiddle: clip(raw.slice(best.p, raw.length - best.s)),
    nearestMiddle: clip(best.exp.slice(best.p, best.exp.length - best.s)),
  };
}

function mixHint(raw, expectedByLabel) {
  const labels = Object.keys(expectedByLabel);
  for (const x of labels) {
    for (const y of labels) {
      if (x === y) continue;
      const p = lcp(raw, expectedByLabel[x]);
      const s = lcs(raw, expectedByLabel[y]);
      if (p > 0 && s > 0 && p + s >= raw.length) {
        return `mix: first ${p} chars match ${x}, last ${s} chars match ${y}`;
      }
    }
  }
  for (const x of labels) {
    const e = expectedByLabel[x];
    if (raw.length < e.length && e.startsWith(raw)) {
      return `truncated: stored text is the first ${raw.length} of ${e.length} chars of ${x}`;
    }
  }
  return null;
}

/** Classify one store's text against the expected form for each document. */
export function classifyOne(kind, raw, expectedByLabel) {
  if (raw === null) return { status: "missing", equals: [] };
  const base = { bytes: Buffer.byteLength(raw), chars: raw.length, sha256: sha256(raw) };
  let parseable = null;
  let parsed;
  if (kind === "json") {
    try {
      parsed = JSON.parse(raw);
      parseable = parsed !== null && typeof parsed === "object" && parsed.type === "doc";
    } catch {
      parseable = false;
    }
  }
  const equals = Object.keys(expectedByLabel).filter((l) => expectedByLabel[l] === raw);
  if (equals.length) return { ...base, parseable, status: "equals", equals };
  if (kind === "json" && parseable === false) {
    return {
      ...base,
      parseable,
      status: "unparseable",
      equals: [],
      mix: mixHint(raw, expectedByLabel),
      diff: describeDiff(raw, expectedByLabel),
    };
  }
  if (kind === "json" && parsed !== undefined) {
    const parsedEqual = Object.keys(expectedByLabel).filter(
      (l) => JSON.stringify(JSON.parse(expectedByLabel[l])) === JSON.stringify(parsed),
    );
    if (parsedEqual.length) {
      return { ...base, parseable, status: "parsed-equal-bytes-differ", equals: [], parsedEqual };
    }
  }
  return {
    ...base,
    parseable,
    status: "none",
    equals: [],
    mix: mixHint(raw, expectedByLabel),
    diff: describeDiff(raw, expectedByLabel),
  };
}

/**
 * Classify every store of a snapshot against `docs` (label -> saved document
 * string, for example { base, "A#1", "B#1" }).
 */
export function classifySnapshot(snapshot, docs) {
  const exp = { contentBin: {}, tiptapJson: {}, txt: {} };
  const wc = {};
  for (const [label, content] of Object.entries(docs)) {
    const f = expectedForms(content);
    if (!f) continue;
    exp.contentBin[label] = f.contentBin;
    exp.tiptapJson[label] = f.tiptapJson;
    exp.txt[label] = f.txt;
    wc[label] = f.wordCount;
  }
  const canonical = snapshot.revisions.filter((r) => r.meta?.isCanonical === true);
  const contentBin = canonical.length
    ? classifyOne("json", canonical[0].contentBin, exp.contentBin)
    : { status: "missing", equals: [] };
  const tiptapJson = classifyOne("json", snapshot.files.tiptap, exp.tiptapJson);
  const txt = classifyOne("txt", snapshot.files.txt, exp.txt);

  const sets = [contentBin.equals, tiptapJson.equals, txt.equals];
  const held = (sets[0] ?? []).filter((l) => sets.every((s) => s.includes(l)));
  const storesAgree = held.length > 0;

  const sidecar = {
    ...snapshot.sidecar,
    wordCountMatchesDocs: Object.keys(wc).filter((l) => wc[l] === snapshot.sidecar.wordCount),
  };
  const wordCountConsistent = storesAgree
    ? held.some((l) => wc[l] === snapshot.sidecar.wordCount)
    : null;

  const revisionContents = snapshot.revisions.map((r) => {
    const c = classifyOne("json", r.contentBin, exp.contentBin);
    return {
      dir: r.dir,
      canonical: r.meta?.isCanonical === true,
      name: r.meta?.name ?? null,
      automaticSnapshot: r.meta?.automaticSnapshot === true,
      status: c.status,
      equals: c.equals,
      sha256: c.sha256,
      bytes: c.bytes,
    };
  });

  return {
    canonicalCount: canonical.length,
    contentBin,
    tiptapJson,
    txt,
    storesAgree,
    heldLabels: held,
    sidecar,
    wordCountConsistent,
    revisionContents,
    expectedWordCounts: wc,
  };
}

/** Plain-language one-line classification of each store (for the record). */
export function describeClassification(c) {
  const name = (x) =>
    x.status === "equals"
      ? `= ${x.equals.join("/")}`
      : x.status === "none" || x.status === "unparseable"
        ? `${x.status === "none" ? "NONE" : "UNPARSEABLE"}${x.mix ? ` (${x.mix})` : ""}`
        : x.status.toUpperCase();
  const lines = [
    `content.bin (canonical): ${name(c.contentBin)}`,
    `content.tiptap.json: ${name(c.tiptapJson)}`,
    `content.txt: ${name(c.txt)}`,
    `sidecar wordCount=${c.sidecar.wordCount} matches ${c.sidecar.wordCountMatchesDocs.join("/") || "no document"}; updatedAt=${c.sidecar.updatedAt}`,
    c.storesAgree ? `stores agree on ${c.heldLabels.join("/")}` : "stores disagree",
  ];
  if (c.wordCountConsistent === false) lines.push("wordCount inconsistent");
  return lines;
}

// ---------------------------------------------------------------------------
// Which save was processed last
// ---------------------------------------------------------------------------

/**
 * `saves`: successful (2xx) content saves of the repetition, each
 * { id, client, docLabel, sendT, respT, updatedAt }. `sendT` is the release time
 * for a held request. Order is taken from the server-assigned `updatedAt`
 * first; the response arrival order is checked against it; send order is
 * recorded. A tie, or a disagreement between updatedAt order and response
 * arrival order, is "order not determined".
 */
export function determineLastProcessed(saves) {
  if (saves.length === 0) {
    return { determined: false, reason: "no successful save", evidence: {} };
  }
  const byUpdated = [...saves].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const byResponse = [...saves].sort((a, b) => a.respT - b.respT);
  const bySend = [...saves].sort((a, b) => a.sendT - b.sendT);
  const evidence = {
    byUpdatedAt: byUpdated.map((s) => s.id),
    byResponseArrival: byResponse.map((s) => s.id),
    bySend: bySend.map((s) => s.id),
    updatedAtValues: byUpdated.map((s) => s.updatedAt),
  };
  if (saves.length === 1) {
    return { determined: true, last: saves[0], docLabel: saves[0].docLabel, updatedAt: saves[0].updatedAt, evidence };
  }
  const lastU = byUpdated.at(-1);
  const prevU = byUpdated.at(-2);
  const lastR = byResponse.at(-1);
  const tie = Date.parse(lastU.updatedAt) === Date.parse(prevU.updatedAt);
  if (tie) {
    return { determined: false, reason: "updatedAt tie between the last two saves", evidence };
  }
  if (lastU.id !== lastR.id) {
    return {
      determined: false,
      reason: "updatedAt order and response arrival order disagree",
      evidence,
    };
  }
  return {
    determined: true,
    last: lastU,
    docLabel: lastU.docLabel,
    updatedAt: lastU.updatedAt,
    sendOrderAgrees: bySend.at(-1).id === lastU.id,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Writing log, independently computed
// ---------------------------------------------------------------------------

/**
 * Expected word-bag entries when the saves (document strings) are processed in
 * the given order, each diffed against the previous canonical content (the
 * base first). Read from `logCanonicalSave` (read, not run): a save with
 * added 0 and deleted 0 appends nothing.
 */
export function expectedLogEntries(baseContent, contentsInOrder) {
  let prev = plainOfContent(baseContent) ?? "";
  const entries = [];
  for (const content of contentsInOrder) {
    const cur = plainOfContent(content) ?? "";
    const d = diffWords(prev, cur);
    if (d.added !== 0 || d.deleted !== 0) entries.push(d);
    prev = cur;
  }
  return entries;
}

export function compareLog(actualEntries, expectedEntries) {
  const strip = (e) => (e.skipped ? { skipped: true } : { added: e.added, deleted: e.deleted, net: e.net });
  const actual = actualEntries.map(strip);
  const same =
    actual.length === expectedEntries.length &&
    actual.every((a, i) => JSON.stringify(a) === JSON.stringify(expectedEntries[i]));
  return { match: same, actual, expected: expectedEntries };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/**
 * PASS / FAIL / UNSTABLE against the Task 1 definition.
 *
 * - A store that is not exactly one saved document (none, mixed, unparseable,
 *   missing, stores disagreeing, wordCount inconsistent) is a FAIL whatever the
 *   order.
 * - All four agree, but the order of the saves is not determined: UNSTABLE.
 * - All four hold a document that is not the last-processed one: FAIL.
 * - PASS only if all four hold exactly the last-processed document, the
 *   sidecar updatedAt is that save's own, and (when `requireReload`) both
 *   clients' texts after a reload equal that document's plain text.
 */
export function verdict({ classification: c, last, docs, reloadTexts, requireReload = true }) {
  const reasons = [];
  const flags = { reloadChecked: false };
  const fail = (r) => reasons.push(r);

  for (const [name, x] of [
    ["content.bin", c.contentBin],
    ["content.tiptap.json", c.tiptapJson],
    ["content.txt", c.txt],
  ]) {
    if (x.status === "equals") continue;
    if (x.status === "parsed-equal-bytes-differ") {
      flags.harnessSuspect = true;
      fail(`${name}: parsed document equals ${x.parsedEqual.join("/")} but bytes differ (harness expected form suspect; counted as FAIL)`);
    } else if (x.status === "unparseable") fail(`${name}: unparseable`);
    else if (x.status === "none") fail(`${name}: holds none of the documents${x.mix ? ` (${x.mix})` : ""}`);
    else fail(`${name}: ${x.status}`);
  }
  if (c.canonicalCount !== 1) fail(`canonical revisions: ${c.canonicalCount}`);
  if (reasons.length === 0 && !c.storesAgree) {
    fail(
      `stores disagree: content.bin=${c.contentBin.equals.join("/")}, content.tiptap.json=${c.tiptapJson.equals.join("/")}, content.txt=${c.txt.equals.join("/")}`,
    );
  }
  if (reasons.length === 0 && c.wordCountConsistent === false) {
    fail(`wordCount inconsistent: sidecar wordCount=${c.sidecar.wordCount}, stored document word count=${c.heldLabels.map((l) => c.expectedWordCounts[l]).join("/")}`);
  }
  if (reasons.length) return { verdict: "FAIL", reasons, flags };

  if (!last.determined) {
    return {
      verdict: "UNSTABLE",
      reasons: [`order not determined: ${last.reason}; stores agree on ${c.heldLabels.join("/")}`],
      flags,
    };
  }
  if (!c.heldLabels.includes(last.docLabel)) {
    return {
      verdict: "FAIL",
      reasons: [`stores hold ${c.heldLabels.join("/")} but the last processed save carried ${last.docLabel}`],
      flags,
    };
  }
  if (c.sidecar.updatedAt !== last.updatedAt) {
    return {
      verdict: "FAIL",
      reasons: [`sidecar updatedAt ${c.sidecar.updatedAt} is not the last processed save's updatedAt ${last.updatedAt}`],
      flags,
    };
  }
  if (requireReload) {
    flags.reloadChecked = true;
    const want = normalizeWs(plainOfContent(docs[last.docLabel]) ?? "");
    const have = reloadTexts ?? {};
    const names = Object.keys(have);
    if (names.length === 0) {
      return { verdict: "FAIL", reasons: ["reload texts were required and not provided"], flags };
    }
    for (const n of names) {
      if (normalizeWs(have[n]) !== want) fail(`client ${n} shows a different document after reload`);
    }
    if (reasons.length) return { verdict: "FAIL", reasons, flags };
  }
  return {
    verdict: "PASS",
    reasons: [`all four stores hold ${last.docLabel}, the last processed save`],
    flags,
  };
}
