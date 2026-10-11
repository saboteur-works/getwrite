#!/usr/bin/env node
/**
 * Feature 78, Task 7: scenario S2, near-simultaneous saves with measured gaps.
 * A MEASUREMENT of the unchanged product; it records and does not fix. Every
 * request is host to itself, not a second-device result.
 *
 * ONE resource R, BOTH clients open it from the base document
 * `BASE alpha bravo charlie` (no reload between). Each client types its marker
 * with real keystrokes; the client's own 2500 ms debounce then issues the
 * PATCH. The harness HOLDS both PATCHes in the page's route handler until both
 * are held, then releases them with a controlled gap:
 *
 *   first released: A (order AB) or B (order BA)
 *   gap G<ms>: 0 = both releases started in the same tick (synchronously, one
 *              after the other, the smallest gap the harness can produce);
 *              g > 0 = first release started, setTimeout(g), second release
 *              started. The ACHIEVED gap is the difference of the two logged
 *              release times (Playwright-side, host clock); it is measured, not
 *              assumed, and it is not a wire gap.
 *   pairing P1: A ` A1`, B ` B1`
 *           P2: A ` A1`, B ` B2LONG` + the fixed 40-word list
 *           P3: A ` A2LONG` + the list, B ` B1`
 *
 * Variant id: `G<gap>-P<n>-<AB|BA>`, for example `G50-P2-AB`.
 *
 * One variant = one process = ONE server and ONE Chromium for its repetitions;
 * every repetition has a FRESH project, a FRESH resource, and a fresh pair of
 * paired browser contexts. The 7340 and 3000 listeners are checked and recorded
 * before every variant.
 *
 * Run OUTSIDE the command sandbox (server and Chromium). Usage:
 *   node s2-near-simultaneous.mjs <variantId> [repetitions=20]
 *   node s2-near-simultaneous.mjs --list
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource, longAddition } from "./lib/fixture.mjs";
import { createClient, labelDocs, savesFrom } from "./lib/clients.mjs";
import { createRecord } from "./lib/record.mjs";
import { openSession, searchFor, settleAndRead } from "./lib/session.mjs";
import { pidAlive } from "./lib/server.mjs";
import {
  classifySnapshot,
  compareLog,
  describeClassification,
  determineLastProcessed,
  expectedLogEntries,
  logEntriesSince,
  plainOfContent,
  readSnapshot,
  snapshotDigest,
  verdict,
} from "./lib/stores.mjs";
import { RESULTS_DIR, errLine, hostNow, isoOf, normalizeWs, sha256, sleep } from "./lib/util.mjs";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const say = (s) => console.log(s);
const SHORT_DELAY_MS = 40;
const LONG_DELAY_MS = 10;
const POST_ACK_WAIT_MS = 5000;
const POST_ACK_WAIT_FIRST_REP_MS = 30000;
const MAX_ATTEMPTS = 3;
const live = { session: null };

const PAIRINGS = {
  P1: { A: MARKERS.A1, B: MARKERS.B1, aLong: false, bLong: false, tokens: ["A1", "B1"] },
  P2: { A: MARKERS.A1, B: longAddition("B2LONG"), aLong: false, bLong: true, tokens: ["A1", "B2LONG", "harbor"] },
  P3: { A: longAddition("A2LONG"), B: MARKERS.B1, aLong: true, bLong: false, tokens: ["A2LONG", "B1", "harbor"] },
};

export function parseVariant(id) {
  const m = /^G(\d+)-(P[123])-(AB|BA)$/.exec(id);
  if (!m) throw new Error(`bad variant id ${id}`);
  return { id, gapMs: Number(m[1]), pairing: m[2], order: m[3], first: m[3][0], second: m[3][1], texts: PAIRINGS[m[2]] };
}

const tokensOf = (text) => (text ? text.trim().split(/\s+/).filter(Boolean) : []);

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
const clip = (arr, n = 6) => (arr.length > n ? `${arr.slice(0, n).join(" ")} ...(+${arr.length - n})` : arr.join(" "));
const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

const FORBIDDEN_KEYS = new Set(["raw", "content", "cookie", "cookies", "secret", "code", "password", "passphrase"]);
function assertNoForbiddenKeys(value, trail = "") {
  if (Array.isArray(value)) value.forEach((v, i) => assertNoForbiddenKeys(v, `${trail}[${i}]`));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new Error(`record refuses key "${k}" at ${trail || "(root)"}`);
      assertNoForbiddenKeys(v, `${trail}.${k}`);
    }
  }
}
/** Same guard as lib/record.mjs writeJson, written compact (no indentation) because S2 writes many records. */
function writeCompactJson(rec, dir) {
  assertNoForbiddenKeys(rec.data);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rec.data.runId}-rep${String(rec.data.repetition).padStart(2, "0")}.json`);
  writeFileSync(file, `${JSON.stringify(rec.data)}\n`);
  return file;
}

function namesUnder(dir, labels, cap = 100) {
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

const snapEditors = async (A, B) => ({
  at: isoOf(hostNow()),
  A: { text: await A.editorText(), footer: await A.footer() },
  B: { text: await B.editorText(), footer: await B.footer() },
});

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
// Heartbeat (sleep detection, as S4)
// ---------------------------------------------------------------------------

function startHeartbeat() {
  const hb = { beats: 0, lastWall: Date.now(), lastPerf: hostNow(), maxWallGapMs: 0, maxPerfGapMs: 0, gapsOver3s: [] };
  const timer = setInterval(() => {
    const w = Date.now();
    const p = hostNow();
    const wg = w - hb.lastWall;
    const pg = p - hb.lastPerf;
    hb.maxWallGapMs = Math.max(hb.maxWallGapMs, wg);
    hb.maxPerfGapMs = Math.max(hb.maxPerfGapMs, pg);
    if (wg > 3000 || pg > 3000) hb.gapsOver3s.push({ at: new Date(w).toISOString(), atMs: w, wallGapMs: wg, perfGapMs: Math.round(pg) });
    hb.lastWall = w;
    hb.lastPerf = p;
    hb.beats += 1;
  }, 1000);
  hb.stop = () => clearInterval(timer);
  return hb;
}

// ---------------------------------------------------------------------------
// One repetition
// ---------------------------------------------------------------------------

/**
 * Returns { phase: "setup"|"measured", error?, out } . A failure while phase is
 * "setup" (before the PATCHes are released) is a harness fault: the attempt is
 * discarded and repeated. A failure after the release is recorded as a
 * repetition that did not complete.
 */
async function runRepetition({ variant, n, attempt, total, hb }) {
  const T = variant.texts;
  const ctl = { phase: "setup", out: { variant: variant.id, n, attempt, error: null }, rec: null };
  const wallStart = Date.now();
  let session = null;
  let rec = null;
  let server = null;
  let labels = null;
  let A;
  let B;
  const typings = { A: [], B: [] };
  try {
    // One fresh server, one fresh Chromium, two freshly paired contexts per repetition (the S1 to S5 pattern).
    session = await openSession({ label: `s2-${variant.id.toLowerCase()}-r${n}`, clientLabels: ["A", "B"] });
    live.session = session;
    server = session.server;
    labels = session.labels;
    A = session.clients.A;
    B = session.clients.B;
    rec = createRecord({
      scenario: "s2",
      repetition: n,
      runId: session.run.runId,
      server,
      note: `S2 near-simultaneous, variant ${variant.id} (gap asked ${variant.gapMs} ms, pairing ${variant.pairing}, first released ${variant.first}), repetition ${n} of ${total}, attempt ${attempt}. Both clients edit the SAME resource, both opened from the base, no reload between. Measurement of the unchanged product. Fresh server, Chromium, project and resource for this repetition.`,
    });
    ctl.rec = rec;
    const clientsPaired = { A: { paired: A.pairFacts.paired, deviceCookiePresent: A.pairFacts.deviceCookiePresent }, B: { paired: B.pairFacts.paired, deviceCookiePresent: B.pairFacts.deviceCookiePresent } };
    const pre = {
      listeners7340: session.pre.listeners7340.length ? session.pre.listeners7340 : "none",
      listeners3000: session.pre.listeners3000.length ? session.pre.listeners3000 : "none",
      chosenPort: server.port,
      chosenPortListenersBeforeStart: "none (checked immediately before start)",
      serverPidsRecorded: [...server.known.entries()].map(([pid, comm]) => ({ pid, comm })),
      browserPidsRecorded: session.browserPids.map((q) => ({ pid: q.pid, comm: q.comm })),
      throwawayRootAsserted: session.run.dir,
    };
    rec.set("preChecks", { ...pre, clientsPaired });

    const project = await createFixtureProject(server, `S2 ${variant.id} r${n} ${session.run.runId.slice(-6)}`, labels);
    const R = await createFixtureResource(server, project, `Doc ${n}`, labels, "R1");
    const sinceMs = hostNow();
    const ctxDocs = () => {
      const a = labelDocs(A);
      const b = labelDocs(B);
      return { docs: { base: R.baseContent, ...a.docs, ...b.docs }, byNA: a.byN, byNB: b.byN };
    };
    const allSaves = () => {
      const { byNA, byNB } = ctxDocs();
      return [...savesFrom(A, (k) => byNA[k]), ...savesFrom(B, (k) => byNB[k])];
    };

    const initialSnap = readSnapshot(project.projectPath, R.id);
    const initialClass = classifySnapshot(initialSnap, { base: R.baseContent });
    const initialSearch = await searchFor(session, R, ["BASE", ...T.tokens]);
    rec.step("fixture created (project + resource through the app's API); initial stores read", { initial: describeClassification(initialClass) });

    const [openA, openB] = await Promise.all([A.openResource(project.name, R.name, { expectText: BASE_TEXT }), B.openResource(project.name, R.name, { expectText: BASE_TEXT })]);
    const afterOpen = await snapEditors(A, B);
    rec.step("both clients opened R in the real editor (concurrently), no reload between", { openA, openB, editors: afterOpen });
    const bothHaveBase = normalizeWs(afterOpen.A.text) === BASE_TEXT && normalizeWs(afterOpen.B.text) === BASE_TEXT;

    const beforeA = A.okPatchCount();
    const beforeB = B.okPatchCount();
    await A.holdPatches();
    await B.holdPatches();
    const tFirstTyping = hostNow();
    const typed = await Promise.all([
      A.typeText(T.A, { delayMs: T.aLong ? LONG_DELAY_MS : SHORT_DELAY_MS }),
      B.typeText(T.B, { delayMs: T.bLong ? LONG_DELAY_MS : SHORT_DELAY_MS }),
    ]);
    typings.A.push({ text: T.A, startT: typed[0].startT, endT: typed[0].endT });
    typings.B.push({ text: T.B, startT: typed[1].startT, endT: typed[1].endT });
    const heldA = await A.waitHeld(1, 30000);
    const heldB = await B.waitHeld(1, 30000);
    if (!heldA || !heldB) throw new Error(`a PATCH was not held within 30 s: A ${heldA}, B ${heldB}`);
    await sleep(150);
    const footersHeld = { A: (await A.footer()).autosave, B: (await B.footer()).autosave };
    const answeredWhileHeld = [A, B].map((c) => c.requests.filter((r) => r.method === "PATCH" && r.doc && r.respT !== null).length);
    rec.step("both clients typed concurrently; both PATCHes held", {
      firstToLastMs: { A: typed[0].firstToLastMs, B: typed[1].firstToLastMs },
      delayMs: { A: typed[0].delayMs, B: typed[1].delayMs },
      lastKeyEndsDifferByMs_BminusA: r3(typed[1].endT - typed[0].endT),
      footersWhileHeld: footersHeld,
      patchAnsweredWhileHeld: answeredWhileHeld,
    });

    // ---- release with the controlled gap (from here a failure is a measured outcome) ----
    ctl.phase = "measured";
    const firstC = variant.first === "A" ? A : B;
    const secondC = variant.first === "A" ? B : A;
    const tRelease0 = hostNow();
    const p1 = firstC.releaseHeld();
    if (variant.gapMs > 0) await sleep(variant.gapMs);
    const p2 = secondC.releaseHeld();
    await Promise.all([p1, p2]);
    const savedA = await A.waitForSaved({ afterCount: beforeA, timeoutMs: 25000 });
    const savedB = await B.waitForSaved({ afterCount: beforeB, timeoutMs: 25000 });
    const tAck = hostNow();
    await A.stopHolding();
    await B.stopHolding();
    const editorsAtAck = await snapEditors(A, B);
    rec.step("PATCHes released; both saves acknowledged (or failed)", { releaseStartedAt: isoOf(tRelease0), savedA, savedB, editors: editorsAtAck });

    // ---- order evidence ---------------------------------------------------
    const patchOf = (c) => c.requests.find((r) => r.method === "PATCH" && r.doc);
    const pa = patchOf(A);
    const pb = patchOf(B);
    const effT = (r) => r?.releaseT ?? r?.sendT ?? null;
    const gapRel = pa && pb && pa.releaseT !== null && pb.releaseT !== null ? Math.abs(pb.releaseT - pa.releaseT) : null;
    const firstReleased = pa && pb ? (effT(pa) <= effT(pb) ? "A" : "B") : null;
    const upd = (r) => (r?.fields?.updatedAt ? Date.parse(r.fields.updatedAt) : null);
    const updFirst = upd(pa) !== null && upd(pb) !== null ? (upd(pa) === upd(pb) ? "tie" : upd(pa) < upd(pb) ? "A" : "B") : null;
    const arrFirst = pa && pb && pa.respT !== null && pb.respT !== null ? (pa.respT <= pb.respT ? "A" : "B") : null;
    const other = (x) => (x === "A" ? "B" : x === "B" ? "A" : null);
    const lastBy = {
      release: other(firstReleased),
      updatedAt: updFirst === "tie" || updFirst === null ? null : other(updFirst),
      arrival: other(arrFirst),
    };
    const agree = (x, y) => (x === null || y === null ? null : x === y);
    const order = {
      firstReleased,
      releaseGapMs_secondMinusFirst: r3(gapRel),
      requestEventGapMs_BminusA: pa && pb ? r3(pb.sendT - pa.sendT) : null,
      effectiveSendAt: { A: pa ? isoOf(effT(pa)) : null, B: pb ? isoOf(effT(pb)) : null },
      releaseAt: { A: pa?.releaseT ? isoOf(pa.releaseT) : null, B: pb?.releaseT ? isoOf(pb.releaseT) : null },
      requestEventAt: { A: pa ? isoOf(pa.sendT) : null, B: pb ? isoOf(pb.sendT) : null },
      responseArrivalAt: { A: pa?.respT ? isoOf(pa.respT) : null, B: pb?.respT ? isoOf(pb.respT) : null },
      sendToResponseMs_fromRelease: { A: pa?.respT ? r3(pa.respT - effT(pa)) : null, B: pb?.respT ? r3(pb.respT - effT(pb)) : null },
      arrivalFirst: arrFirst,
      arrivalGapMs_secondMinusFirst: pa?.respT && pb?.respT ? r3(Math.abs(pb.respT - pa.respT)) : null,
      updatedAt: { A: pa?.fields?.updatedAt ?? null, B: pb?.fields?.updatedAt ?? null },
      updatedAtFirst: updFirst,
      updatedAtGapMs_secondMinusFirst: upd(pa) !== null && upd(pb) !== null ? Math.abs(upd(pb) - upd(pa)) : null,
      statuses: { A: pa?.status ?? null, B: pb?.status ?? null },
      lastBy,
      disagree: {
        releaseVsUpdatedAt: agree(lastBy.release, lastBy.updatedAt) === null ? null : !agree(lastBy.release, lastBy.updatedAt),
        releaseVsArrival: agree(lastBy.release, lastBy.arrival) === null ? null : !agree(lastBy.release, lastBy.arrival),
        updatedAtVsArrival: agree(lastBy.updatedAt, lastBy.arrival) === null ? null : !agree(lastBy.updatedAt, lastBy.arrival),
      },
      note: "release time = when the harness continued the held request (Playwright event time on the host clock); arrival = the page's response event time; neither is a wire time. 'lastBy' is the client that is LAST by that evidence.",
    };

    // ---- stores, quiet, editors -----------------------------------------------
    const { docs } = ctxDocs();
    const st1 = await settleAndRead({ session, resource: R, docs });
    const digest1 = snapshotDigest(project.projectPath, R.id);
    const saves = allSaves();
    const last = determineLastProcessed(saves);
    const waitMs = n === 1 ? POST_ACK_WAIT_FIRST_REP_MS : POST_ACK_WAIT_MS;
    const remaining = waitMs - (hostNow() - tAck);
    if (remaining > 0) await sleep(remaining);
    const editorsLater = await snapEditors(A, B);
    rec.step(`${Math.round(hostNow() - tAck)} ms after both acknowledgements (no reload)`, { editors: editorsLater, waitedMsAsked: waitMs });

    const [reloadA, reloadB] = await Promise.all([A.reloadAndOpen(project.name, R.name, { expectText: BASE_TEXT }), B.reloadAndOpen(project.name, R.name, { expectText: BASE_TEXT })]);
    const editorsReload = await snapEditors(A, B);
    rec.step("both reloaded (page reload, then reopen R)", { reloadA, reloadB, editors: editorsReload });
    const digest2 = snapshotDigest(project.projectPath, R.id);
    const changedByReload = digest1 !== digest2;
    const st2 = changedByReload ? await settleAndRead({ session, resource: R, docs }) : null;
    const fin = st2 ?? st1;
    const c = fin.classification;
    const verdictObj = verdict({ classification: c, last, docs, reloadTexts: { A: editorsReload.A.text, B: editorsReload.B.text }, requireReload: true });

    // ---- derived facts ---------------------------------------------------------
    const heldPlain = c.storesAgree && c.heldLabels.length ? plainOfContent(docs[c.heldLabels[0]]) : null;
    const eqServer = (snap) => ({ A: heldPlain === null ? null : normalizeWs(snap.A.text) === normalizeWs(heldPlain), B: heldPlain === null ? null : normalizeWs(snap.B.text) === normalizeWs(heldPlain) });
    const markersInHeld = tokensOf(heldPlain ?? "").filter((t) => ["A1", "B1", "A2LONG", "B2LONG"].includes(t));
    const classifyRevs = fin.classification.revisionContents.map((r) => ({ dir: r.dir, canonical: r.canonical, name: r.name, automaticSnapshot: r.automaticSnapshot, contains: r.status === "equals" ? `= ${r.equals.join("/")}` : r.status === "none" ? "NONE of the documents the harness holds" : r.status }));
    const wcOfLabels = c.expectedWordCounts;
    const scEq = Object.keys(docs).length ? saves.filter((s) => s.updatedAt === fin.snapshot.sidecar.updatedAt).map((s) => s.docLabel) : [];
    const whichMix = [c.contentBin, c.tiptapJson, c.txt].filter((x) => x.mix).map((x) => x.mix);
    const mixOrUnparseable = [c.contentBin, c.tiptapJson, c.txt].some((x) => x.status === "unparseable" || x.status === "none" || x.status === "parsed-equal-bytes-differ" || x.mix);
    const labelA = Object.keys(docs).filter((l) => l.startsWith("A#")).at(-1);
    const labelB = Object.keys(docs).filter((l) => l.startsWith("B#")).at(-1);
    const storeLabel = (x) => (x.status === "equals" ? x.equals.join("/") : x.status === "none" ? "none" : x.status);
    const storeNames = { contentBin: storeLabel(c.contentBin), contentTiptapJson: storeLabel(c.tiptapJson), contentTxt: storeLabel(c.txt) };
    const stores = {
      ...storeNames,
      sidecarWordCountMatches: c.sidecar.wordCountMatchesDocs,
      sidecarUpdatedAtEqualsResponseOf: scEq,
      allAgree: c.storesAgree,
      held: c.heldLabels,
    };
    let disagreed = null;
    if (!c.storesAgree) {
      const names = { contentBin: storeNames.contentBin, contentTiptapJson: storeNames.contentTiptapJson, contentTxt: storeNames.contentTxt };
      const vals = Object.values(names);
      const majority = vals.sort((x, y) => vals.filter((v) => v === y).length - vals.filter((v) => v === x).length)[0];
      disagreed = Object.entries(names).filter(([, v]) => v !== majority).map(([k]) => k);
    } else if (c.wordCountConsistent === false) {
      disagreed = ["sidecar.wordCount"];
    } else if (last.determined && !c.heldLabels.includes(last.docLabel)) {
      disagreed = ["all four hold the document that is not the last by updatedAt"];
    } else if (last.determined && c.sidecar.updatedAt !== last.updatedAt) {
      disagreed = ["sidecar.updatedAt"];
    }

    // writing log against expected (three candidate processing sequences)
    const logSince = logEntriesSince(fin.snapshot, sinceMs);
    const candidates = {};
    const mk = (name, seq) => {
      const contents = seq.map((l) => docs[l]).filter((x) => x !== undefined);
      const exp = expectedLogEntries(R.baseContent, contents);
      const cmp = compareLog(logSince, exp);
      let prev = plainOfContent(R.baseContent) ?? "";
      const toks = seq.map((l) => {
        const cur = plainOfContent(docs[l]) ?? "";
        const d = wordDelta(prev, cur);
        prev = cur;
        return { save: l, addedCount: d.addedTokens.length, deletedCount: d.deletedTokens.length, addedTokens: clip(d.addedTokens, 5), deletedTokens: clip(d.deletedTokens, 5) };
      });
      candidates[name] = { expected: exp, matchesActual: cmp.match, tokensByProcessedSave: toks };
    };
    if (labelA && labelB) {
      mk("A_then_B", [labelA, labelB]);
      mk("B_then_A", [labelB, labelA]);
      const fromBase = [expectedLogEntries(R.baseContent, [docs[labelA]])[0], expectedLogEntries(R.baseContent, [docs[labelB]])[0]].filter(Boolean);
      candidates.both_diffed_against_base = { expected: fromBase, matchesActual: compareLog(logSince, fromBase).match, note: "each save diffed against the base, as if both had read the base content.bin before either wrote" };
    }
    const actualLog = logSince.map((e) => ({ timestamp: e.timestamp, added: e.added, deleted: e.deleted, net: e.net, skipped: e.skipped ?? false, source: e.source ?? null }));
    const logFiles = fin.snapshot.writingLog.map((d) => ({ day: d.day, entries: d.entries.length, unparseable: d.unparseable ?? false }));
    const logPairing = pairLogEntries(logSince, saves);
    const logSorted = logSince.map((e) => e.timestamp);

    const search = await searchFor(session, R, ["BASE", ...T.tokens]);
    const searchLab = (s) => Object.fromEntries(Object.entries(s).map(([t, v]) => [t, { status: v.status, count: v.count }]));
    const failedA = A.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const failedB = B.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const notFound404 = [...failedA, ...failedB].filter((f) => f.status === 404);
    const notifA = await notificationsSince(A, tFirstTyping);
    const notifB = await notificationsSince(B, tFirstTyping);
    const trash = { projectTrash: namesUnder(path.join(project.projectPath, ".trash"), labels), projectsFolderTrash: namesUnder(path.join(server.projectsDir, ".trash"), labels) };
    const patchCounts = { A: A.requests.filter((r) => r.method === "PATCH" && r.doc).length, B: B.requests.filter((r) => r.method === "PATCH" && r.doc).length };
    const wallEnd = Date.now();
    const sleepAffected = hb.gapsOver3s.some((g) => g.atMs >= wallStart && g.atMs <= wallEnd + 1000);

    // ---- the six outcomes ------------------------------------------------------
    rec.outcome(1, {
      onDiskNames: "revisions/<R1>/v-N/content.bin (+ metadata.json), resources/<R1>/content.tiptap.json, resources/<R1>/content.txt, meta/resource-<R1>.meta.json",
      initial: describeClassification(initialClass),
      afterBothSaves_quiet: { quiet: st1.quiet, classification: describeClassification(st1.classification), revisions: st1.classification.revisionContents },
      afterReload: { changedByReload, classification: describeClassification(c), allFourAgree: c.storesAgree, held: c.heldLabels, canonicalCount: c.canonicalCount, sidecar: { wordCount: fin.snapshot.sidecar.wordCount, updatedAt: fin.snapshot.sidecar.updatedAt, name: fin.snapshot.sidecar.name, keys: fin.snapshot.sidecar.keys }, expectedWordCounts: wcOfLabels, sidecarWordCountMatches: c.sidecar.wordCountMatchesDocs, sidecarUpdatedAtEqualsResponseOf: scEq },
      storeDiffsIfNone: Object.fromEntries([["content.bin", c.contentBin], ["content.tiptap.json", c.tiptapJson], ["content.txt", c.txt]].filter(([, x]) => x.status !== "equals").map(([k, x]) => [k, { status: x.status, bytes: x.bytes, mix: x.mix ?? null, diff: x.diff ?? null }])),
      other_v_dirs: fin.snapshot.otherRevisionEntries,
    });
    rec.outcome(2, {
      bothOpen: afterOpen,
      bothEditorsShowedTheBaseBeforeTyping: bothHaveBase,
      rightAfterBothAcknowledged: { editors: editorsAtAck, equalsServerText: eqServer(editorsAtAck) },
      later_noReload: { waitedMs: Math.round(hostNow() - tAck), editors: editorsLater, equalsServerText: eqServer(editorsLater) },
      afterReload: { editors: editorsReload, equalsServerText: eqServer(editorsReload) },
    });
    rec.outcome(3, { A_sinceFirstTyping: notifA, B_sinceFirstTyping: notifB, sinceNote: "from the start of the typing (a superset of 'from the moment the other client saved')" });
    rec.outcome(4, {
      note: "Both editors opened from the base and neither held the other's text; the later-processed save carries only its own client's text. Established from outcome 1 and the PATCH log.",
      sentMarkers: { A: A.requests.filter((r) => r.doc).map((r) => r.doc.markers), B: B.requests.filter((r) => r.doc).map((r) => r.doc.markers) },
      patchCounts,
      markersInStoredDocument: markersInHeld,
      storesHold: c.heldLabels,
    });
    rec.outcome(5, {
      revisions: classifyRevs,
      backupRevisionCreated: classifyRevs.some((r) => !r.canonical && r.automaticSnapshot),
      snapshotCreatedFlags: { A: pa?.fields?.snapshotCreated ?? null, B: pb?.fields?.snapshotCreated ?? null },
      writingLogFiles: logFiles,
      writingLogEntriesActual: actualLog,
      writingLogCandidates: candidates,
      writingLogPairingByTimestamp_arithmetic_only: logPairing,
      writingLogEntryTimestampsSorted: logSorted,
      searchInitial: searchLab(initialSearch),
      searchFinal: searchLab(search),
      sidecarWordCount: fin.snapshot.sidecar.wordCount,
      expectedWordCounts: wcOfLabels,
      mentionRecords: fin.snapshot.mentionRecords,
      diagnosticsRecord: fin.snapshot.diagnosticsRecord,
      indexesComparedToPlainText: "not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed",
      trashNames: trash,
    });
    rec.outcome(6, {
      failedSavesA: failedA,
      failedSavesB: failedB,
      result: failedA.length + failedB.length === 0 ? "no failed save" : "see list",
      pointerIf404: notFound404.length ? "A 404 save response was recorded. Pointer, no cause stated: Feature 77 FR-37 record and the lead's POS note of 2026-10-10." : "no 404 save response",
    });
    rec.verdictInputs({
      saves: saves.map((s) => ({ id: s.id, docLabel: s.docLabel, updatedAt: s.updatedAt, effectiveSendAt: isoOf(s.sendT), respAt: isoOf(s.respT) })),
      lastProcessed: last.determined ? { docLabel: last.docLabel, updatedAt: last.updatedAt } : { determined: false, reason: last.reason },
      evidence: last.evidence,
      order,
      documentHashes: Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, sha256(v)])),
      requireReload: true,
      reloadTexts: { A: editorsReload.A.text, B: editorsReload.B.text },
    });
    rec.verdict(verdictObj);
    rec.finding("a_stale_editor_replaced_other_text_on_a_keystroke", { observation: "neither editor was stale at the start (both opened from the base); the stored document carries only the last-processed client's text", markersInStoredDocument: markersInHeld, sentMarkers: { A: A.requests.filter((r) => r.doc).map((r) => r.doc.markers), B: B.requests.filter((r) => r.doc).map((r) => r.doc.markers) } });
    rec.finding("b_saves_sent_with_no_typing", { patchesWithDocument: patchCounts, typingActions: { A: typings.A.length, B: typings.B.length } });
    rec.finding("c_overwritten_device_told_anything", { surfaceTexts: { A: [...new Set(notifA.surfaces.map((x) => x.text))], B: [...new Set(notifB.surfaces.map((x) => x.text))] }, consoleMessages: { A: notifA.console.length, B: notifB.console.length }, dialogs: { A: notifA.dialogs.length, B: notifB.dialogs.length }, note: "full lists in outcome 3; surfaces named there" });
    rec.finding("d_overwritten_text_recoverable", { revisions: classifyRevs, nonCanonicalRevisionsHoldingOtherClientsDocument: classifyRevs.filter((r) => !r.canonical && r.contains.startsWith("=")).map((r) => r.contains), trash });
    rec.finding("e_editor_shows_text_the_server_no_longer_holds", { rightAfterAck: eqServer(editorsAtAck), later_noReload: eqServer(editorsLater), afterReload: eqServer(editorsReload), storesHold: c.heldLabels, footersLater: { A: editorsLater.A.footer.full, B: editorsLater.B.footer.full } });
    rec.finding("f_writing_log_effect", { actual: actualLog, matchesCandidate: Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.matchesActual])), note: "expected entries and tokens per candidate processing sequence in outcome 5" });
    rec.finding("g_failed_save_on_the_device_the_writer_believes_is_last", { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "none" : "see list" });
    const slimLog = (cl) => {
      const all = cl.log();
      const patches = all.filter((l) => l.method === "PATCH");
      const others = all.filter((l) => l.method !== "PATCH");
      return { patchRequests: patches, otherRequests: { count: others.length, byMethodAndPath: Object.fromEntries([...others.reduce((m, l) => m.set(`${l.method} ${l.path.replace(/\?.*$/, "")}`, (m.get(`${l.method} ${l.path.replace(/\?.*$/, "")}`) ?? 0) + 1), new Map())]), nonOk: others.filter((l) => l.status !== null && l.status >= 300).map((l) => ({ method: l.method, path: l.path, status: l.status })), failed: others.filter((l) => l.failure).map((l) => ({ method: l.method, path: l.path, failure: l.failure })) }, note: "every PATCH is listed in full; the other requests (page loads, resource and project reads, search) are counted by method and path, with any non-2xx or failed one listed" };
    };
    rec.set("requestLogA", slimLog(A));
    rec.set("requestLogB", slimLog(B));
    rec.set("typed", { A: { text: T.A.length > 40 ? `${T.A.slice(0, 9)}+list` : T.A, firstToLastMs: typed[0].firstToLastMs, delayMs: typed[0].delayMs, endAt: isoOf(typed[0].endT) }, B: { text: T.B.length > 40 ? `${T.B.slice(0, 9)}+list` : T.B, firstToLastMs: typed[1].firstToLastMs, delayMs: typed[1].delayMs, endAt: isoOf(typed[1].endT) } });
    rec.set("labelsRegistered", labels.entries().length);
    rec.set("quietWaits", { afterSaves: st1.quiet, afterReload: st2 ? st2.quiet : "not needed: the digest of the stores was unchanged by the reload" });
    rec.set("heartbeat", { gapsOver3sDuringThisRep: sleepAffected });

    const flat = {
      variant: variant.id,
      n,
      attempt,
      runId: session.run.runId,
      port: server.port,
      serverPid: server.pid,
      listeners7340Before: pre.listeners7340,
      listeners3000Before: pre.listeners3000,
      askedGapMs: variant.gapMs,
      pairing: variant.pairing,
      askedOrder: variant.order,
      typedMs: { A: typed[0].firstToLastMs, B: typed[1].firstToLastMs },
      lastKeyEndsDifferByMs_BminusA: r3(typed[1].endT - typed[0].endT),
      order,
      verdict: verdictObj.verdict,
      reasons: verdictObj.reasons,
      lastProcessedDetermined: last.determined,
      lastProcessed: last.determined ? last.docLabel : null,
      reasonUndetermined: last.determined ? null : last.reason,
      stores,
      disagreed,
      mixOrUnparseable,
      mixHints: whichMix,
      storesStatus: { contentBin: c.contentBin.status, contentTiptapJson: c.tiptapJson.status, contentTxt: c.txt.status },
      sidecar: { wordCount: fin.snapshot.sidecar.wordCount, updatedAt: fin.snapshot.sidecar.updatedAt },
      wordCountExpected: wcOfLabels,
      revisions: classifyRevs,
      backupCreated: classifyRevs.some((r) => !r.canonical && r.automaticSnapshot),
      log: { count: actualLog.length, entries: actualLog.map((e) => ({ added: e.added, deleted: e.deleted, net: e.net })), matches: Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.matchesActual])) },
      failed: { A: failedA, B: failedB },
      patchCounts,
      editors: { rightAfterAck: eqServer(editorsAtAck), later: eqServer(editorsLater), afterReload: eqServer(editorsReload), laterFootersSaved: { A: editorsLater.A.footer.autosave, B: editorsLater.B.footer.autosave } },
      surfaceTexts: { A: [...new Set(notifA.surfaces.map((s) => s.text))], B: [...new Set(notifB.surfaces.map((s) => s.text))] },
      consoleCounts: { A: notifA.console.length, B: notifB.console.length },
      changedByReload,
      sleepAffected,
      search: searchLab(search),
    };
    rec.set("s2", flat);
    ctl.out.flat = flat;
    ctl.out.sleepAffected = sleepAffected;
    ctl.rec = rec;
  } catch (e) {
    ctl.out.error = errLine(e);
    rec?.set("ERROR", { phase: ctl.phase, message: errLine(e) });
    ctl.rec = rec;
  } finally {
    if (session) {
      const teardown = await session.close();
      live.session = null;
      ctl.out.teardown = teardown;
      ctl.out.runId = session.run.runId;
      rec?.set("teardown", teardown);
    }
  }
  return ctl;
}

// ---------------------------------------------------------------------------
// One variant
// ---------------------------------------------------------------------------

async function runVariant(variantId, total) {
  const variant = parseVariant(variantId);
  const wallStart = new Date();
  const hb = startHeartbeat();
  const resultsDir = path.join(RESULTS_DIR, "s2");
  const discardedDir = path.join(resultsDir, "discarded");
  mkdirSync(discardedDir, { recursive: true });
  say(`VARIANT ${variantId}: ${total} repetitions, one fresh server + Chromium + project + resource each (host to itself, not a second-device result)`);
  const onSignal = async () => {
    hb.stop();
    await live.session?.close().catch(() => {});
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const reps = [];
  const discarded = [];
  const notRun = [];
  let aborted = null;
  const descendantPidsSeen = new Map();
  const noteDescendants = (ctl) => {
    const pre = ctl?.rec?.data?.extra?.preChecks;
    for (const p of [...(pre?.serverPidsRecorded ?? []), ...(pre?.browserPidsRecorded ?? [])]) descendantPidsSeen.set(p.pid, p.comm);
    for (const p of ctl?.out?.teardown?.server?.recorded ?? []) descendantPidsSeen.set(p.pid, p.comm);
  };
  const compactTeardown = (t) => (t ? { errors: t.errors, browserPidsRecorded: t.browserPidsRecorded, browserPidsAliveAfterClose: t.browserPidsAliveAfterClose, browserPidsAliveAfterTerm: t.browserPidsAliveAfterTerm, serverPidsRecorded: t.server?.recorded?.map((q) => q.pid), serverStillAliveAfterKill: t.server?.stillAliveAfterKill, portListenersAfter: t.server?.portListenersAfter, listeners7340After: t.listeners7340After, listeners3000After: t.listeners3000After, folderRemoved: t.cleanup?.removed } : null);

  try {
    for (let n = 1; n <= total; n += 1) {
      if (aborted) {
        notRun.push(n);
        continue;
      }
      let done = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt += 1) {
        const ctl = await runRepetition({ variant, n, attempt, total, hb });
        noteDescendants(ctl);
        const completed = !ctl.out.error;
        const harnessFault = ctl.out.error && ctl.phase === "setup";
        const slept = ctl.out.sleepAffected === true;
        if (harnessFault || slept) {
          const why = harnessFault ? `setup failure before the release: ${ctl.out.error}` : "heartbeat gap over 3 s during the repetition";
          discarded.push({ n, attempt, why });
          say(`  rep ${n} attempt ${attempt} DISCARDED (harness): ${why}`);
          try {
            writeFileSync(path.join(discardedDir, `${ctl.out.runId ?? `${variantId}-norun`}-rep${String(n).padStart(2, "0")}-attempt${attempt}.json`), `${JSON.stringify({ variant: variantId, n, attempt, why, record: ctl.rec?.data ?? null }, null, 2)}\n`);
          } catch {
            // best effort
          }
          continue;
        }
        done = true;
        const rec = ctl.rec;
        let file = null;
        try {
          file = writeCompactJson(rec, resultsDir);
        } catch (e) {
          say(`  JSON NOT written: ${errLine(e)}`);
        }
        const f = ctl.out.flat;
        if (!completed || !f) {
          reps.push({ n, attempt, completed: false, error: ctl.out.error, file, teardown: compactTeardown(ctl.out.teardown) });
          say(`  rep ${n} NOT COMPLETED (after release): ${ctl.out.error}`);
          rec?.print(say);
        } else {
          reps.push({ n, attempt, completed: true, file, flat: { ...f, teardown: compactTeardown(ctl.out.teardown) } });
          const o = f.order;
          const clean = f.verdict === "PASS" && f.failed.A.length + f.failed.B.length === 0;
          say(`  rep ${n}${attempt > 1 ? ` (attempt ${attempt})` : ""} run=${f.runId.slice(-13)} port=${f.port} ${f.verdict} first=${o.firstReleased} relGap=${o.releaseGapMs_secondMinusFirst}ms updatedAt[A,B]=${o.updatedAt.A?.slice(-9, -1)},${o.updatedAt.B?.slice(-9, -1)} lastBy rel/upd/arr=${o.lastBy.release}/${o.lastBy.updatedAt}/${o.lastBy.arrival} stores bin/tip/txt=${f.stores.contentBin}/${f.stores.contentTiptapJson}/${f.stores.contentTxt} agree=${f.stores.allAgree} log=${JSON.stringify(f.log.entries)} backup=${f.backupCreated} failed=${f.failed.A.length + f.failed.B.length}${f.reasons?.length && f.verdict !== "PASS" ? ` reasons=${JSON.stringify(f.reasons)}` : ""}`);
          if (!clean) rec.print(say);
        }
      }
      if (!done) {
        aborted = `repetition ${n} failed ${MAX_ATTEMPTS} attempts in setup`;
        notRun.push(n);
        say(`  ABORT: ${aborted}`);
      }
    }
  } finally {
    hb.stop();
    const descendantPidsAliveAfter = [...descendantPidsSeen.keys()].filter((pid) => pidAlive(pid));
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    const wallEnd = new Date();
    const summary = {
      variant: variantId,
      asked: { gapMs: variant.gapMs, pairing: variant.pairing, firstReleased: variant.first },
      repetitionsAsked: total,
      repetitionsCompleted: reps.filter((r) => r.completed).length,
      repetitionsNotCompletedAfterRelease: reps.filter((r) => !r.completed).map((r) => r.n),
      repetitionsNotRun: notRun,
      aborted,
      discardedAttempts: discarded,
      wallStart: wallStart.toISOString(),
      wallEnd: wallEnd.toISOString(),
      wallSeconds: Math.round((wallEnd - wallStart) / 1000),
      heartbeat: { beats: hb.beats, maxWallGapMs: hb.maxWallGapMs, maxPerfGapMs: Math.round(hb.maxPerfGapMs), gapsOver3s: hb.gapsOver3s },
      descendantPidsRecordedDuringRun: [...descendantPidsSeen.entries()].map(([pid, comm]) => ({ pid, comm })),
      descendantPidsAliveAfterTeardown: descendantPidsAliveAfter,
      reps: reps.map((r) => (r.completed ? { n: r.n, attempt: r.attempt, file: r.file, ...r.flat } : r)),
    };
    const sfile = path.join(resultsDir, `summary-s2-${variantId.toLowerCase()}-${Date.now().toString(36)}.json`);
    writeFileSync(sfile, `${JSON.stringify(summary, null, 2)}\n`);
    say(`VARIANT ${variantId} DONE: completed ${summary.repetitionsCompleted}/${total}, discarded attempts ${discarded.length}, wall ${summary.wallSeconds}s, max heartbeat gap ${hb.maxWallGapMs} ms; descendant pids alive after the last teardown: ${JSON.stringify(descendantPidsAliveAfter)}; summary ${sfile}`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "--list") {
    say("variant ids look like G<gap>-P<1|2|3>-<AB|BA>, for example G50-P2-AB");
    return;
  }
  await runVariant(arg, Number(process.argv[3] ?? 20));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`script error: ${errLine(e)}`);
    process.exit(1);
  });
}
