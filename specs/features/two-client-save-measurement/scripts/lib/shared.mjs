/**
 * Feature 78 harness: helpers that were copied into several scenario scripts
 * and are used here once. Each function is the text of the copies it replaced;
 * only copies that were behaviourally identical were moved (a copy that
 * differed stays in its script).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { labelDocs, savesFrom } from "./clients.mjs";
import { searchFor, settleAndRead } from "./session.mjs";
import {
  compareLog,
  describeClassification,
  determineLastProcessed,
  expectedLogEntries,
  logEntriesSince,
  plainOfContent,
  verdict,
} from "./stores.mjs";
import { hostNow, isoOf } from "./util.mjs";

/** Word-bag tokens added and deleted between two plain texts (port of word-diff.ts, read, not run). */
export function wordDelta(before, after) {
  const toks = (t) => (t && t.trim() ? t.trim().split(/\s+/).filter((x) => /\w/.test(x)) : []);
  const bag = (arr) => {
    const m = new Map();
    for (const t of arr) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };
  const b = bag(toks(before));
  const a = bag(toks(after));
  const diff = (x, y) => {
    const out = [];
    for (const [t, c] of x) for (let i = 0; i < Math.max(0, c - (y.get(t) ?? 0)); i += 1) out.push(t);
    return out;
  };
  return { addedTokens: diff(a, b), deletedTokens: diff(b, a) };
}

export const snapEditors = async (A, B) => ({
  at: isoOf(hostNow()),
  A: { text: await A.editorText(), footer: await A.footer() },
  B: { text: await B.editorText(), footer: await B.footer() },
});

/** Notifications a client saw at or after `sinceT`, with offsets from `sinceT` and from the nearest earlier reload mark. */
export async function notificationsSince(client, sinceT) {
  const marks = client.marks();
  const rel = (t) => {
    const prior = marks.filter((m) => m.t <= t).at(-1);
    return { msAfterSince: Math.round(t - sinceT), msAfterReloadMark: prior ? Math.round(t - prior.t) : null };
  };
  const surfaces = (await client.surfaces(sinceT)).map((s) => ({ role: s.role, text: s.text, ...rel(s.t) }));
  const consoleMsgs = client.consoleMsgs.filter((m) => m.t >= sinceT).map((m) => ({ type: m.type, text: m.text, ...rel(m.t) }));
  const pageErrors = client.pageErrors.filter((m) => m.t >= sinceT).map((m) => ({ text: m.text, ...rel(m.t) }));
  const dialogs = client.dialogs.filter((m) => m.t >= sinceT).map((m) => ({ type: m.type, message: m.message, ...rel(m.t) }));
  const failed = client.failedRequests
    .map((f) => ({ f, req: client.requests.find((r) => r.n === f.n) }))
    .filter(({ req }) => req && req.sendT >= sinceT)
    .map(({ f, req }) => ({ method: f.method, path: client.log().find((l) => l.n === f.n)?.path, error: f.error, ...rel(req.sendT) }));
  const nonOk = client.requests
    .filter((r) => r.sendT >= sinceT && r.ok === false)
    .map((r) => ({ method: r.method, path: client.log().find((l) => l.n === r.n)?.path, status: r.status, body: r.errorBody, ...rel(r.sendT) }));
  const toastSignals = client.requests
    .filter((r) => r.method === "PATCH" && r.fields && r.respT >= sinceT)
    .map((r) => ({ n: r.n, snapshotCreated: r.fields.snapshotCreated, writingLog: r.fields.writingLog }));
  return {
    sinceAt: isoOf(sinceT),
    surfacesChecked: "role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags",
    surfaces,
    console: consoleMsgs,
    pageErrors,
    dialogs,
    failedRequests: failed,
    nonOkResponses: nonOk,
    patchResponseSignals: toastSignals,
    reloadMarks: marks.map((m) => ({ name: m.name, at: isoOf(m.t), msAfterSince: Math.round(m.t - sinceT) })),
  };
}

export function allDocs(ctx) {
  const a = labelDocs(ctx.A);
  const b = labelDocs(ctx.B);
  return { docs: { base: ctx.resource.baseContent, ...a.docs, ...b.docs }, byNA: a.byN, byNB: b.byN };
}

export function allSaves(ctx) {
  const { byNA, byNB } = allDocs(ctx);
  return [...savesFrom(ctx.A, (n) => byNA[n]), ...savesFrom(ctx.B, (n) => byNB[n])];
}

