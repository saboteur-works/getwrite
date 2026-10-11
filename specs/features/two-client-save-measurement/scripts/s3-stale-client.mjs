#!/usr/bin/env node
/**
 * Feature 78, Task 4: scenario S3, stale client saves after the other. A
 * MEASUREMENT of the unchanged product; it records and does not fix. Every
 * request is host to itself, not a second-device result.
 *
 * One repetition = one fresh server, one fresh project, one fresh resource with
 * the base document `BASE alpha bravo charlie`. Both clients open R (A first,
 * then B) and the footers are read. The STALE client is then left open and
 * untouched (no input, no reload) while the OTHER client (the first saver)
 * types and saves; the stale client then types one marker and its save is
 * recorded. Six variants:
 *
 *   i    stale A, saver B: B types " B1";               A types " A1"
 *   ii   stale A, saver B: B types " B2LONG" + 40 words; A types " A1"
 *   iii  stale B, saver A: A types " A1";               B types " B1"
 *   iv   stale B, saver A: A types " A2LONG" + 40 words; B types " B1"
 *   v    stale A, saver B: B saves 3 times (" B1", " B2LONG"+40 words, " B2"),
 *        5 s or more apart; then A types "Q" (no leading space)
 *   vi   mirror of v: stale B, saver A (" A1", " A2LONG"+40 words, " A2"); B types "Q"
 *
 * After every saver save the next typing starts 5 s after the acknowledgement
 * (the stores are read inside that wait, as in S1). After the stale client's
 * save: stores read, editors read right after, at 5 s, at 30 s (no reload),
 * then both reload and are read again.
 *
 * Run OUTSIDE the command sandbox (server and Chromium). Usage:
 *   node s3-stale-client.mjs [variants=i,ii,iii,iv,v,vi] [repetitions=3]
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource, longAddition } from "./lib/fixture.mjs";
import { labelDocs, savesFrom } from "./lib/clients.mjs";
import { createRecord } from "./lib/record.mjs";
import { openSession, searchFor, settleAndRead } from "./lib/session.mjs";
import {
  compareLog,
  describeClassification,
  determineLastProcessed,
  expectedLogEntries,
  logEntriesSince,
  plainOfContent,
  verdict,
} from "./lib/stores.mjs";
import { RESULTS_DIR, errLine, hostNow, isoOf, normalizeWs, sha256, sleep } from "./lib/util.mjs";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const say = (s) => console.log(s);
const WAIT_AFTER_SAVE_MS = 5000;
const READ_AT_MS = 3500;
const LONG_WAIT_MS = 30000;

const VARIANTS = {
  i: { id: "i", stale: "A", saver: "B", saverTexts: [MARKERS.B1], staleText: MARKERS.A1, long: false, desc: "stale A, saver B (short ` B1`), stale types ` A1`" },
  ii: { id: "ii", stale: "A", saver: "B", saverTexts: [longAddition("B2LONG")], staleText: MARKERS.A1, long: true, desc: "stale A, saver B (` B2LONG` + 40 words), stale types ` A1`" },
  iii: { id: "iii", stale: "B", saver: "A", saverTexts: [MARKERS.A1], staleText: MARKERS.B1, long: false, desc: "stale B, saver A (short ` A1`), stale types ` B1`" },
  iv: { id: "iv", stale: "B", saver: "A", saverTexts: [longAddition("A2LONG")], staleText: MARKERS.B1, long: true, desc: "stale B, saver A (` A2LONG` + 40 words), stale types ` B1`" },
  v: { id: "v", stale: "A", saver: "B", saverTexts: [MARKERS.B1, longAddition("B2LONG"), MARKERS.B2], staleText: MARKERS.Q, long: true, desc: "stale A untouched while B saves 3 times (` B1`, ` B2LONG`+40 words, ` B2`), then A types `Q`" },
  vi: { id: "vi", stale: "B", saver: "A", saverTexts: [MARKERS.A1, longAddition("A2LONG"), MARKERS.A2], staleText: MARKERS.Q, long: true, desc: "stale B untouched while A saves 3 times (` A1`, ` A2LONG`+40 words, ` A2`), then B types `Q`" },
};

/** Word-bag tokens added and deleted between two plain texts (port of word-diff.ts, read, not run). */
function wordDelta(before, after) {
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

const tokensOf = (text) => (text ? text.trim().split(/\s+/).filter(Boolean) : []);
const clipList = (arr, n = 6) => (arr.length > n ? `${arr.slice(0, n).join(" ")} ...(+${arr.length - n})` : arr.join(" "));

const snapEditors = async (A, B) => ({
  at: isoOf(hostNow()),
  A: { text: await A.editorText(), footer: await A.footer() },
  B: { text: await B.editorText(), footer: await B.footer() },
});

function allDocs(ctx) {
  const a = labelDocs(ctx.A);
  const b = labelDocs(ctx.B);
  return { docs: { base: ctx.resource.baseContent, ...a.docs, ...b.docs }, byNA: a.byN, byNB: b.byN };
}
function allSaves(ctx) {
  const { byNA, byNB } = allDocs(ctx);
  return [...savesFrom(ctx.A, (n) => byNA[n]), ...savesFrom(ctx.B, (n) => byNB[n])];
}

/** Names (relative paths, ids replaced by labels) under a directory; "absent" if it does not exist. */
function namesUnder(dir, labels, cap = 200) {
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

function trashNames(ctx) {
  const lab = ctx.session.labels;
  return {
    projectTrash: namesUnder(path.join(ctx.resource.projectPath, ".trash"), lab),
    projectsFolderTrash: namesUnder(path.join(ctx.session.server.projectsDir, ".trash"), lab),
    note: "names only, ids replaced by labels; 'absent' means the directory does not exist",
  };
}

async function readServerState(ctx, sinceMs, tokens) {
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

const compactState = (r) => ({
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

function patchAnalysis(client, typings) {
  const marks = client.marks();
  return client.requests
    .filter((r) => r.method === "PATCH")
    .map((r) => {
      const prior = typings.filter((t) => t.endT <= r.sendT).at(-1);
      return {
        n: r.n,
        sendAt: isoOf(r.sendT),
        status: r.status,
        hasDocument: !!r.doc,
        markers: r.doc?.markers ?? null,
        baseWordsPresent: r.doc?.baseWordsPresent ?? null,
        listWordsPresent: r.doc?.listWordsPresent ?? null,
        note: r.note ?? null,
        msAfterLastTypingEnd: prior ? Math.round(r.sendT - prior.endT) : null,
        lastTypingStartsWith: prior ? prior.text.slice(0, 12) : null,
        afterAReloadMark: marks.some((m) => m.t < r.sendT),
      };
    });
}

async function notificationsSince(client, sinceT) {
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

/** How many of `tokens` occur as words in a document string (null if not a TipTap document). */
function countTokensIn(content, tokens) {
  const plain = content === null ? null : plainOfContent(content);
  if (plain === null) return null;
  const have = new Set(tokensOf(plain));
  return tokens.filter((t) => have.has(t)).length;
}

async function runRepetition(variant, n, total) {
  const session = await openSession({ label: `s3${variant.id}r${n}` });
  const { server, clients, labels } = session;
  const { A, B } = clients;
  const staleC = clients[variant.stale];
  const saverC = clients[variant.saver];
  const rec = createRecord({
    scenario: "s3",
    repetition: n,
    runId: session.run.runId,
    server,
    note: `S3 stale client, variant ${variant.id} (${variant.desc}), repetition ${n} of ${total}. Measurement of the unchanged product. Fresh server, project and resource.`,
  });
  const typings = { A: [], B: [] };
  const stepRecords = [];
  const out = { variant: variant.id, runId: session.run.runId, port: server.port, pid: server.pid, harnessError: null };
  const onSignal = async () => {
    await session.close().catch(() => {});
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    rec.set("variant", { id: variant.id, description: variant.desc, stale: variant.stale, saver: variant.saver, saverMarkerStrings: variant.saverTexts.map((t) => (t.length > 40 ? `${t.slice(0, 8)}... (${tokensOf(t).length} words)` : t)), staleMarkerString: variant.staleText });
    rec.set("preChecks", {
      listeners7340: session.pre.listeners7340.length ? session.pre.listeners7340 : "none",
      listeners3000: session.pre.listeners3000.length ? session.pre.listeners3000 : "none",
      chosenPort: server.port,
      chosenPortListenersBeforeStart: "none (checked immediately before start)",
      serverPidsRecorded: [...server.known.entries()].map(([pid, comm]) => ({ pid, comm })),
      browserPidsRecorded: session.browserPids.map((p) => ({ pid: p.pid, comm: p.comm })),
      clientsPaired: Object.fromEntries(Object.entries(clients).map(([k, c]) => [k, { paired: c.pairFacts.paired, deviceCookiePresent: c.pairFacts.deviceCookiePresent }])),
      throwawayRootAsserted: session.run.dir,
    });

    const project = await createFixtureProject(server, `S3${variant.id}r${n} ${session.run.runId}`, labels);
    const resource = await createFixtureResource(server, project, `Doc ${session.run.runId}`, labels, "R1");
    const ctx = { session, resource, A, B };
    const sinceMs = hostNow();
    const markerTokens = [...new Set([...variant.saverTexts, variant.staleText].flatMap((t) => tokensOf(t)).filter((t) => !/^[a-z]+$/.test(t)))];
    const searchTokensList = [...new Set([...markerTokens.map((t) => (t === "Q" ? "charlieQ" : t)), ...(variant.long ? ["harbor"] : [])])];
    rec.step("fixture created through POST /api/projects and POST /api/resource", { resourceLabel: "R1", baseContentChars: resource.baseContent.length, searchTokens: searchTokensList });

    const initial = await readServerState(ctx, sinceMs, searchTokensList);
    rec.step("initial stores read before any client opened the resource", { classification: describeClassification(initial.st.classification) });

    const openA = await A.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const openB = await B.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const afterOpen = await snapEditors(A, B);
    rec.step("both clients opened R in the real editor (A first, then B)", { openA, openB, editors: afterOpen });
    stepRecords.push({ step: 0, name: "both open R, footers", editors: afterOpen, initialSearch: initial.search });

    const plan = [
      ...variant.saverTexts.map((text, i) => ({ who: variant.saver, other: variant.stale, text, role: "saver", k: i + 1 })),
      { who: variant.stale, other: variant.saver, text: variant.staleText, role: "stale", k: 1 },
    ];
    let lastSaveAck = null;
    let staleAck = null;
    let firstSaverAck = null;
    let staleAckEditors = null;
    for (const [idx, p] of plan.entries()) {
      const typer = clients[p.who];
      const gapMs = lastSaveAck === null ? null : Math.round(hostNow() - lastSaveAck);
      const editorsBeforeTyping = await snapEditors(A, B);
      const label = p.text.length > 40 ? `${p.text.slice(0, 8)}+list` : p.text;
      rec.step(`step ${idx + 1}: ${p.who} (${p.role}) about to type '${label}'`, { msSinceLastSaveAck: gapMs, editorsBeforeTyping });
      const before = typer.okPatchCount();
      const patchesBefore = typer.requests.filter((r) => r.method === "PATCH").length;
      const typed = await typer.typeText(p.text);
      typings[p.who].push({ text: p.text, startT: typed.startT, endT: typed.endT });
      const editorAfterTyping = await typer.editorText();
      const footerAfterTyping = await typer.footer();
      const saved = await typer.waitForSaved({ afterCount: before, timeoutMs: 25000 });
      const ackT = hostNow();
      lastSaveAck = ackT;
      if (p.role === "saver" && firstSaverAck === null) firstSaverAck = ackT;
      if (p.role === "stale") staleAck = ackT;
      const right = await snapEditors(A, B);
      if (p.role === "stale") staleAckEditors = right;
      rec.step(`step ${idx + 1}: ${p.who} typed and save acknowledged`, {
        typed: { firstToLastMs: typed.firstToLastMs, delayMs: typed.delayMs, chars: p.text.length },
        editorAfterTyping,
        footerAfterTyping,
        saved,
        editorsRightAfterSave: right,
      });
      await sleep(READ_AT_MS);
      const state = await readServerState(ctx, sinceMs, searchTokensList);
      const spent = hostNow() - ackT;
      if (spent < WAIT_AFTER_SAVE_MS) await sleep(WAIT_AFTER_SAVE_MS - spent);
      const at5s = await snapEditors(A, B);
      rec.step(`step ${idx + 1}: ${WAIT_AFTER_SAVE_MS} ms after the save acknowledgement`, { editorsAt5s: at5s, msFromSaveAckToEndOfStoresRead: Math.round(spent) });
      const sentThisStep = typer.requests.filter((r) => r.method === "PATCH" && r.doc && r.sendT >= typed.startT);
      stepRecords.push({
        step: idx + 1,
        who: p.who,
        role: p.role,
        msSinceLastSaveAckWhenTypingStarted: gapMs,
        patchesSentByTyperBeforeThisTyping: patchesBefore,
        editorsBeforeTyping,
        editorsRightAfterSave: right,
        editorsAt5s: at5s,
        saved,
        sentDocument: sentThisStep.map((r) => ({ n: r.n, markers: r.doc.markers, baseWordsPresent: r.doc.baseWordsPresent, listWordsPresent: r.doc.listWordsPresent, length: r.doc.length, sha256: r.doc.sha256, status: r.status, updatedAt: r.fields?.updatedAt ?? null, snapshotCreated: r.fields?.snapshotCreated ?? null, writingLog: r.fields?.writingLog ?? null })),
        server: compactState(state),
        _state: state,
      });
    }

    const lastStep = stepRecords.at(-1);
    const remaining = LONG_WAIT_MS - (hostNow() - staleAck);
    if (remaining > 0) await sleep(remaining);
    const at30 = await snapEditors(A, B);
    rec.step("30 s after the stale client's save acknowledgement, no reload (b)", { msSinceStaleSaveAck: Math.round(hostNow() - staleAck), editors: at30 });

    const reloadA = await A.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const reloadB = await B.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const afterReload = await snapEditors(A, B);
    rec.step("both reloaded (page reload, then reopen) (c)", { reloadA, reloadB, editors: afterReload });
    const final = await readServerState(ctx, sinceMs, searchTokensList);
    const reloadTexts = { A: afterReload.A.text, B: afterReload.B.text };
    const finalVerdict = verdict({ classification: final.st.classification, last: final.last, docs: final.docs, reloadTexts, requireReload: true });
    rec.step("final stores read after reload", { classification: describeClassification(final.st.classification) });

    // ---- derived facts ----------------------------------------------------
    const steps = stepRecords.filter((s) => s.step >= 1);
    const saverSteps = steps.filter((s) => s.role === "saver");
    const staleStep = steps.at(-1);
    const saverDocLabels = Object.keys(final.docs).filter((l) => l.startsWith(`${variant.saver}#`));
    const staleDocLabels = Object.keys(final.docs).filter((l) => l.startsWith(`${variant.stale}#`));
    const saverFinalLabel = saverDocLabels.at(-1);
    const staleLabel = staleDocLabels.at(-1);
    const saverFinalTokens = tokensOf(plainOfContent(final.docs[saverFinalLabel]) ?? "");
    const staleTokens = new Set(tokensOf(plainOfContent(final.docs[staleLabel]) ?? ""));
    const lostTokens = [...new Set(saverFinalTokens.filter((t) => !staleTokens.has(t)))];
    const saverOnlyMarkerTokens = lostTokens.filter((t) => markerTokens.includes(t));
    const stalePlainSent = plainOfContent(final.docs[staleLabel]) ?? "";
    const staleSave = staleStep.sentDocument[0] ?? { markers: [], listWordsPresent: null, snapshotCreated: null };

    const where = (state) => {
      const snap = state.st.snapshot;
      return {
        lostTokenCount: lostTokens.length,
        lostTokens: clipList(lostTokens, 8),
        canonicalContentBin: countTokensIn(snap.revisions.find((r) => r.meta?.isCanonical)?.contentBin ?? null, lostTokens),
        contentTiptapJson: countTokensIn(snap.files.tiptap, lostTokens),
        contentTxt: snap.files.txt === null ? null : lostTokens.filter((t) => new Set(tokensOf(snap.files.txt)).has(t)).length,
        nonCanonicalRevisions: snap.revisions
          .filter((r) => !r.meta?.isCanonical)
          .map((r) => ({ dir: r.dir, name: r.meta?.name ?? null, automaticSnapshot: r.meta?.automaticSnapshot ?? null, lostTokensPresent: countTokensIn(r.contentBin, lostTokens) })),
      };
    };
    const classifyRevisions = (state) =>
      state.st.classification.revisionContents.map((r) => ({
        dir: r.dir,
        canonical: r.canonical,
        name: r.name,
        automaticSnapshot: r.automaticSnapshot,
        contains: r.status === "equals" ? `= ${r.equals.join("/")}` : r.status === "none" ? "NONE of the documents the harness holds" : r.status,
      }));
    const editorVsServer = (snap, rr) => {
      const sp = rr.heldPlain;
      return {
        serverHolds: rr.st.classification.heldLabels,
        A_editorEqualsServerText: sp === null ? null : normalizeWs(snap.A.text) === normalizeWs(sp),
        B_editorEqualsServerText: sp === null ? null : normalizeWs(snap.B.text) === normalizeWs(sp),
      };
    };
    const saverOwn = (snap) => snap[variant.saver];
    const staleOwn = (snap) => snap[variant.stale];

    // ---- outcomes ---------------------------------------------------------
    rec.outcome(1, {
      onDiskNames: "revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json; .trash names listed",
      initial: compactState(initial),
      afterEachStep: Object.fromEntries(steps.map((s) => [`step${s.step}_${s.who}_${s.role}`, s.server])),
      afterReload: compactState(final),
    });
    rec.outcome(2, {
      note: "(a) immediately after the save was acknowledged; (5 s) just before the next client typed; (b) 30 s after the STALE client's save (no reload); (c) after reload.",
      step0_bothOpen: afterOpen,
      steps: Object.fromEntries(steps.map((s) => [`step${s.step}_${s.who}_${s.role}`, { editorsBeforeTyping: s.editorsBeforeTyping, editorsRightAfterSave: s.editorsRightAfterSave, editorsAt5s: s.editorsAt5s, vsServerRightAfter: editorVsServer(s.editorsRightAfterSave, s._state), vsServerAt5s: editorVsServer(s.editorsAt5s, s._state) }])),
      at30sAfterStaleSave_noReload: at30,
      vsServerAt30s: editorVsServer(at30, lastStep._state),
      afterReload,
      vsServerAfterReload: editorVsServer(afterReload, final),
    });
    const notifStale = await notificationsSince(staleC, firstSaverAck ?? hostNow());
    const notifSaver = await notificationsSince(saverC, staleAck ?? hostNow());
    rec.outcome(3, { [`${variant.stale}_stale_sinceFirstSaverSave`]: notifStale, [`${variant.saver}_saver_sinceStaleSave`]: notifSaver });
    const patchesStale = patchAnalysis(staleC, typings[variant.stale]);
    const patchesSaver = patchAnalysis(saverC, typings[variant.saver]);
    rec.outcome(4, {
      note: "established from outcome 1 (which document each store held after the stale client's save) and the PATCH log (markers in each sent document)",
      staleClientDocumentSent: staleStep.sentDocument.map((d) => ({ markers: d.markers, baseWordsPresent: d.baseWordsPresent, listWordsPresent: d.listWordsPresent, length: d.length })),
      staleSaveEndsWithCharlieQ: stalePlainSent.endsWith("charlieQ"),
      saverTextTokensNotInStaleDocument: lostTokens.length,
      saverMarkerTokensInStaleDocument: saverOnlyMarkerTokens.filter((t) => staleTokens.has(t)),
      staleSaveContainsFirstSaverText_byRequestMarkers: staleSave.markers.filter((m) => saverOnlyMarkerTokens.includes(m)),
      staleSaveContainsFirstSaverListWords: staleSave.listWordsPresent,
      storesHeldAfterStaleSave: staleStep.server.heldLabels,
      saverMarkerTokensInServerPlainAfterStaleSave: saverOnlyMarkerTokens.filter((t) => new Set(tokensOf(staleStep._state.heldPlain ?? "")).has(t)),
      stalePatchesSentBeforeItsTyping: staleStep.patchesSentByTyperBeforeThisTyping,
      staleEditorTextAtTypingStart: staleStep.editorsBeforeTyping[variant.stale].text,
      saverEditorTextAtStaleTypingStart: staleStep.editorsBeforeTyping[variant.saver].text,
      everyPatchSentByStale: patchesStale,
      everyPatchSentBySaver: patchesSaver,
    });
    rec.outcome(5, {
      afterEachStep: Object.fromEntries(
        steps.map((s) => [`step${s.step}_${s.who}_${s.role}`, { revisions: classifyRevisions(s._state), writingLogActual: s.server.writingLogActual, writingLogExpected: s.server.writingLogExpected, writingLogMatchesExpected: s.server.writingLogMatchesExpected, tokensByProcessedSave: s.server.writingLogTokensByProcessedSave, search: s.server.search, sidecarWordCount: s.server.sidecar.wordCount, expectedWordCounts: s.server.expectedWordCounts, mentionIndex: s.server.mentionIndex, diagnosticsIndex: s.server.diagnosticsIndex }]),
      ),
      afterReload: { revisions: classifyRevisions(final), writingLogActual: final.cmp.actual, writingLogExpected: final.expected, writingLogMatchesExpected: final.cmp.match, search: final.search, mentionIndex: { filePresent: final.st.summary.mentionsFilePresent, recordsForResource: final.st.summary.mentionRecords }, diagnosticsIndex: { filePresent: final.st.summary.diagnosticsFilePresent, recordForResource: final.st.summary.diagnosticsRecord } },
      indexesComparedToPlainText: "not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed",
    });
    const failedStale = staleC.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const failedSaver = saverC.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const notFound404 = [...failedStale, ...failedSaver].filter((f) => f.status === 404);
    rec.outcome(6, {
      failedSavesStale: failedStale,
      failedSavesSaver: failedSaver,
      result: failedStale.length + failedSaver.length === 0 ? "no failed save" : "see list",
      pointerIf404: notFound404.length ? "A 404 save response was recorded. Pointer, no cause stated: Feature 77 FR-37 record and the lead's POS note of 2026-10-10." : "no 404 save response",
    });

    const saves = allSaves(ctx);
    rec.verdictInputs({
      saves: saves.map((s) => ({ id: s.id, docLabel: s.docLabel, updatedAt: s.updatedAt, sendT: s.sendT, respT: s.respT })),
      lastProcessed: final.last.determined ? { docLabel: final.last.docLabel, updatedAt: final.last.updatedAt } : { determined: false, reason: final.last.reason },
      evidence: final.last.evidence,
      sendOrderAgreesWithUpdatedAt: final.last.sendOrderAgrees ?? null,
      documentHashes: Object.fromEntries(Object.entries(final.docs).map(([k, v]) => [k, sha256(v)])),
      requireReload: true,
      reloadTexts,
    });
    rec.verdict(finalVerdict);

    // ---- findings (raw observations, no verdict) --------------------------
    const backupRevs = final.st.snapshot.revisions.filter((r) => r.meta?.automaticSnapshot === true);
    rec.finding("a_stale_editor_replaced_other_text_on_a_keystroke", {
      staleClientDocumentMarkers: staleStep.sentDocument.map((d) => d.markers),
      saverTokensNotInStaleDocument: lostTokens.length,
      storesHeldAfterStaleSave: staleStep.server.heldLabels,
      saverTokensStillInServerPlainAfterStaleSave: lostTokens.filter((t) => new Set(tokensOf(staleStep._state.heldPlain ?? "")).has(t)).length,
      varied: `which client is stale; saver addition ${variant.long ? "long" : "short"}; number of saver saves ${variant.saverTexts.length}`,
    });
    rec.finding("b_saves_sent_with_no_typing", {
      patchesStale: patchesStale.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      patchesSaver: patchesSaver.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      stalePatchesBeforeItsOwnTyping: staleStep.patchesSentByTyperBeforeThisTyping,
      typingActions: { stale: typings[variant.stale].map((t) => (t.text.length > 40 ? `${t.text.slice(0, 8)}+list` : t.text)), saver: typings[variant.saver].map((t) => (t.text.length > 40 ? `${t.text.slice(0, 8)}+list` : t.text)) },
    });
    rec.finding("c_overwritten_device_told_anything", { saver_overwritten_sinceStaleSave: notifSaver, stale_sinceFirstSaverSave: notifStale, note: "full lists in outcome 3; surfaces named there" });
    rec.finding("d_overwritten_text_recoverable", {
      lostTokens: clipList(lostTokens, 8),
      lostTokenCount: lostTokens.length,
      afterStaleSave: { locations: where(staleStep._state), revisions: classifyRevisions(staleStep._state), trash: staleStep._state.trash },
      afterReload: { locations: where(final), revisions: classifyRevisions(final), trash: final.trash },
      autoBackupRevisionsAfterReload: backupRevs.map((r) => ({ dir: r.dir, name: r.meta.name, automaticSnapshot: r.meta.automaticSnapshot, isCanonical: r.meta.isCanonical })),
      staleSaveResponseSnapshotCreated: staleSave.snapshotCreated,
      noRecoverableCopyAmongLocationsRead:
        where(final).nonCanonicalRevisions.every((r) => !r.lostTokensPresent) && !where(final).canonicalContentBin && !where(final).contentTxt,
      locationsNotLooked: "browser storage and caches, the server's memory and logs, the writer's other devices",
    });
    rec.finding("e_overwritten_editor_shows_text_the_server_no_longer_holds", {
      saverEditorEqualsServerRightAfterStaleSave: normalizeWs(saverOwn(staleAckEditors).text) === normalizeWs(staleStep._state.heldPlain ?? ""),
      saverEditorTextRightAfterStaleSave_tokens: tokensOf(saverOwn(staleAckEditors).text).length,
      saverEditorAt5s_equalsServer: normalizeWs(saverOwn(staleStep.editorsAt5s).text) === normalizeWs(staleStep._state.heldPlain ?? ""),
      saverEditorAt30s_noReload_equalsServer: normalizeWs(saverOwn(at30).text) === normalizeWs(staleStep._state.heldPlain ?? ""),
      saverEditorAfterReload_equalsServer: normalizeWs(saverOwn(afterReload).text) === normalizeWs(final.heldPlain ?? ""),
      staleEditorEqualsServerRightAfterOwnSave: normalizeWs(staleOwn(staleAckEditors).text) === normalizeWs(staleStep._state.heldPlain ?? ""),
      saverEditorFooterAt30s: saverOwn(at30).footer,
      staleEditorFooterAt30s: staleOwn(at30).footer,
    });
    rec.finding("f_writing_log_effect", {
      actual: staleStep.server.writingLogActual,
      expected: staleStep.server.writingLogExpected,
      tokensByProcessedSave: staleStep.server.writingLogTokensByProcessedSave.map((t) => ({ save: t.save, addedCount: t.addedCount, deletedCount: t.deletedCount, deletedTokens: clipList(t.deletedTokens, 8), addedTokens: clipList(t.addedTokens, 8) })),
      matchesExpected: staleStep.server.writingLogMatchesExpected,
    });
    rec.finding("g_failed_save_on_the_device_the_writer_believes_is_last", { failedSavesStale: failedStale, failedSavesSaver: failedSaver, result: failedStale.length + failedSaver.length === 0 ? "none" : "see list" });

    rec.set("backupCondition_readNotRun", "revision-core.ts snapshotBeforeDestructiveWrite -> content-loss.ts isDestructiveContentChange(previous, incoming): snapshot only if previous word count > 0 AND (incoming has 0 words OR (previous - incoming >= MIN_WORDS_LOST = 10 AND incoming <= previous * DESTRUCTIVE_SURVIVING_RATIO = 0.5)); the snapshot is a non-canonical revision named 'Auto-backup before large deletion' (automaticSnapshot true) holding the PREVIOUS canonical content. Read, not run. The constants are labelled CHOSEN, NOT MEASURED in the source.");
    const wc = (toks) => toks.filter((t) => /\w/.test(t)).length;
    rec.set("backupDecision_inputs", { note: "word counts of the documents the harness holds (the canonical content before the stale save is the saver's last document); the rule is read, not run", wordsInServerCanonicalBeforeStaleSave: wc(saverFinalTokens), wordsInStaleDocument: wc(tokensOf(stalePlainSent)), wordsLostIfStaleSaveProcessed: wc(saverFinalTokens) - wc(tokensOf(stalePlainSent)), saverFinalLabel, staleLabel });
    rec.set("requestLogA", A.log());
    rec.set("requestLogB", B.log());
    rec.set("labelsRegistered", labels.entries());
    rec.set("pageReloadMarks", { A: A.marks().map((m) => ({ ...m, at: isoOf(m.t) })), B: B.marks().map((m) => ({ ...m, at: isoOf(m.t) })) });
    const vis = async (c) => {
      const marks = c.marks();
      return (await c.visibilityEvents()).map((v) => {
        const prior = marks.filter((m) => m.t <= v.t).at(-1);
        return { ...v, at: isoOf(v.t), msAfterReloadMark: prior ? Math.round(v.t - prior.t) : null };
      });
    };
    rec.set("visibilityEvents", { A: await vis(A), B: await vis(B) });
    rec.set("timelineSummary", { stepGapsMs: steps.map((s) => ({ step: s.step, who: s.who, role: s.role, msSinceLastSaveAckWhenTypingStarted: s.msSinceLastSaveAckWhenTypingStarted })) });

    out.verdict = finalVerdict;
    out.last = final.last.determined ? final.last.docLabel : `order not determined (${final.last.reason})`;
    out.held = final.st.classification.heldLabels;
    out.backupCreated = backupRevs.length > 0;
    out.backupRevs = classifyRevisions(final).filter((r) => !r.canonical);
    out.digest = buildDigest({ variant, n, total, session, rec, steps, staleStep, saverSteps, final, initial, afterOpen, at30, afterReload, notifStale, notifSaver, patchesStale, patchesSaver, failedStale, failedSaver, lostTokens, where, classifyRevisions, editorVsServer, staleAckEditors, finalVerdict, markerTokens, stalePlainSent, saverFinalLabel, staleLabel, backupRevs });
  } catch (e) {
    out.harnessError = errLine(e);
    rec.set("HARNESS ERROR", errLine(e));
    say(`HARNESS ERROR (variant ${variant.id} repetition ${n}): ${errLine(e)}`);
    process.exitCode = 1;
  } finally {
    const teardown = await session.close();
    rec.set("teardown", teardown);
    out.teardown = teardown;
    rec.print(say);
    try {
      out.jsonFile = rec.writeJson(path.join(RESULTS_DIR, "s3"));
      say(`JSON written: ${out.jsonFile}`);
    } catch (e) {
      say(`JSON NOT written: ${errLine(e)}`);
    }
    if (out.digest) {
      const dg = [...out.digest, "", `teardown: ${JSON.stringify(teardown)}`, `JSON: ${out.jsonFile ?? "(not written)"}`];
      const dfile = path.join(RESULTS_DIR, "s3", `${session.run.runId}-rep${String(n).padStart(2, "0")}-digest.txt`);
      try {
        mkdirSync(path.dirname(dfile), { recursive: true });
        writeFileSync(dfile, `${dg.join("\n")}\n`);
        out.digestFile = dfile;
      } catch (e) {
        say(`digest NOT written: ${errLine(e)}`);
      }
    }
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
  return out;
}

/** The compact, complete-in-substance text form of one repetition (everything except the two request logs, which are tables in the experiments record). */
function buildDigest(c) {
  const { variant, n, total, session, rec, steps, staleStep, final, initial, afterOpen, at30, afterReload, notifStale, notifSaver, patchesStale, patchesSaver, failedStale, failedSaver, lostTokens, where, classifyRevisions, editorVsServer, staleAckEditors, finalVerdict, backupRevs } = c;
  const L = [];
  const j = (x) => JSON.stringify(x);
  const ed = (e) => `A: "${normalizeWs(e.A.text).length > 90 ? `${normalizeWs(e.A.text).slice(0, 60)} ... [${tokensOf(e.A.text).length} words]` : normalizeWs(e.A.text)}" / ${e.A.footer.autosave} ; B: "${normalizeWs(e.B.text).length > 90 ? `${normalizeWs(e.B.text).slice(0, 60)} ... [${tokensOf(e.B.text).length} words]` : normalizeWs(e.B.text)}" / ${e.B.footer.autosave}`;
  L.push(`REPETITION s3 variant ${variant.id} rep ${n}/${total} run=${session.run.runId} commit=${rec.data.commit} node=${rec.data.node}`);
  L.push(`variant: ${variant.desc}`);
  L.push(`server: built standalone, sharing on, port ${rec.data.server.port}, pid ${rec.data.server.pid}; host to itself, not a second-device result; times are Playwright event times on the host clock`);
  L.push(`pre-checks: 7340=${j(rec.data.extra.preChecks.listeners7340)} 3000=${j(rec.data.extra.preChecks.listeners3000)} chosen port before start: none; server pids ${j(rec.data.extra.preChecks.serverPidsRecorded)}; browser pids ${rec.data.extra.preChecks.browserPidsRecorded.map((p) => p.pid).join(",")}; throwaway root ${rec.data.extra.preChecks.throwawayRootAsserted}`);
  L.push(`both open: ${ed(afterOpen)}`);
  L.push(`initial server state: ${j(describeClassification(initial.st.classification))}`);
  for (const s of steps) {
    L.push(`--- step ${s.step}: ${s.who} (${s.role}) typed; typing started ${s.msSinceLastSaveAckWhenTypingStarted === null ? "n/a" : `${s.msSinceLastSaveAckWhenTypingStarted} ms`} after the previous save acknowledgement; this client had sent ${s.patchesSentByTyperBeforeThisTyping} PATCH before this typing`);
    L.push(`  editors before typing: ${ed(s.editorsBeforeTyping)}`);
    L.push(`  sent: ${j(s.sentDocument)}`);
    L.push(`  editors right after save acknowledged: ${ed(s.editorsRightAfterSave)}`);
    L.push(`  editors at +5 s: ${ed(s.editorsAt5s)}`);
    L.push(`  stores: ${j(s.server.classification)}`);
    L.push(`  quiet=${j(s.server.quiet)} canonicalCount=${s.server.canonicalCount} last processed so far=${j(s.server.lastProcessed)} evidence=${j(s.server.evidence)}`);
    L.push(`  revisions: ${j(classifyRevisions(s._state))}`);
    L.push(`  sidecar: ${j(s.server.sidecar)} wordCount matches ${j(s.server.wordCountMatchesDocs)}; expected wordCounts ${j(s.server.expectedWordCounts)}`);
    L.push(`  writing log actual=${j(s.server.writingLogActual)} expected=${j(s.server.writingLogExpected)} match=${s.server.writingLogMatchesExpected}; entry timestamps ${j(s.server.writingLogEntryTimestamps)}`);
    L.push(`  writing-log tokens by processed save: ${j(s.server.writingLogTokensByProcessedSave.map((t) => ({ save: t.save, added: t.addedCount, deleted: t.deletedCount, deletedTokens: clipList(t.deletedTokens, 5), addedTokens: clipList(t.addedTokens, 5) })))}`);
    L.push(`  search: ${j(Object.fromEntries(Object.entries(s.server.search).map(([k, v]) => [k, v.count ?? v.error])))}`);
    L.push(`  .trash names: ${j(s.server.trash)}`);
    L.push(`  diagnostics record: ${j(s.server.diagnosticsIndex.recordForResource)} mention records: ${j(s.server.mentionIndex.recordsForResource)}`);
    L.push(`  step-state verdict (informational, not the repetition verdict): ${j(s.server.stepStateVerdict_informational)}`);
  }
  L.push(`--- 30 s after the stale client's save, no reload: ${ed(at30)}; versus server text: ${j(editorVsServer(at30, staleStep._state))}`);
  L.push(`--- after reload (both): ${ed(afterReload)}; versus server text: ${j(editorVsServer(afterReload, final))}`);
  L.push(`final stores: ${j(describeClassification(final.st.classification))}`);
  L.push(`final revisions (every v-* dir): ${j(classifyRevisions(final))}; other entries under revisions/<R1>/: ${j(final.st.summary.otherRevisionEntries)}`);
  L.push(`final .trash names: ${j(final.trash)}`);
  L.push(`final writing log: actual=${j(final.cmp.actual)} expected=${j(final.expected)} match=${final.cmp.match}`);
  L.push(`final search: ${j(Object.fromEntries(Object.entries(final.search).map(([k, v]) => [k, v.count ?? v.error])))}`);
  L.push(`last processed: ${j(final.last.determined ? { docLabel: final.last.docLabel, updatedAt: final.last.updatedAt } : { determined: false, reason: final.last.reason })}; evidence ${j(final.last.evidence)}`);
  L.push(`VERDICT: ${j(finalVerdict)}`);
  L.push(`lost tokens (first saver's final-document words absent from the stale document): ${lostTokens.length} (${clipList(lostTokens, 6)}); where they are, after the stale save: ${j(where(staleStep._state))}; after reload: ${j(where(final))}`);
  L.push(`stale save contains the first saver's text: request marker tokens ${j(staleStep.sentDocument.map((d) => d.markers))}, list words present ${j(staleStep.sentDocument.map((d) => d.listWordsPresent))}, ends with charlieQ: ${c.stalePlainSent.endsWith("charlieQ")}; stores after stale save held ${j(staleStep.server.heldLabels)}`);
  L.push(`snapshotCreated flags: stale save response ${j(staleStep.sentDocument.map((d) => d.snapshotCreated))}; auto-backup revisions after reload: ${j(backupRevs.map((r) => ({ dir: r.dir, name: r.meta.name, automaticSnapshot: r.meta.automaticSnapshot, isCanonical: r.meta.isCanonical })))}`);
  L.push(`saver editor right after the stale save vs server: ${j(editorVsServer(staleAckEditors, staleStep._state))}`);
  const slim = (nt) => ({ surfaces: nt.surfaces, console: nt.console, pageErrors: nt.pageErrors, dialogs: nt.dialogs, failedRequests: nt.failedRequests, nonOkResponses: nt.nonOkResponses, patchResponseSignals: nt.patchResponseSignals, reloadMarks: nt.reloadMarks });
  L.push(`notifications, stale client (since the first saver's ack; surfaces named: ${notifStale.surfacesChecked}): ${j(slim(notifStale))}`);
  L.push(`notifications, saver client (since the stale client's ack): ${j(slim(notifSaver))}`);
  L.push(`every PATCH by stale: ${j(patchesStale)}`);
  L.push(`every PATCH by saver: ${j(patchesSaver)}`);
  L.push(`failed saves: stale ${j(failedStale)}; saver ${j(failedSaver)}`);
  return L;
}

async function main() {
  const which = (process.argv[2] ?? "i,ii,iii,iv,v,vi").split(",").map((s) => s.trim());
  const total = Number(process.argv[3] ?? 3);
  for (const w of which) if (!VARIANTS[w]) throw new Error(`unknown variant ${w}`);
  const results = [];
  for (const w of which) {
    for (let n = 1; n <= total; n += 1) {
      results.push(await runRepetition(VARIANTS[w], n, total));
    }
  }
  say("");
  say("S3 SUMMARY (host to itself, not a second-device result)");
  for (const r of results) {
    say(`  variant=${r.variant} run=${r.runId} port=${r.port} verdict=${r.verdict?.verdict ?? "HARNESS ERROR"} last=${r.last} held=${JSON.stringify(r.held)} backupCreated=${r.backupCreated} nonCanonical=${JSON.stringify(r.backupRevs)}`);
    if (r.verdict) say(`      reasons: ${JSON.stringify(r.verdict.reasons)}`);
  }
  mkdirSync(path.join(RESULTS_DIR, "s3"), { recursive: true });
  const summaryFile = path.join(RESULTS_DIR, "s3", `summary-${results[0]?.runId ?? "none"}.json`);
  writeFileSync(
    summaryFile,
    `${JSON.stringify(
      results.map((r) => ({ variant: r.variant, runId: r.runId, port: r.port, pid: r.pid, verdict: r.verdict, last: r.last, held: r.held, backupCreated: r.backupCreated, nonCanonicalRevisions: r.backupRevs, jsonFile: r.jsonFile, digestFile: r.digestFile, harnessError: r.harnessError })),
      null,
      2,
    )}\n`,
  );
  say(`summary JSON: ${summaryFile}`);
}

main().catch((e) => {
  console.error(`script error: ${errLine(e)}`);
  process.exit(1);
});
