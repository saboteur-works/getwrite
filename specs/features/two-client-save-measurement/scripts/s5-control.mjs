#!/usr/bin/env node
/**
 * Feature 78, Task 6: scenario S5, the control. A MEASUREMENT of the unchanged
 * product; it records and does not fix. Every request is host to itself, not a
 * second-device result.
 *
 * One project, two resources R1 and R2 (both from the base document
 * `BASE alpha bravo charlie`), two clients, ONE CLIENT PER RESOURCE: A has R1
 * open and types ` A1`; B has R2 open and types ` B1`. Each repetition is a
 * fresh server, project and pair of resources. Variants (timing of the two
 * saves):
 *   1  in turn: A saves, 5 s, B saves (no hold);
 *   2  the smallest send-time gap the harness can produce: both PATCHes held in
 *      the page's route handler and released in the same tick
 *      (Promise.all of the two releaseHeld calls);
 *   3  a 250 ms gap: A's PATCH released, 250 ms sleep, B's released.
 * The achieved gap is measured from the logged times; nothing is called
 * simultaneous without it.
 *
 * Before and after each repetition a sha256 of EVERY file under the project is
 * taken (fixture, after both clients opened, after the saves, after the
 * reload). Files are grouped by path into R1 (resources/<R1>, revisions/<R1>,
 * the R1 sidecar), R2 and project-level. Document text is never written; only
 * hashes, sizes, paths (ids replaced by labels) and marker strings.
 *
 * Run OUTSIDE the command sandbox (server and Chromium). Usage:
 *   node s5-control.mjs [variants=1,2,3] [repetitions=3]
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource } from "./lib/fixture.mjs";
import { labelDocs, savesFrom } from "./lib/clients.mjs";
import { createRecord } from "./lib/record.mjs";
import { openSession, searchFor, settleAndRead } from "./lib/session.mjs";
import {
  classifySnapshot,
  compareLog,
  describeClassification,
  determineLastProcessed,
  expectedLogEntries,
  logEntriesSince,
  plainOfContent,
  readSnapshot,
  verdict,
} from "./lib/stores.mjs";
import { RESULTS_DIR, errLine, hostNow, isoOf, normalizeWs, sha256, sleep } from "./lib/util.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const say = (s) => console.log(s);
const TOKENS = ["A1", "B1", "BASE"];
const WAIT_AFTER_SAVE_MS = 5000;
const LONG_WAIT_MS = 30000;
const VARIANTS = {
  1: { key: "1", name: "in turn (A saves, 5 s, B saves)", asked: "5000 ms from A's save acknowledgement to the start of B's typing" },
  2: { key: "2", name: "smallest gap: both PATCHes held, released in the same tick", asked: "0 ms (Promise.all of the two releases)" },
  3: { key: "3", name: "250 ms gap: both PATCHes held, A released, 250 ms, B released", asked: "250 ms (setTimeout between the two releases)" },
};
/** The four files a content save writes (read, not run: revision-core.ts updateRevisionInPlace). */
const SAVE_FILE_SUFFIXES = ["content.bin", "content.tiptap.json", "content.txt", ".meta.json"];

// ---------------------------------------------------------------------------
// Per-project file hashing
// ---------------------------------------------------------------------------

function hashProject(projectPath, labels) {
  const out = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      try {
        const buf = readFileSync(full);
        out.set(labels.apply(path.relative(projectPath, full)), { bytes: buf.length, sha256: sha256(buf) });
      } catch {
        // vanished between listing and reading (temporary file)
      }
    }
  };
  walk(projectPath);
  return out;
}

function diffMaps(from, to) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [p, v] of to) {
    if (!from.has(p)) added.push(p);
    else if (from.get(p).sha256 !== v.sha256) changed.push(p);
  }
  for (const p of from.keys()) if (!to.has(p)) removed.push(p);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

const groupOf = (p) => {
  for (const r of ["R1", "R2"]) {
    if (p.startsWith(`resources/${r}/`) || p.startsWith(`revisions/${r}/`) || p === `meta/resource-${r}.meta.json`) return r;
  }
  return "project";
};

/** Split a diff into R1 / R2 / project-level path lists. */
function groupDiff(d) {
  const g = { R1: { added: [], removed: [], changed: [] }, R2: { added: [], removed: [], changed: [] }, project: { added: [], removed: [], changed: [] } };
  for (const kind of ["added", "removed", "changed"]) for (const p of d[kind]) g[groupOf(p)][kind].push(p);
  return g;
}

const norm = (p) => p.replace(/\bR[12]\b/g, "R#");
const allPaths = (x) => [...x.added.map((p) => `+${p}`), ...x.removed.map((p) => `-${p}`), ...x.changed.map((p) => `~${p}`)];
const outsideFour = (x) => allPaths(x).filter((s) => !SAVE_FILE_SUFFIXES.some((suf) => s.endsWith(suf)));