/** Names (relative paths, ids replaced by labels) under a directory; "absent" if it does not exist. */
export function namesUnder(dir, labels, cap = 200) {
  if (!existsSync(dir)) return "absent";
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      out.push(labels.apply(path.relative(dir, full)) + (e.isDirectory() ? "/" : ""));
      if (e.isDirectory() && out.length < cap) walk(full);
    }
  };
  walk(dir);
  return out.sort().slice(0, cap);
}

export function trashNames(ctx) {
  const lab = ctx.session.labels;
  return {
    projectTrash: namesUnder(path.join(ctx.resource.projectPath, ".trash"), lab),
    projectsFolderTrash: namesUnder(path.join(ctx.session.server.projectsDir, ".trash"), lab),
    note: "names only, ids replaced by labels; 'absent' means the directory does not exist",
  };
}

export async function readServerState(ctx, sinceMs, tokens) {
  const { docs } = allDocs(ctx);
  const st = await settleAndRead({ session: ctx.session, resource: ctx.resource, docs });
  const saves = allSaves(ctx);
  const last = determineLastProcessed(saves);
  const processed = [...saves].sort((x, y) => Date.parse(x.updatedAt) - Date.parse(y.updatedAt));
  const order = processed.map((s) => s.docLabel);
  const expected = expectedLogEntries(ctx.resource.baseContent, order.map((l) => docs[l]));
  const logSince = logEntriesSince(st.snapshot, sinceMs);
  const cmp = compareLog(logSince, expected);
  let prev = plainOfContent(ctx.resource.baseContent) ?? "";
  const logTokens = order.map((l) => {
    const cur = plainOfContent(docs[l]) ?? "";
    const d = wordDelta(prev, cur);
    prev = cur;
    return { save: l, addedCount: d.addedTokens.length, deletedCount: d.deletedTokens.length, addedTokens: d.addedTokens, deletedTokens: d.deletedTokens };
  });
  const search = await searchFor(ctx.session, ctx.resource, tokens);
  const stepVerdict = verdict({ classification: st.classification, last, docs, requireReload: false });
  const heldPlain =
    st.classification.storesAgree && st.classification.heldLabels.length ? plainOfContent(docs[st.classification.heldLabels[0]]) : null;
  const trash = trashNames(ctx);
  return { st, saves, last, order, expected, logSince, cmp, logTokens, search, stepVerdict, heldPlain, docs, trash };
}

export const compactState = (r) => ({
  quiet: r.st.quiet,
  classification: describeClassification(r.st.classification),
  allFourAgree: r.st.classification.storesAgree,
  heldLabels: r.st.classification.heldLabels,
  canonicalCount: r.st.classification.canonicalCount,
  revisions: r.st.summary.revisions,
  otherRevisionDirEntries: r.st.summary.otherRevisionEntries,
  revisionContents: r.st.classification.revisionContents,
  sidecar: r.st.summary.sidecar,
  wordCountMatchesDocs: r.st.classification.sidecar.wordCountMatchesDocs,
  expectedWordCounts: r.st.classification.expectedWordCounts,
  contentTiptapJson: r.st.summary.contentTiptapJson,
  contentTxt: r.st.summary.contentTxt,
  lastProcessed: r.last.determined ? { docLabel: r.last.docLabel, updatedAt: r.last.updatedAt } : { determined: false, reason: r.last.reason },
  evidence: r.last.evidence,
  writingLogActual: r.cmp.actual,
  writingLogEntryTimestamps: r.logSince.map((e) => e.timestamp),
  writingLogExpected: r.expected,
  writingLogMatchesExpected: r.cmp.match,
  writingLogTokensByProcessedSave: r.logTokens,
  search: r.search,
  trash: r.trash,
  mentionIndex: { filePresent: r.st.summary.mentionsFilePresent, recordsForResource: r.st.summary.mentionRecords },
  diagnosticsIndex: { filePresent: r.st.summary.diagnosticsFilePresent, recordForResource: r.st.summary.diagnosticsRecord },
  stepStateVerdict_informational: r.stepVerdict,
});

/** Pair each save with the writing-log entry nearest below its updatedAt (arithmetic only). */
export function pairLogEntries(entries, saves) {
  const used = new Set();
  return [...saves]
    .sort((x, y) => Date.parse(x.updatedAt) - Date.parse(y.updatedAt))
    .map((s) => {
      const cand = entries
        .map((e, i) => ({ e, i, d: Date.parse(s.updatedAt) - Date.parse(e.timestamp) }))
        .filter((x) => x.d >= 0 && !used.has(x.i))
        .sort((x, y) => x.d - y.d)[0];
      if (cand) used.add(cand.i);
      return { save: s.docLabel, updatedAt: s.updatedAt, entryTimestamp: cand?.e.timestamp ?? null, entryMinusUpdatedAtMs: cand ? -cand.d : null };
    });
}