const filesOf = (map, resLabel) =>
  [...map.entries()]
    .filter(([p]) => groupOf(p) === resLabel)
    .map(([p, v]) => ({ path: p, bytes: v.bytes, sha256: v.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path));

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

// ---------------------------------------------------------------------------
// Reading the two resources
// ---------------------------------------------------------------------------

function docsFor(ctx, res) {
  const a = labelDocs(ctx.A);
  const b = labelDocs(ctx.B);
  return { docs: { base: res.baseContent, ...a.docs, ...b.docs }, byNA: a.byN, byNB: b.byN };
}

const savesOf = (ctx, who, res) => {
  const { byNA, byNB } = docsFor(ctx, res);
  return who === "A" ? savesFrom(ctx.A, (n) => byNA[n]) : savesFrom(ctx.B, (n) => byNB[n]);
};

/** Full six-outcome server state of one resource (quiet wait included when `settle`). */
async function readResource(ctx, res, who, settle) {
  const { docs } = docsFor(ctx, res);
  let st;
  if (settle) {
    st = await settleAndRead({ session: ctx.session, resource: res, docs });
  } else {
    const snapshot = readSnapshot(res.projectPath, res.id);
    st = { quiet: null, snapshot, classification: classifySnapshot(snapshot, docs) };
  }
  const saves = savesOf(ctx, who, res);
  const last = determineLastProcessed(saves);
  const c = st.classification;
  const foreign = Object.keys(docs).filter((l) => l.startsWith(who === "A" ? "B#" : "A#"));
  const holdsForeign = [c.contentBin, c.tiptapJson, c.txt].some((x) => (x.equals ?? []).some((l) => foreign.includes(l)));
  return { res, who, docs, st, saves, last, c, holdsForeign };
}

const compactState = (r) => ({
  quiet: r.st.quiet,
  classification: describeClassification(r.c),
  allFourAgree: r.c.storesAgree,
  heldLabels: r.c.heldLabels,
  canonicalCount: r.c.canonicalCount,
  revisions: r.c.revisionContents,
  otherRevisionDirEntries: r.st.snapshot.otherRevisionEntries,
  sidecar: { wordCount: r.st.snapshot.sidecar.wordCount, updatedAt: r.st.snapshot.sidecar.updatedAt, name: r.st.snapshot.sidecar.name, keys: r.st.snapshot.sidecar.keys },
  wordCountMatchesDocs: r.c.sidecar.wordCountMatchesDocs,
  expectedWordCounts: r.c.expectedWordCounts,
  holdsTheOtherClientsDocument: r.holdsForeign,
  lastProcessed: r.last.determined ? { docLabel: r.last.docLabel, updatedAt: r.last.updatedAt } : { determined: false, reason: r.last.reason },
  mentionRecords: r.st.snapshot.mentionRecords,
  diagnosticsRecord: r.st.snapshot.diagnosticsRecord,
});

// ---------------------------------------------------------------------------
// Helpers copied in shape from s1-in-turn.mjs
// ---------------------------------------------------------------------------

const snapEditors = async (A, B) => ({
  at: isoOf(hostNow()),
  A: { text: await A.editorText(), footer: await A.footer() },
  B: { text: await B.editorText(), footer: await B.footer() },
});

function patchAnalysis(client, typings) {
  const marks = client.marks();
  return client.requests
    .filter((r) => r.method === "PATCH")
    .map((r) => {
      const eff = r.releaseT ?? r.sendT;
      const prior = typings.filter((t) => t.endT <= r.sendT).at(-1);
      return {
        n: r.n,
        requestEventAt: isoOf(r.sendT),
        releasedAt: r.releaseT === null ? null : isoOf(r.releaseT),
        status: r.status,
        hasDocument: !!r.doc,
        markers: r.doc?.markers ?? null,
        note: r.note ?? null,
        msAfterLastTypingEnd: prior ? Math.round(r.sendT - prior.endT) : null,
        lastTypingMarker: prior ? prior.text : null,
        msHeld: r.releaseT === null ? null : Math.round(r.releaseT - r.sendT),
        effectiveSendAt: isoOf(eff),
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

/** Achieved gap between the two content saves, from the logged times (host clock, Playwright event times). */
function achievedGaps(A, B) {
  const pa = A.requests.find((r) => r.method === "PATCH" && r.doc);
  const pb = B.requests.find((r) => r.method === "PATCH" && r.doc);
  if (!pa || !pb) return { error: "a content PATCH was not logged", A: !!pa, B: !!pb };
  const eff = (r) => r.releaseT ?? r.sendT;
  const ms = (x) => Math.round(x * 1000) / 1000;
  const u = (r) => (r.fields?.updatedAt ? Date.parse(r.fields.updatedAt) : null);
  return {
    firstToSend: eff(pa) <= eff(pb) ? "A" : "B",
    effectiveSendAt: { A: isoOf(eff(pa)), B: isoOf(eff(pb)) },
    requestEventAt: { A: isoOf(pa.sendT), B: isoOf(pb.sendT) },
    msHeld: { A: pa.releaseT === null ? null : ms(pa.releaseT - pa.sendT), B: pb.releaseT === null ? null : ms(pb.releaseT - pb.sendT) },
    gapEffectiveSendMs_BminusA: ms(eff(pb) - eff(pa)),
    gapRequestEventMs_BminusA: ms(pb.sendT - pa.sendT),
    gapResponseArrivalMs_BminusA: ms(pb.respT - pa.respT),
    gapResponseUpdatedAtMs_BminusA: u(pa) !== null && u(pb) !== null ? u(pb) - u(pa) : null,
    responseUpdatedAt: { A: pa.fields?.updatedAt ?? null, B: pb.fields?.updatedAt ?? null },
    statuses: { A: pa.status, B: pb.status },
    note: "effective send = release time for a held request (the harness continued it), else the page's request event; Playwright event times, not wire times",
  };
}

/** Pair each save with the writing-log entry nearest below its updatedAt (arithmetic only). */
function pairLogEntries(entries, saves) {
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

// ---------------------------------------------------------------------------
// One repetition
// ---------------------------------------------------------------------------

async function runRepetition(variantKey, n, total) {
  const variant = VARIANTS[variantKey];
  const session = await openSession({ label: `s5v${variantKey}r${n}` });
  const { server, clients, labels } = session;
  const { A, B } = clients;
  const rec = createRecord({
    scenario: "s5",
    repetition: n,
    runId: session.run.runId,
    server,
    note: `S5 CONTROL (different resources, same project), variant ${variantKey} (${variant.name}), repetition ${n} of ${total}. A edits R1 with ' A1', B edits R2 with ' B1'. Measurement of the unchanged product. Fresh server, project and resources.`,
  });
  const typings = { A: [], B: [] };
  const D = []; // digest lines
  const L = (s) => D.push(s);
  const out = { variant: variantKey, runId: session.run.runId, port: server.port, pid: server.pid, harnessError: null };
  const onSignal = async () => {
    await session.close().catch(() => {});
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const pre = {
      listeners7340: session.pre.listeners7340.length ? session.pre.listeners7340 : "none",
      listeners3000: session.pre.listeners3000.length ? session.pre.listeners3000 : "none",
      chosenPort: server.port,
      chosenPortListenersBeforeStart: "none (checked immediately before start)",
      serverPidsRecorded: [...server.known.entries()].map(([pid, comm]) => ({ pid, comm })),
      browserPidsRecorded: session.browserPids.map((p) => ({ pid: p.pid, comm: p.comm })),
      clientsPaired: Object.fromEntries(Object.entries(clients).map(([k, c]) => [k, { paired: c.pairFacts.paired, deviceCookiePresent: c.pairFacts.deviceCookiePresent }])),
      throwawayRootAsserted: session.run.dir,
    };
    rec.set("preChecks", pre);
    L(`REPETITION s5 variant ${variantKey} (${variant.name}) rep ${n}/${total} run=${session.run.runId}`);
    L(`server: built standalone, sharing on, port ${server.port}, pid ${server.pid}; host to itself, not a second-device result; times are Playwright event times on the host clock`);
    L(`pre-checks: 7340=${JSON.stringify(pre.listeners7340)} 3000=${JSON.stringify(pre.listeners3000)} chosen port before start: none; server pids ${JSON.stringify(pre.serverPidsRecorded)}; browser pids ${session.browserPids.map((p) => p.pid).join(",")}; throwaway root ${session.run.dir}`);

    const project = await createFixtureProject(server, `S5v${variantKey}r${n} ${session.run.runId}`, labels);
    const R1 = await createFixtureResource(server, project, `Doc one ${session.run.runId}`, labels, "R1");
    const R2 = await createFixtureResource(server, project, `Doc two ${session.run.runId}`, labels, "R2");
    const ctx = { session, A, B };
    const sinceMs = hostNow();
    const idLabel = { [R1.id]: "R1", [R2.id]: "R2" };
    rec.step("fixture created through POST /api/projects and two POST /api/resource", { baseContentChars: { R1: R1.baseContent.length, R2: R2.baseContent.length }, baseContentsIdentical: R1.baseContent === R2.baseContent });

    // initial read (settled) and the first hash snapshot: "before"
    const init1 = await readResource(ctx, R1, "A", true);
    const init2 = await readResource(ctx, R2, "B", true);
    const hFixture = hashProject(project.projectPath, labels);
    const initialSearch = await searchFor(session, R1, TOKENS);
    rec.step("fixture settled; first hash snapshot (before the repetition)", { files: hFixture.size, R1: describeClassification(init1.c), R2: describeClassification(init2.c) });
    L(`fixture: R1 ${describeClassification(init1.c).join(" ; ")}`);
    L(`fixture: R2 ${describeClassification(init2.c).join(" ; ")}`);

    const openA = await A.openResource(project.name, R1.name, { expectText: BASE_TEXT });
    const openB = await B.openResource(project.name, R2.name, { expectText: BASE_TEXT });
    const afterOpen = await snapEditors(A, B);
    rec.step("A opened R1 and B opened R2 in the real editor", { openA, openB, editors: afterOpen });
    L(`both open: A(R1): "${afterOpen.A.text}" / ${afterOpen.A.footer.full} ; B(R2): "${afterOpen.B.text}" / ${afterOpen.B.footer.full}`);
    await settleAndRead({ session, resource: R1, docs: docsFor(ctx, R1).docs });
    const hOpen = hashProject(project.projectPath, labels);
    const dOpen = groupDiff(diffMaps(hFixture, hOpen));
    rec.step("settled after both clients opened; hash snapshot", { changedByOpening: dOpen });
    L(`files changed between fixture and both-open (by path, no document text): R1 ${JSON.stringify(allPaths(dOpen.R1))} R2 ${JSON.stringify(allPaths(dOpen.R2))} project ${JSON.stringify(allPaths(dOpen.project))}`);

    // ---- the two saves ------------------------------------------------------
    const beforeA = A.okPatchCount();
    const beforeB = B.okPatchCount();
    const tFirstTyping = hostNow();
    let hMid = null;
    let mid = null;
    let tAckA;
    let tAckB;
    let editorsAfterFirstAck = null;
    let asked = variant.asked;

    if (variantKey === "1") {
      const typedA = await A.typeText(MARKERS.A1);
      typings.A.push({ text: MARKERS.A1, startT: typedA.startT, endT: typedA.endT });
      const savedA = await A.waitForSaved({ afterCount: beforeA, timeoutMs: 25000 });
      tAckA = hostNow();
      editorsAfterFirstAck = await snapEditors(A, B);
      rec.step("A typed ' A1' and the save was acknowledged", { typed: { firstToLastMs: typedA.firstToLastMs, delayMs: typedA.delayMs }, saved: savedA, editors: editorsAfterFirstAck });
      L(`step A: typed ' A1' (${typedA.firstToLastMs} ms first to last key); saved ${JSON.stringify(savedA.ok)} footer "${savedA.footer?.full}"; editors right after: A "${editorsAfterFirstAck.A.text}" / ${editorsAfterFirstAck.A.footer.autosave} ; B "${editorsAfterFirstAck.B.text}" / ${editorsAfterFirstAck.B.footer.autosave}`);
      await sleep(2500);
      const m1 = await readResource(ctx, R1, "A", true);
      const m2 = await readResource(ctx, R2, "B", false);
      hMid = hashProject(project.projectPath, labels);
      mid = { R1: compactState(m1), R2: compactState(m2), changedSinceBothOpen: groupDiff(diffMaps(hOpen, hMid)), msFromAckToEndOfRead: Math.round(hostNow() - tAckA) };
      L(`state after A's save (read ${mid.msFromAckToEndOfRead} ms after the acknowledgement, before B typed): R1 ${mid.R1.classification.join(" ; ")} | R2 ${mid.R2.classification.join(" ; ")}`);
      L(`files changed since both-open, after A's save only: R1 ${JSON.stringify(allPaths(mid.changedSinceBothOpen.R1))} R2 ${JSON.stringify(allPaths(mid.changedSinceBothOpen.R2))} project ${JSON.stringify(allPaths(mid.changedSinceBothOpen.project))}`);
      const spent = hostNow() - tAckA;
      if (spent < WAIT_AFTER_SAVE_MS) await sleep(WAIT_AFTER_SAVE_MS - spent);
      const bTypingStart = hostNow();
      const msFromAckA = Math.round(bTypingStart - tAckA);
      const editorsBeforeB = await snapEditors(A, B);
      const typedB = await B.typeText(MARKERS.B1);
      typings.B.push({ text: MARKERS.B1, startT: typedB.startT, endT: typedB.endT });
      const savedB = await B.waitForSaved({ afterCount: beforeB, timeoutMs: 25000 });
      tAckB = hostNow();
      rec.step("B typed ' B1' and the save was acknowledged", { msFromAsSaveAckToBsTypingStart: msFromAckA, editorsBeforeBTyped: editorsBeforeB, typed: { firstToLastMs: typedB.firstToLastMs, delayMs: typedB.delayMs }, saved: savedB });
      L(`step B: typing started ${msFromAckA} ms after A's acknowledgement; typed ' B1' (${typedB.firstToLastMs} ms); saved ${JSON.stringify(savedB.ok)} footer "${savedB.footer?.full}"`);
      out.savedOk = [savedA.ok, savedB.ok];
    } else {
      await A.holdPatches();
      await B.holdPatches();
      const typed = await Promise.all([A.typeText(MARKERS.A1), B.typeText(MARKERS.B1)]);
      typings.A.push({ text: MARKERS.A1, startT: typed[0].startT, endT: typed[0].endT });
      typings.B.push({ text: MARKERS.B1, startT: typed[1].startT, endT: typed[1].endT });
      const heldA = await A.waitHeld(1);
      const heldB = await B.waitHeld(1);
      if (!heldA || !heldB) throw new Error(`a PATCH was not held: A ${heldA}, B ${heldB}`);
      await sleep(300);
      const footersHeld = { A: (await A.footer()).autosave, B: (await B.footer()).autosave };
      const answeredWhileHeld = [A, B].map((c) => c.requests.filter((r) => r.method === "PATCH" && r.doc && r.respT !== null).length);
      rec.step("both clients typed concurrently (Promise.all); both PATCHes held", { firstToLastMs: { A: typed[0].firstToLastMs, B: typed[1].firstToLastMs }, lastKeyEndsDifferByMs: Math.round(typed[1].endT - typed[0].endT), footersWhileHeld: footersHeld, patchAnsweredWhileHeld: answeredWhileHeld });
      L(`typed concurrently: first to last key A ${typed[0].firstToLastMs} ms, B ${typed[1].firstToLastMs} ms; last keystrokes ${Math.round(typed[1].endT - typed[0].endT)} ms apart (B minus A); both PATCHes held A ${heldA} B ${heldB}; answered while held ${answeredWhileHeld.join(",")}; footers while held A "${footersHeld.A}" B "${footersHeld.B}"`);
      let rel;
      if (variantKey === "2") {
        rel = await Promise.all([A.releaseHeld(), B.releaseHeld()]);
      } else {
        const ra = await A.releaseHeld();
        await sleep(250);
        const rb = await B.releaseHeld();
        rel = [ra, rb];
      }
      const savedA = await A.waitForSaved({ afterCount: beforeA, timeoutMs: 25000 });
      const savedB = await B.waitForSaved({ afterCount: beforeB, timeoutMs: 25000 });
      tAckA = hostNow();
      tAckB = tAckA;
      await A.stopHolding();
      await B.stopHolding();
      editorsAfterFirstAck = await snapEditors(A, B);
      rec.step("PATCHes released; both saves acknowledged", { releases: rel.flat(), savedA, savedB, editors: editorsAfterFirstAck });
      L(`released (${variantKey === "2" ? "same tick" : "A, 250 ms, B"}); saved A ${savedA.ok} "${savedA.footer?.full}" B ${savedB.ok} "${savedB.footer?.full}"; editors right after both acknowledged: A(R1) "${editorsAfterFirstAck.A.text}" / ${editorsAfterFirstAck.A.footer.autosave} ; B(R2) "${editorsAfterFirstAck.B.text}" / ${editorsAfterFirstAck.B.footer.autosave}`);
      out.savedOk = [savedA.ok, savedB.ok];
    }
    const gaps = achievedGaps(A, B);
    out.gaps = gaps;
    L(`ACHIEVED GAP (asked: ${asked}): ${JSON.stringify(gaps)}`);

    // ---- state after both saves ---------------------------------------------
    const f1 = await readResource(ctx, R1, "A", true);
    const f2 = await readResource(ctx, R2, "B", true);
    const hSaves = hashProject(project.projectPath, labels);
    const dSaves = groupDiff(diffMaps(hOpen, hSaves));
    const editorsAfterSaves = await snapEditors(A, B);
    L(`state after both saves (quiet): R1 ${compactState(f1).classification.join(" ; ")}`);
    L(`state after both saves (quiet): R2 ${compactState(f2).classification.join(" ; ")}`);
    L(`files changed since both-open, after both saves: R1 ${JSON.stringify(allPaths(dSaves.R1))}`);
    L(`  R2 ${JSON.stringify(allPaths(dSaves.R2))}`);
    L(`  project-level ${JSON.stringify(allPaths(dSaves.project))}`);

    // 30 s after the last save, no reload (b)
    const remaining = LONG_WAIT_MS - (hostNow() - Math.max(tAckA, tAckB));
    if (remaining > 0) await sleep(remaining);
    const at30 = await snapEditors(A, B);
    rec.step("30 s after the last save acknowledgement, no reload", { editors: at30 });
    L(`30 s after the last acknowledgement, no reload: A(R1) "${at30.A.text}" / ${at30.A.footer.full} ; B(R2) "${at30.B.text}" / ${at30.B.footer.full}`);

    const reloadA = await A.reloadAndOpen(project.name, R1.name, { expectText: BASE_TEXT });
    const reloadB = await B.reloadAndOpen(project.name, R2.name, { expectText: BASE_TEXT });
    const afterReload = await snapEditors(A, B);
    rec.step("both reloaded (page reload, then reopen their own resource)", { reloadA, reloadB, editors: afterReload });
    L(`after reload: A(R1) "${afterReload.A.text}" / ${afterReload.A.footer.full} ; B(R2) "${afterReload.B.text}" / ${afterReload.B.footer.full}`);
    const g1 = await readResource(ctx, R1, "A", true);
    const g2 = await readResource(ctx, R2, "B", true);
    const hFinal = hashProject(project.projectPath, labels);
    const dReload = groupDiff(diffMaps(hSaves, hFinal));
    const dTotal = groupDiff(diffMaps(hFixture, hFinal));
    L(`files changed by the reload (saves-state to final): R1 ${JSON.stringify(allPaths(dReload.R1))} R2 ${JSON.stringify(allPaths(dReload.R2))} project ${JSON.stringify(allPaths(dReload.project))}`);

    // ---- verdict per resource -----------------------------------------------
    const v1 = verdict({ classification: g1.c, last: g1.last, docs: g1.docs, reloadTexts: { A: afterReload.A.text }, requireReload: true });
    const v2 = verdict({ classification: g2.c, last: g2.last, docs: g2.docs, reloadTexts: { B: afterReload.B.text }, requireReload: true });
    const repVerdict = v1.verdict === "PASS" && v2.verdict === "PASS" ? "PASS" : v1.verdict === "FAIL" || v2.verdict === "FAIL" ? "FAIL" : "UNSTABLE";
    L(`VERDICT R1 (must be A's document): ${JSON.stringify(v1)}`);
    L(`VERDICT R2 (must be B's document): ${JSON.stringify(v2)}`);
    L(`REPETITION VERDICT (both resources must PASS): ${repVerdict}`);

    // ---- attribution of file changes ---------------------------------------
    const symmetric = (x, y) => JSON.stringify(allPaths(x).map(norm).sort()) === JSON.stringify(allPaths(y).map(norm).sort());
    const attribution = {
      method: "sha256 of every file under the project, labelled paths; R1 = resources/R1/, revisions/R1/, meta/resource-R1.meta.json; R2 likewise; everything else project-level. 'changed' = hash differs, '+' added, '-' removed.",
      fixtureToBothOpen: dOpen,
      bothOpenToAfterSaves: dSaves,
      afterSavesToAfterReload: dReload,
      fixtureToFinal: dTotal,
      afterAsSaveOnly_variant1: mid ? mid.changedSinceBothOpen : "not applicable (variants 2 and 3 have no state between the two saves)",
      R1_changed_between_bothOpen_and_afterSaves: allPaths(dSaves.R1),
      R2_changed_between_bothOpen_and_afterSaves: allPaths(dSaves.R2),
      R1_and_R2_change_sets_equal_after_replacing_label: symmetric(dSaves.R1, dSaves.R2),
      pathsOutsideTheFourSaveFiles_R1: outsideFour(dSaves.R1),
      pathsOutsideTheFourSaveFiles_R2: outsideFour(dSaves.R2),
      R1_files_changed_by_opening_or_reload: { open: allPaths(dOpen.R1), reload: allPaths(dReload.R1) },
      R2_files_changed_by_opening_or_reload: { open: allPaths(dOpen.R2), reload: allPaths(dReload.R2) },
      projectLevelChangedBySaves: allPaths(dSaves.project),
      fourSaveFiles_read_not_run: "revisions/<id>/v-N/content.bin, resources/<id>/content.tiptap.json, resources/<id>/content.txt, meta/resource-<id>.meta.json (revision-core.ts updateRevisionInPlace)",
    };
    if (mid) {
      attribution.variant1_afterAsSave_R2_changed = allPaths(mid.changedSinceBothOpen.R2);
      attribution.variant1_afterAsSave_R1_changed = allPaths(mid.changedSinceBothOpen.R1);
      attribution.variant1_afterBsSave_R1_changed_since_afterAsSave = allPaths(groupDiff(diffMaps(hMid, hSaves)).R1);
    }
    L(`attribution: R1 and R2 change sets equal after replacing the labels: ${attribution.R1_and_R2_change_sets_equal_after_replacing_label}; paths outside the four save files: R1 ${JSON.stringify(attribution.pathsOutsideTheFourSaveFiles_R1)} R2 ${JSON.stringify(attribution.pathsOutsideTheFourSaveFiles_R2)}`);
    if (mid) L(`attribution (variant 1): after A's save only, R2 changed ${JSON.stringify(attribution.variant1_afterAsSave_R2_changed)}; after B's save, R1 changed since the state after A's save ${JSON.stringify(attribution.variant1_afterBsSave_R1_changed_since_afterAsSave)}`);

    // ---- outcomes -----------------------------------------------------------
    const saves = [...savesOf(ctx, "A", R1), ...savesOf(ctx, "B", R2)];
    const crossOrder = determineLastProcessed(saves);
    const expectedLog = [...expectedLogEntries(R1.baseContent, [g1.docs["A#1"]].filter(Boolean)), ...expectedLogEntries(R2.baseContent, [g2.docs["B#1"]].filter(Boolean))];
    const logSince = logEntriesSince(g2.st.snapshot, sinceMs);
    const cmp = compareLog(logSince, expectedLog);
    const logFiles = g2.st.snapshot.writingLog.map((d) => ({ day: d.day, entries: d.entries.length }));
    const pairing = pairLogEntries(logSince, saves);
    const search = await searchFor(session, R1, TOKENS);
    const searchLab = Object.fromEntries(Object.entries(search).map(([t, v]) => [t, { status: v.status, count: v.count, in: (v.resourceIds ?? []).map((id) => idLabel[id] ?? "other") }]));
    const initialSearchLab = Object.fromEntries(Object.entries(initialSearch).map(([t, v]) => [t, { status: v.status, count: v.count, in: (v.resourceIds ?? []).map((id) => idLabel[id] ?? "other") }]));
    const searchOnlyOwn = searchLab.A1?.in?.length === 1 && searchLab.A1.in[0] === "R1" && searchLab.B1?.in?.length === 1 && searchLab.B1.in[0] === "R2";
    const trash = {
      projectTrash: namesUnder(path.join(project.projectPath, ".trash"), labels),
      projectsFolderTrash: namesUnder(path.join(server.projectsDir, ".trash"), labels),
      note: "names only, ids replaced by labels; 'absent' means the directory does not exist",
    };
    const failedA = A.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const failedB = B.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const patchesA = patchAnalysis(A, typings.A);
    const patchesB = patchAnalysis(B, typings.B);
    const notifA = await notificationsSince(A, tFirstTyping);
    const notifB = await notificationsSince(B, tFirstTyping);

    rec.outcome(1, {
      onDiskNames: "revisions/<id>/v-N/content.bin + metadata.json; resources/<id>/content.tiptap.json; resources/<id>/content.txt; meta/resource-<id>.meta.json; for R1 (A's) and R2 (B's)",
      resourceIds: "R1 = the resource A has open; R2 = the one B has open",
      fixture: { R1: compactState(init1), R2: compactState(init2) },
      afterFirstSaveOnly_variant1: mid,
      afterBothSaves: { R1: compactState(f1), R2: compactState(f2) },
      afterReload: { R1: compactState(g1), R2: compactState(g2) },
      R1_holdsA_not_B: g1.c.storesAgree && g1.c.heldLabels.length === 1 && g1.c.heldLabels[0] === "A#1" && !g1.holdsForeign,
      R2_holdsB_not_A: g2.c.storesAgree && g2.c.heldLabels.length === 1 && g2.c.heldLabels[0] === "B#1" && !g2.holdsForeign,
      fileAttribution: attribution,
      sha256PerFile_R1: { before: filesOf(hFixture, "R1"), after: filesOf(hFinal, "R1") },
      sha256PerFile_R2: { before: filesOf(hFixture, "R2"), after: filesOf(hFinal, "R2") },
    });
    rec.outcome(2, {
      note: "(a) right after the saves were acknowledged (variant 1: also right after A's save, before B typed; B's editor has a different resource open so it is never expected to change); (b) 30 s after the last save, no reload; (c) after reload. Each client has only its own resource open.",
      bothOpen: afterOpen,
      afterFirstAck: editorsAfterFirstAck,
      afterBothSavesQuiet: editorsAfterSaves,
      at30sNoReload: at30,
      afterReload,
      A_editorEqualsServerPlainTextOfR1_afterReload: normalizeWs(afterReload.A.text) === normalizeWs(plainOfContent(g1.docs["A#1"]) ?? ""),
      B_editorEqualsServerPlainTextOfR2_afterReload: normalizeWs(afterReload.B.text) === normalizeWs(plainOfContent(g2.docs["B#1"]) ?? ""),
    });
    rec.outcome(3, { A_sinceFirstTyping: notifA, B_sinceFirstTyping: notifB, sinceNote: "from the start of the first typing of the repetition (a superset of 'from the moment the other client saved')" });
    rec.outcome(4, {
      note: "S5 has no stale editor of the same resource: each client has only its own resource open, so there is no editor whose older copy could overwrite the other's text of the same resource. Established from outcome 1 and the PATCH log.",
      A_sentDocumentMarkers: patchesA.map((p) => p.markers),
      B_sentDocumentMarkers: patchesB.map((p) => p.markers),
      R1_holdsAnyBDocument: g1.holdsForeign,
      R2_holdsAnyADocument: g2.holdsForeign,
      everyPatchSentByA: patchesA,
      everyPatchSentByB: patchesB,
    });
    rec.outcome(5, {
      revisions: { R1: g1.c.revisionContents, R2: g2.c.revisionContents },
      writingLogFiles: logFiles,
      writingLogEntriesSinceStart: logSince.map((e) => ({ timestamp: e.timestamp, added: e.added, deleted: e.deleted, net: e.net, skipped: e.skipped ?? false, source: e.source ?? null })),
      writingLogExpected: expectedLog,
      writingLogMatchesExpected: cmp.match,
      writingLogEntryCountExpected: expectedLog.length,
      writingLogPairingByTimestamp_arithmetic_only: pairing,
      writingLogNote: "the day file is project-level and shared by R1 and R2; an entry carries no resource or client id (read from the entries: timestamp, added, deleted, net)",
      searchInitial: initialSearchLab,
      searchFinal: searchLab,
      searchEachMarkerFindsOnlyItsOwnResource: searchOnlyOwn,
      sidecarWordCount: { R1: g1.st.snapshot.sidecar.wordCount, R2: g2.st.snapshot.sidecar.wordCount, expected: { R1: g1.c.expectedWordCounts, R2: g2.c.expectedWordCounts } },
      mentionIndex: { R1: g1.st.snapshot.mentionRecords, R2: g2.st.snapshot.mentionRecords },
      diagnosticsIndex: { R1: g1.st.snapshot.diagnosticsRecord, R2: g2.st.snapshot.diagnosticsRecord },
      indexesComparedToPlainText: "not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed",
      trashNames: trash,
    });
    rec.outcome(6, { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "no failed save" : "see list" });
    rec.verdictInputs({
      perResource: {
        R1: { saves: g1.saves.map((s) => ({ id: s.id, docLabel: s.docLabel, updatedAt: s.updatedAt })), lastProcessed: g1.last.determined ? { docLabel: g1.last.docLabel, updatedAt: g1.last.updatedAt } : { determined: false, reason: g1.last.reason }, expected: "A#1", reloadTextOfA: afterReload.A.text },
        R2: { saves: g2.saves.map((s) => ({ id: s.id, docLabel: s.docLabel, updatedAt: s.updatedAt })), lastProcessed: g2.last.determined ? { docLabel: g2.last.docLabel, updatedAt: g2.last.updatedAt } : { determined: false, reason: g2.last.reason }, expected: "B#1", reloadTextOfB: afterReload.B.text },
      },
      crossResourceOrderEvidence_informational: crossOrder.evidence,
      crossResourceLastProcessed_informational: crossOrder.determined ? { docLabel: crossOrder.docLabel, updatedAt: crossOrder.updatedAt } : { determined: false, reason: crossOrder.reason },
      note: "the verdict is applied per resource: each resource has exactly one save, so its last processed save is determined; the cross-resource order is recorded as evidence only and does not enter the verdict",
      documentHashes: { base: sha256(R1.baseContent), "A#1": sha256(g1.docs["A#1"] ?? ""), "B#1": sha256(g2.docs["B#1"] ?? "") },
      requireReload: true,
    });
    rec.verdict({ repetition: repVerdict, R1: v1, R2: v2 });

    rec.finding("a_stale_editor_replaced_other_text_on_a_keystroke", { observation: "no stale editor of the same resource exists in this scenario (one client per resource)", R1_holdsAnyBDocument: g1.holdsForeign, R2_holdsAnyADocument: g2.holdsForeign });
    rec.finding("b_saves_sent_with_no_typing", {
      patchesA: patchesA.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      patchesB: patchesB.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      typingActions: { A: typings.A.map((t) => t.text), B: typings.B.map((t) => t.text) },
    });
    rec.finding("c_other_client_told_anything", { A: notifA, B: notifB, note: "full lists in outcome 3; surfaces named there; nothing was overwritten in this scenario" });
    rec.finding("d_overwritten_text_recoverable", { observation: "nothing was overwritten if R1 holds A's document and R2 holds B's", revisions: { R1: g1.c.revisionContents, R2: g2.c.revisionContents } });
    rec.finding("e_editor_shows_text_the_server_no_longer_holds", { A_afterReload_equalsServer: normalizeWs(afterReload.A.text) === normalizeWs(plainOfContent(g1.docs["A#1"]) ?? ""), B_afterReload_equalsServer: normalizeWs(afterReload.B.text) === normalizeWs(plainOfContent(g2.docs["B#1"]) ?? ""), at30sNoReload: at30 });
    rec.finding("f_writing_log_effect", { actual: cmp.actual, expected: expectedLog, matches: cmp.match, pairing, files: logFiles });
    rec.finding("g_failed_save_on_the_device_the_writer_believes_is_last", { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "none" : "see list" });
    rec.set("requestLogA", A.log());
    rec.set("requestLogB", B.log());
    rec.set("labelsRegistered", labels.entries());
    rec.set("achievedGap", gaps);
    rec.set("askedGap", asked);
    rec.set("pageReloadMarks", { A: A.marks().map((m) => ({ ...m, at: isoOf(m.t) })), B: B.marks().map((m) => ({ ...m, at: isoOf(m.t) })) });

    // ---- digest tail --------------------------------------------------------
    L(`writing log: files ${JSON.stringify(logFiles)}; entries since start ${JSON.stringify(logSince.map((e) => ({ timestamp: e.timestamp, added: e.added, deleted: e.deleted, net: e.net })))}; expected ${JSON.stringify(expectedLog)}; match ${cmp.match}; pairing (arithmetic only) ${JSON.stringify(pairing)}`);
    L(`search: initial ${JSON.stringify(initialSearchLab)}; final ${JSON.stringify(searchLab)}; each marker finds only its own resource: ${searchOnlyOwn}`);
    L(`sidecar wordCount: R1 ${g1.st.snapshot.sidecar.wordCount} (expected ${JSON.stringify(g1.c.expectedWordCounts)}), R2 ${g2.st.snapshot.sidecar.wordCount} (expected ${JSON.stringify(g2.c.expectedWordCounts)})`);
    L(`revisions: R1 ${JSON.stringify(g1.c.revisionContents)} ; R2 ${JSON.stringify(g2.c.revisionContents)}`);
    L(`cross-resource order evidence (informational): ${JSON.stringify(crossOrder.evidence)} determined=${crossOrder.determined}${crossOrder.determined ? "" : ` (${crossOrder.reason})`}`);
    L(`.trash names: ${JSON.stringify(trash)}`);
    L(`diagnostics: R1 ${JSON.stringify(g1.st.snapshot.diagnosticsRecord)} R2 ${JSON.stringify(g2.st.snapshot.diagnosticsRecord)}; mention records R1 ${JSON.stringify(g1.st.snapshot.mentionRecords)} R2 ${JSON.stringify(g2.st.snapshot.mentionRecords)}`);
    L(`notifications A since first typing: ${JSON.stringify(notifA)}`);
    L(`notifications B since first typing: ${JSON.stringify(notifB)}`);
    L(`every PATCH by A: ${JSON.stringify(patchesA)}`);
    L(`every PATCH by B: ${JSON.stringify(patchesB)}`);
    L(`failed saves: A ${JSON.stringify(failedA)} B ${JSON.stringify(failedB)}`);

    out.verdict = repVerdict;
    out.v1 = v1;
    out.v2 = v2;
    out.R1 = describeClassification(g1.c);
    out.R2 = describeClassification(g2.c);
    out.attribution = {
      symmetric: attribution.R1_and_R2_change_sets_equal_after_replacing_label,
      R1: attribution.R1_changed_between_bothOpen_and_afterSaves,
      R2: attribution.R2_changed_between_bothOpen_and_afterSaves,
      project: attribution.projectLevelChangedBySaves,
      outsideFour: [...attribution.pathsOutsideTheFourSaveFiles_R1, ...attribution.pathsOutsideTheFourSaveFiles_R2],
    };
    out.logMatch = cmp.match;
    out.searchOnlyOwn = searchOnlyOwn;
    out.failed = failedA.length + failedB.length;
    out.crossOrderDetermined = crossOrder.determined;
  } catch (e) {
    out.harnessError = errLine(e);
    rec.set("HARNESS ERROR", errLine(e));
    L(`HARNESS ERROR: ${errLine(e)}`);
    say(`HARNESS ERROR (variant ${variantKey} repetition ${n}): ${errLine(e)}`);
    process.exitCode = 1;
  } finally {
    const teardown = await session.close();
    rec.set("teardown", teardown);
    out.teardown = teardown;
    rec.print(say);
    try {
      out.jsonFile = rec.writeJson();
      say(`JSON written: ${out.jsonFile}`);
    } catch (e) {
      say(`JSON NOT written: ${errLine(e)}`);
    }
    try {
      const dfile = path.join(RESULTS_DIR, "s5", `${session.run.runId}-rep${String(n).padStart(2, "0")}-digest.txt`);
      mkdirSync(path.dirname(dfile), { recursive: true });
      writeFileSync(dfile, `${[...D, "", `teardown: ${JSON.stringify(teardown)}`, `JSON: ${out.jsonFile ?? "(not written)"}`].join("\n")}\n`);
      out.digestFile = dfile;
    } catch (e) {
      say(`digest NOT written: ${errLine(e)}`);
    }
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
  return out;
}

async function main() {
  const variants = String(process.argv[2] ?? "1,2,3").split(",").filter(Boolean);
  const total = Number(process.argv[3] ?? 3);
  const results = [];
  for (const v of variants) {
    if (!VARIANTS[v]) throw new Error(`unknown variant ${v}`);
    for (let n = 1; n <= total; n += 1) results.push(await runRepetition(v, n, total));
  }
  say("");
  say("S5 SUMMARY (control; host to itself, not a second-device result)");
  for (const r of results) {
    const g = r.gaps ?? {};
    say(`  variant ${r.variant} run=${r.runId} port=${r.port} verdict=${r.verdict ?? "HARNESS ERROR"} R1=${JSON.stringify(r.R1)} R2=${JSON.stringify(r.R2)} gapEffectiveSendMs(B-A)=${g.gapEffectiveSendMs_BminusA} gapUpdatedAtMs(B-A)=${g.gapResponseUpdatedAtMs_BminusA} logMatch=${r.logMatch} searchOnlyOwn=${r.searchOnlyOwn} failed=${r.failed}`);
  }
  mkdirSync(path.join(RESULTS_DIR, "s5"), { recursive: true });
  const summaryFile = path.join(RESULTS_DIR, "s5", `summary-${results[0]?.runId ?? "none"}.json`);
  writeFileSync(
    summaryFile,
    `${JSON.stringify(
      results.map((r) => ({ variant: r.variant, runId: r.runId, port: r.port, pid: r.pid, verdict: r.verdict, R1: r.R1, R2: r.R2, v1: r.v1, v2: r.v2, gaps: r.gaps, attribution: r.attribution, logMatch: r.logMatch, searchOnlyOwn: r.searchOnlyOwn, failed: r.failed, crossOrderDetermined: r.crossOrderDetermined, jsonFile: r.jsonFile, digestFile: r.digestFile, harnessError: r.harnessError })),
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
