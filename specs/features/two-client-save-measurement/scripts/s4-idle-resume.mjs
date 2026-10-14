#!/usr/bin/env node
/**
 * Feature 78, Task 5: scenario S4, idle then resume. A MEASUREMENT of the
 * unchanged product; it records and does not fix. Every request is host to
 * itself, not a second-device result.
 *
 * One run = one fresh server, project and resource (base `BASE alpha bravo
 * charlie`). A and B open R. After a short open-settle, T0 is stamped: A is then
 * left IDLE (no input of any kind) for the recorded duration. B types ` B1` at
 * T0+10 s (60 s runs) or T0+30 s (10-minute run) and waits for saved. At the end
 * of the idle A is TOUCHED without typing, in this order, each timed and each
 * followed by a 4 s observation window (longer than the 2500 ms debounce, read,
 * not run: useCanonicalAutosave.ts):
 *   1 click in the editor
 *   2 focus moving out and back (activeElement.blur(), 1 s, editor.focus())
 *   3 scroll (mouse moved over the editor, wheel down and up)
 *   4 visibility change: a second page opened in A's context, brought to front,
 *     then closed; A's own document.visibilityState is read before, during, after
 *   5 page.bringToFront() on A's page, as its own separate touch
 * A then types the single character `Q` (no leading space) and waits for saved;
 * stores are read; after 30 s both reload and are read again.
 *
 * Requests: the harness's own log only covers /api/ requests; this script ALSO
 * attaches a log of EVERY request (any URL, any resource type) and every
 * WebSocket of A's and B's pages, so "no request during the idle" is read from
 * a log that does not filter.
 *
 * Clock check: a 1 s heartbeat records Date.now() (wall clock, which jumps over
 * a machine sleep) and hostNow() (performance.now based; macOS monotonic time
 * may not advance during sleep). The largest gap is recorded per run.
 *
 * Run OUTSIDE the command sandbox (server and Chromium). Usage:
 *   node s4-idle-resume.mjs <d60|d600> [repetitions]
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource } from "./lib/fixture.mjs";
import { createRecord } from "./lib/record.mjs";
import { openSession } from "./lib/session.mjs";
import {
  describeClassification,
  plainOfContent,
  verdict,
} from "./lib/stores.mjs";
import { RESULTS_DIR, errLine, hostNow, isoOf, normalizeWs, sha256, sleep } from "./lib/util.mjs";
import { allSaves, compactState, readServerState, snapEditors } from "./lib/shared.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const say = (s) => console.log(s);
const OPEN_SETTLE_MS = 3000;
const TOUCH_WINDOW_MS = 4000;
const READ_AT_MS = 3500;
const WAIT_AFTER_SAVE_MS = 5000;
const LONG_WAIT_MS = 30000;

const VARIANTS = {
  d60: { id: "d60", idleMs: 60000, bAtMs: 10000, desc: "60 s idle, B types ` B1` at T0+10 s" },
  d600: { id: "d600", idleMs: 600000, bAtMs: 30000, desc: "10-minute idle (ONE run), B types ` B1` at T0+30 s" },
};

const tokensOf = (text) => (text ? text.trim().split(/\s+/).filter(Boolean) : []);
const clipList = (arr, n = 6) => (arr.length > n ? `${arr.slice(0, n).join(" ")} ...(+${arr.length - n})` : arr.join(" "));

/** A log of EVERY request and WebSocket of a page (any URL), with host-clock event times. */
function attachAllRequestLog(page, labels) {
  const entries = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    entries.push({ kind: "request", t: hostNow(), method: req.method(), resourceType: req.resourceType(), path: labels.apply(u.pathname), hasQuery: u.search.length > 0, scheme: u.protocol });
  });
  page.on("websocket", (ws) => {
    const u = new URL(ws.url());
    entries.push({ kind: "websocket", t: hostNow(), path: labels.apply(u.pathname) });
  });
  return entries;
}

const inWindow = (entries, from, to) => entries.filter((e) => e.t >= from && e.t < to);
const rel = (T0) => (e) => ({ ...(e.n ? { n: e.n } : {}), kind: e.kind, method: e.method, type: e.resourceType, path: e.path + (e.hasQuery ? "?..." : ""), msAfterT0: Math.round(e.t - T0) });

/** The harness's /api log (with status) for a window, plus the unfiltered-log list for the same window. */
function requestsInWindow(client, allReq, from, to, T0) {
  const api = client.log().filter((e) => e.sendT >= from && e.sendT < to).map((e) => ({ n: e.n, method: e.method, path: e.path, status: e.status, msAfterT0: Math.round(e.sendT - T0), hasDocument: !!e.doc }));
  const all = inWindow(allReq, from, to).map(rel(T0));
  return {
    window: { fromMsAfterT0: Math.round(from - T0), toMsAfterT0: Math.round(to - T0), spanMs: Math.round(to - from) },
    apiRequests: api,
    allRequestsUnfiltered: all,
    count: { api: api.length, allUnfiltered: all.length },
    result: all.length === 0 && api.length === 0 ? `none (the page's unfiltered request log is empty for ${Math.round((to - from) / 1000 * 10) / 10} s)` : "listed",
    anyPatch: api.filter((e) => e.method === "PATCH").length,
    anyNonGet: all.filter((e) => e.method !== "GET").length,
  };
}

async function pageFacts(page) {
  return page.evaluate(() => ({ visibilityState: document.visibilityState, hasFocus: document.hasFocus(), activeIsEditor: !!document.activeElement?.closest?.(".ProseMirror"), scrollY: window.scrollY })).catch((e) => ({ error: errLine(e) }));
}

/** Page-local listeners on A's document/window (instrumentation only: no network, no input). */
async function installPageListeners(page) {
  await page.evaluate(() => {
    window.__s4evt = [];
    const push = (type, extra) => window.__s4evt.push({ t: Date.now(), type, state: document.visibilityState, ...(extra ?? {}) });
    document.addEventListener("visibilitychange", () => push("document.visibilitychange"));
    window.addEventListener("focus", () => push("window.focus"));
    window.addEventListener("blur", () => push("window.blur"));
    window.addEventListener("pageshow", () => push("window.pageshow"));
    window.addEventListener("pagehide", () => push("window.pagehide"));
    window.addEventListener("online", () => push("window.online"));
    window.addEventListener("offline", () => push("window.offline"));
    document.addEventListener("freeze", () => push("document.freeze"));
    document.addEventListener("resume", () => push("document.resume"));
    window.addEventListener("scroll", () => push("window.scroll"), true);
    document.addEventListener("focusin", (e) => push("document.focusin", { target: e.target?.tagName ?? null, inEditor: !!e.target?.closest?.(".ProseMirror") }), true);
    document.addEventListener("focusout", (e) => push("document.focusout", { target: e.target?.tagName ?? null, inEditor: !!e.target?.closest?.(".ProseMirror") }), true);
  });
}
const readPageEvents = (page) => page.evaluate(() => window.__s4evt ?? []).catch(() => null);

async function runRepetition(variant, n, total) {
  const wallStart = Date.now();
  const session = await openSession({ label: `s4${variant.id}r${n}` });
  const { server, clients, labels } = session;
  const { A, B } = clients;
  const rec = createRecord({
    scenario: "s4",
    repetition: n,
    runId: session.run.runId,
    server,
    note: `S4 idle then resume, ${variant.desc}, run ${n} of ${total}. Measurement of the unchanged product. Fresh server, project and resource.`,
  });
  const out = { variant: variant.id, runId: session.run.runId, port: server.port, pid: server.pid, harnessError: null };
  const heartbeat = { beats: [], lastWall: Date.now(), lastPerf: hostNow(), maxWallGapMs: 0, maxPerfGapMs: 0, gapsOver3s: [] };
  const hb = setInterval(() => {
    const w = Date.now();
    const p = hostNow();
    const wg = w - heartbeat.lastWall;
    const pg = p - heartbeat.lastPerf;
    heartbeat.maxWallGapMs = Math.max(heartbeat.maxWallGapMs, wg);
    heartbeat.maxPerfGapMs = Math.max(heartbeat.maxPerfGapMs, pg);
    if (wg > 3000 || pg > 3000) heartbeat.gapsOver3s.push({ at: new Date(w).toISOString(), wallGapMs: wg, perfGapMs: Math.round(pg) });
    heartbeat.lastWall = w;
    heartbeat.lastPerf = p;
    heartbeat.beats.push(1);
  }, 1000);
  const onSignal = async () => {
    clearInterval(hb);
    await session.close().catch(() => {});
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const typings = { A: [], B: [] };

  try {
    const allReqA = attachAllRequestLog(A.page, labels);
    const allReqB = attachAllRequestLog(B.page, labels);
    rec.set("variant", { id: variant.id, description: variant.desc, idleMs: variant.idleMs, bTypesAtMsAfterT0: variant.bAtMs, touchWindowMs: TOUCH_WINDOW_MS });
    rec.set("preChecks", {
      listeners7340: session.pre.listeners7340.length ? session.pre.listeners7340 : "none",
      listeners3000: session.pre.listeners3000.length ? session.pre.listeners3000 : "none",
      chosenPort: server.port,
      chosenPortListenersBeforeStart: "none (checked immediately before start)",
      serverPidsRecorded: [...server.known.entries()].map(([pid, comm]) => ({ pid, comm })),
      browserPidsRecorded: session.browserPids.map((p) => ({ pid: p.pid, comm: p.comm })),
      clientsPaired: Object.fromEntries(Object.entries(clients).map(([k, c]) => [k, { paired: c.pairFacts.paired, deviceCookiePresent: c.pairFacts.deviceCookiePresent }])),
      throwawayRootAsserted: session.run.dir,
      wallClockStart: new Date(wallStart).toISOString(),
    });

    const project = await createFixtureProject(server, `S4${variant.id}r${n} ${session.run.runId}`, labels);
    const resource = await createFixtureResource(server, project, `Doc ${session.run.runId}`, labels, "R1");
    const ctx = { session, resource, A, B };
    const sinceMs = hostNow();
    const searchTokensList = ["B1", "charlieQ"];
    rec.step("fixture created through POST /api/projects and POST /api/resource", { resourceLabel: "R1", baseContentChars: resource.baseContent.length, searchTokens: searchTokensList });
    const initial = await readServerState(ctx, sinceMs, searchTokensList);
    rec.step("initial stores read before any client opened the resource", { classification: describeClassification(initial.st.classification) });

    const openA = await A.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    await installPageListeners(A.page);
    const openB = await B.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const afterOpen = await snapEditors(A, B);
    const aFactsAtOpen = await pageFacts(A.page);
    rec.step("A then B opened R in the real editor; page listeners installed on A", { openA, openB, editors: afterOpen, aPageFactsAtOpen: aFactsAtOpen });
    await sleep(OPEN_SETTLE_MS);
    await A.idle();
    await B.idle();
    const T0 = hostNow();
    const aRequestsBeforeT0 = A.requests.length;
    rec.step(`T0 stamped (${OPEN_SETTLE_MS} ms open-settle after both opened); A is idle (no input) from here`, { T0: isoOf(T0), aRequestsBeforeT0, bRequestsBeforeT0: B.requests.length, aAllRequestsBeforeT0: allReqA.length, bAllRequestsBeforeT0: allReqB.length, wallClock: new Date().toISOString() });

    // ---- B edits during A's idle ------------------------------------------
    await sleep(Math.max(0, T0 + variant.bAtMs - hostNow()));
    const bBefore = B.okPatchCount();
    const bTypeStartMsAfterT0 = Math.round(hostNow() - T0);
    const typedB = await B.typeText(MARKERS.B1);
    typings.B.push({ text: MARKERS.B1, startT: typedB.startT, endT: typedB.endT });
    const savedB = await B.waitForSaved({ afterCount: bBefore, timeoutMs: 25000 });
    const bAckT = hostNow();
    const editorsRightAfterB = await snapEditors(A, B);
    rec.step("B typed ` B1` and its save was acknowledged (A idle)", { bTypeStartMsAfterT0, typed: { firstToLastMs: typedB.firstToLastMs }, saved: savedB, msAfterT0: Math.round(bAckT - T0), editorsRightAfterB });
    await sleep(READ_AT_MS);
    const stateAfterB = await readServerState(ctx, sinceMs, searchTokensList);
    const editorsAfterBRead = await snapEditors(A, B);
    rec.step("stores read after B's save (A still idle)", { classification: describeClassification(stateAfterB.st.classification), msAfterT0: Math.round(hostNow() - T0) });

    // ---- the rest of the idle, to the recorded duration ---------------------
    await sleep(Math.max(0, T0 + variant.idleMs - hostNow()));
    const idleEndT = hostNow();
    const wallAtIdleEnd = new Date().toISOString();
    const editorsEndOfIdle = await snapEditors(A, B);
    const aFactsEndOfIdle = await pageFacts(A.page);
    rec.step("end of idle", { idleMeasuredMs: Math.round(idleEndT - T0), wallClock: wallAtIdleEnd, editorsEndOfIdle, aPageFactsEndOfIdle: aFactsEndOfIdle });
    const idleWindow = requestsInWindow(A, allReqA, T0, idleEndT, T0);
    const idleWindowB = requestsInWindow(B, allReqB, T0, idleEndT, T0);

    // ---- touches on A, no typing ------------------------------------------
    const touchLog = [];
    const doTouch = async (id, desc, fn) => {
      const evBefore = (await readPageEvents(A.page))?.length ?? 0;
      const visLogBefore = (await A.visibilityEvents()).length;
      const start = hostNow();
      let detail = null;
      let error = null;
      try {
        detail = await fn();
      } catch (e) {
        error = errLine(e);
      }
      const end = hostNow();
      await sleep(TOUCH_WINDOW_MS);
      const winEnd = hostNow();
      const evAll = (await readPageEvents(A.page)) ?? [];
      const visAll = await A.visibilityEvents();
      const editors = await snapEditors(A, B);
      const facts = await pageFacts(A.page);
      const t = {
        id,
        desc,
        startMsAfterT0: Math.round(start - T0),
        endMsAfterT0: Math.round(end - T0),
        durationMs: Math.round(end - start),
        observationWindowMs: Math.round(winEnd - start),
        detail,
        error,
        requestsAWindow: requestsInWindow(A, allReqA, start, winEnd, T0),
        requestsBWindow: requestsInWindow(B, allReqB, start, winEnd, T0),
        aPageEventsInWindow: evAll.slice(evBefore).map((e) => ({ ...e, msAfterStart: Math.round(e.t - start) })),
        contextWideVisibilityLogEventsInWindow: visAll.slice(visLogBefore).map((v) => ({ state: v.state, msAfterStart: Math.round(v.t - start) })),
        aEditorAfter: editors.A,
        aPageFactsAfter: facts,
      };
      touchLog.push(t);
      rec.step(`touch ${id}`, { startMsAfterT0: t.startMsAfterT0, durationMs: t.durationMs, apiRequestsA: t.requestsAWindow.count.api, allRequestsA: t.requestsAWindow.count.allUnfiltered, pageEvents: t.aPageEventsInWindow.map((e) => e.type), error });
    };

    await doTouch("click", "click in the editor (locator.click, no key pressed)", async () => {
      await A.editor().click();
      return { text: "clicked the editor element's centre" };
    });
    await doTouch("focus_out_and_back", "document.activeElement.blur(), 1 s, editor.focus()", async () => {
      const before = await pageFacts(A.page);
      await A.page.evaluate(() => document.activeElement?.blur?.());
      await sleep(1000);
      const mid = await pageFacts(A.page);
      await A.editor().focus();
      return { before, whileBlurred: mid };
    });
    await doTouch("scroll", "mouse moved over the editor, wheel down 600 then up 600", async () => {
      const box = await A.editor().boundingBox();
      await A.page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
      await A.page.mouse.wheel(0, 600);
      await sleep(300);
      await A.page.mouse.wheel(0, -600);
      return { editorBox: box && { w: Math.round(box.width), h: Math.round(box.height) } };
    });
    await doTouch("visibility_second_page", "a second page opened in A's context, brought to front, closed", async () => {
      const before = await pageFacts(A.page);
      const p2 = await A.context.newPage();
      await p2.bringToFront().catch(() => {});
      await sleep(1500);
      const during = await pageFacts(A.page);
      const secondState = await p2.evaluate(() => document.visibilityState).catch((e) => errLine(e));
      await p2.close();
      await sleep(1000);
      const after = await pageFacts(A.page);
      return { aBefore: before, aWhileSecondPageOpen: during, secondPageVisibilityState: secondState, aAfterSecondPageClosed: after, secondPageUrl: "about:blank (no /api request is made by it; its requests are not in A's page log)" };
    });
    await doTouch("bringToFront_A", "A.page.bringToFront() on its own", async () => {
      const before = await pageFacts(A.page);
      await A.page.bringToFront();
      await sleep(500);
      const after = await pageFacts(A.page);
      return { before, after };
    });

    const touchesEndT = hostNow();
    const aPatchesBeforeQ = A.requests.filter((r) => r.method === "PATCH").length;
    const aNonGetBeforeQ = allReqA.filter((e) => e.t >= T0 && e.method && e.method !== "GET").map(rel(T0));
    const wholePreQWindow = requestsInWindow(A, allReqA, T0, touchesEndT, T0);
    const editorsBeforeQ = await snapEditors(A, B);
    const aFactsBeforeQ = await pageFacts(A.page);
    rec.step("all touches done; A has not typed", { aPatchesSentSoFar: aPatchesBeforeQ, msAfterT0: Math.round(touchesEndT - T0), editorsBeforeQ, aFactsBeforeQ });

    // ---- A types Q ----------------------------------------------------------
    const aBefore = A.okPatchCount();
    const qStartMsAfterT0 = Math.round(hostNow() - T0);
    const typedQ = await A.typeText(MARKERS.Q);
    typings.A.push({ text: MARKERS.Q, startT: typedQ.startT, endT: typedQ.endT });
    const editorAfterTypingQ = await A.editorText();
    const footerAfterTypingQ = await A.footer();
    const savedQ = await A.waitForSaved({ afterCount: aBefore, timeoutMs: 25000 });
    const qAckT = hostNow();
    const editorsRightAfterQ = await snapEditors(A, B);
    rec.step("A typed `Q` and its save was acknowledged", { qStartMsAfterT0, typed: { firstToLastMs: typedQ.firstToLastMs }, editorAfterTypingQ, footerAfterTypingQ, saved: savedQ, editorsRightAfterQ });
    await sleep(READ_AT_MS);
    const stateAfterQ = await readServerState(ctx, sinceMs, searchTokensList);
    const spent = hostNow() - qAckT;
    if (spent < WAIT_AFTER_SAVE_MS) await sleep(WAIT_AFTER_SAVE_MS - spent);
    const editorsAt5s = await snapEditors(A, B);
    rec.step("5 s after Q's save acknowledgement", { editorsAt5s, msFromSaveAckToEndOfStoresRead: Math.round(spent) });
    const remaining = LONG_WAIT_MS - (hostNow() - qAckT);
    if (remaining > 0) await sleep(remaining);
    const editorsAt30s = await snapEditors(A, B);
    rec.step("30 s after Q's save acknowledgement, no reload", { editors: editorsAt30s });
    const aPageEventsAll = (await readPageEvents(A.page)) ?? [];
    const visLogAAll = await A.visibilityEvents();

    const reloadA = await A.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const reloadB = await B.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const afterReload = await snapEditors(A, B);
    rec.step("both reloaded (page reload, then reopen)", { reloadA, reloadB, editors: afterReload });
    const final = await readServerState(ctx, sinceMs, searchTokensList);
    const reloadTexts = { A: afterReload.A.text, B: afterReload.B.text };
    const finalVerdict = verdict({ classification: final.st.classification, last: final.last, docs: final.docs, reloadTexts, requireReload: true });
    rec.step("final stores read after reload", { classification: describeClassification(final.st.classification) });
    const wallEnd = Date.now();

    // ---- derived -----------------------------------------------------------
    const docs = final.docs;
    const bLabel = Object.keys(docs).filter((l) => l.startsWith("B#")).at(-1);
    const aLabel = Object.keys(docs).filter((l) => l.startsWith("A#")).at(-1);
    const bTokens = tokensOf(plainOfContent(docs[bLabel]) ?? "");
    const aTokens = new Set(tokensOf(plainOfContent(docs[aLabel]) ?? ""));
    const lostTokens = [...new Set(bTokens.filter((t) => !aTokens.has(t)))];
    const countTokensIn = (content, toks) => {
      const plain = content === null ? null : plainOfContent(content);
      if (plain === null) return null;
      const have = new Set(tokensOf(plain));
      return toks.filter((t) => have.has(t)).length;
    };
    const where = (state) => {
      const snap = state.st.snapshot;
      return {
        lostTokens: clipList(lostTokens, 8),
        canonicalContentBin: countTokensIn(snap.revisions.find((r) => r.meta?.isCanonical)?.contentBin ?? null, lostTokens),
        contentTiptapJson: countTokensIn(snap.files.tiptap, lostTokens),
        contentTxt: snap.files.txt === null ? null : lostTokens.filter((t) => new Set(tokensOf(snap.files.txt)).has(t)).length,
        nonCanonicalRevisions: snap.revisions.filter((r) => !r.meta?.isCanonical).map((r) => ({ dir: r.dir, name: r.meta?.name ?? null, automaticSnapshot: r.meta?.automaticSnapshot ?? null, lostTokensPresent: countTokensIn(r.contentBin, lostTokens) })),
      };
    };
    const classifyRevisions = (state) =>
      state.st.classification.revisionContents.map((r) => ({ dir: r.dir, canonical: r.canonical, name: r.name, automaticSnapshot: r.automaticSnapshot, contains: r.status === "equals" ? `= ${r.equals.join("/")}` : r.status === "none" ? "NONE of the documents the harness holds" : r.status }));
    const vsServer = (snap, st) => {
      const sp = st.heldPlain;
      return { serverHolds: st.st.classification.heldLabels, A_editorEqualsServerText: sp === null ? null : normalizeWs(snap.A.text) === normalizeWs(sp), B_editorEqualsServerText: sp === null ? null : normalizeWs(snap.B.text) === normalizeWs(sp) };
    };
    const qDocPlain = plainOfContent(docs[aLabel]) ?? "";
    const aPatches = A.requests.filter((r) => r.method === "PATCH").map((r) => {
      const prior = typings.A.filter((t) => t.endT <= r.sendT).at(-1);
      return { n: r.n, sendMsAfterT0: Math.round(r.sendT - T0), status: r.status, hasDocument: !!r.doc, markers: r.doc?.markers ?? null, msAfterLastTypingEnd: prior ? Math.round(r.sendT - prior.endT) : null, precededByTyping: !!prior, afterAReloadMark: A.marks().some((m) => m.t < r.sendT) };
    });
    const bPatches = B.requests.filter((r) => r.method === "PATCH").map((r) => {
      const prior = typings.B.filter((t) => t.endT <= r.sendT).at(-1);
      return { n: r.n, sendMsAfterT0: Math.round(r.sendT - T0), status: r.status, hasDocument: !!r.doc, markers: r.doc?.markers ?? null, msAfterLastTypingEnd: prior ? Math.round(r.sendT - prior.endT) : null, precededByTyping: !!prior, afterAReloadMark: B.marks().some((m) => m.t < r.sendT) };
    });
    const sentQ = A.requests.filter((r) => r.method === "PATCH" && r.doc && r.sendT >= typedQ.startT).map((r) => ({ n: r.n, markers: r.doc.markers, baseWordsPresent: r.doc.baseWordsPresent, length: r.doc.length, sha256: r.doc.sha256, status: r.status, updatedAt: r.fields?.updatedAt ?? null, snapshotCreated: r.fields?.snapshotCreated ?? null, writingLog: r.fields?.writingLog ?? null }));
    const sentB = B.requests.filter((r) => r.method === "PATCH" && r.doc).map((r) => ({ n: r.n, markers: r.doc.markers, length: r.doc.length, sha256: r.doc.sha256, status: r.status, updatedAt: r.fields?.updatedAt ?? null, snapshotCreated: r.fields?.snapshotCreated ?? null, writingLog: r.fields?.writingLog ?? null }));

    const notificationsSince = async (client, sinceT) => {
      const marks = client.marks();
      const relT = (t) => {
        const prior = marks.filter((m) => m.t <= t).at(-1);
        return { msAfterSince: Math.round(t - sinceT), msAfterT0: Math.round(t - T0), msAfterReloadMark: prior ? Math.round(t - prior.t) : null };
      };
      return {
        sinceAt: isoOf(sinceT),
        surfacesChecked: "role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at the moments listed), snapshotCreated flags",
        surfaces: (await client.surfaces(sinceT)).map((s) => ({ role: s.role, text: s.text, ...relT(s.t) })),
        console: client.consoleMsgs.filter((m) => m.t >= sinceT).map((m) => ({ type: m.type, text: m.text, ...relT(m.t) })),
        pageErrors: client.pageErrors.filter((m) => m.t >= sinceT).map((m) => ({ text: m.text, ...relT(m.t) })),
        dialogs: client.dialogs.filter((m) => m.t >= sinceT).map((m) => ({ type: m.type, message: m.message, ...relT(m.t) })),
        failedRequests: client.failedRequests.map((f) => ({ f, req: client.requests.find((r) => r.n === f.n) })).filter(({ req }) => req && req.sendT >= sinceT).map(({ f, req }) => ({ method: f.method, path: client.log().find((l) => l.n === f.n)?.path, error: f.error, ...relT(req.sendT) })),
        nonOkResponses: client.requests.filter((r) => r.sendT >= sinceT && r.ok === false).map((r) => ({ method: r.method, path: client.log().find((l) => l.n === r.n)?.path, status: r.status, body: r.errorBody, ...relT(r.sendT) })),
        patchResponseSignals: client.requests.filter((r) => r.method === "PATCH" && r.fields && r.respT >= sinceT).map((r) => ({ n: r.n, snapshotCreated: r.fields.snapshotCreated, writingLog: r.fields.writingLog })),
        reloadMarks: marks.map((m) => ({ name: m.name, at: isoOf(m.t), msAfterSince: Math.round(m.t - sinceT) })),
      };
    };
    const notifA = await notificationsSince(A, bAckT);
    const notifB = await notificationsSince(B, qAckT);

    const perBin = (client, binMs) => {
      const bins = [];
      for (let s = 0; s < variant.idleMs; s += binMs) {
        bins.push({ fromS: s / 1000, toS: Math.min(s + binMs, variant.idleMs) / 1000, apiRequests: client.log().filter((e) => e.sendT >= T0 + s && e.sendT < T0 + s + binMs).length });
      }
      return bins;
    };
    const idleBinsA = perBin(A, variant.idleMs >= 300000 ? 60000 : 10000);
    const idleBinsB = perBin(B, variant.idleMs >= 300000 ? 60000 : 10000);

    // ---- outcomes -----------------------------------------------------------
    rec.outcome(1, {
      onDiskNames: "revisions/<R1>/v-N/content.bin (UTF-8 JSON text) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json; .trash names listed",
      initial: compactState(initial),
      afterBSave_AstillIdle: compactState(stateAfterB),
      afterAQSave: compactState(stateAfterQ),
      afterReload: compactState(final),
    });
    rec.outcome(2, {
      note: "both open; right after B's save (A idle); end of idle; after each touch (aEditorAfter in the touch records); before Q; right after Q's save; +5 s; +30 s (no reload); after reload",
      step0_bothOpen: afterOpen,
      rightAfterBSave: editorsRightAfterB,
      afterBStoresRead: editorsAfterBRead,
      endOfIdle: editorsEndOfIdle,
      beforeQ: editorsBeforeQ,
      rightAfterQSave: editorsRightAfterQ,
      at5sAfterQSave: editorsAt5s,
      at30sAfterQSave_noReload: editorsAt30s,
      afterReload,
      vsServer: { endOfIdle: vsServer(editorsEndOfIdle, stateAfterB), beforeQ: vsServer(editorsBeforeQ, stateAfterB), rightAfterQ: vsServer(editorsRightAfterQ, stateAfterQ), at30s: vsServer(editorsAt30s, stateAfterQ), afterReload: vsServer(afterReload, final) },
    });
    rec.outcome(3, { A_idle_sinceBsave: notifA, B_sinceAQsave: notifB });
    rec.outcome(4, {
      note: "established from outcome 1 (which document each store held after A's Q save) and the PATCH log",
      aDocumentSentWithQ: sentQ,
      aSaveEndsWithCharlieQ: qDocPlain.endsWith("charlieQ"),
      bTokensNotInADocument: lostTokens,
      bMarkerInASentDocument: sentQ.flatMap((d) => d.markers).includes("B1"),
      storesHeldAfterQSave: stateAfterQ.st.classification.heldLabels,
      aEditorTextAtQTypingStart: editorsBeforeQ.A.text,
      bEditorTextAtQTypingStart: editorsBeforeQ.B.text,
      aPatchesSentBeforeQTyping: aPatchesBeforeQ,
      everyPatchByA: aPatches,
      everyPatchByB: bPatches,
    });
    rec.outcome(5, {
      afterBSave: { revisions: classifyRevisions(stateAfterB), writingLogActual: stateAfterB.cmp.actual, writingLogExpected: stateAfterB.expected, writingLogMatchesExpected: stateAfterB.cmp.match, tokensByProcessedSave: stateAfterB.logTokens, search: stateAfterB.search, sidecarWordCount: stateAfterB.st.summary.sidecar.wordCount },
      afterQSave: { revisions: classifyRevisions(stateAfterQ), writingLogActual: stateAfterQ.cmp.actual, writingLogExpected: stateAfterQ.expected, writingLogMatchesExpected: stateAfterQ.cmp.match, tokensByProcessedSave: stateAfterQ.logTokens, search: stateAfterQ.search, sidecarWordCount: stateAfterQ.st.summary.sidecar.wordCount, expectedWordCounts: stateAfterQ.st.classification.expectedWordCounts },
      afterReload: { revisions: classifyRevisions(final), writingLogActual: final.cmp.actual, writingLogExpected: final.expected, writingLogMatchesExpected: final.cmp.match, search: final.search, mentionIndex: { filePresent: final.st.summary.mentionsFilePresent, recordsForResource: final.st.summary.mentionRecords }, diagnosticsIndex: { filePresent: final.st.summary.diagnosticsFilePresent, recordForResource: final.st.summary.diagnosticsRecord } },
      backupRule_readNotRun: "revision-core.ts snapshotBeforeDestructiveWrite -> content-loss.ts: snapshot only if previous words > 0 AND (incoming has 0 words OR (previous - incoming >= 10 AND incoming <= previous * 0.5)); the Q save lost 1 word (` B1` replaced by `Q` attached to `charlie`), so the rule is not met. Read, not run.",
      indexesComparedToPlainText: "not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity); raw records printed",
    });
    const failedA = A.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const failedB = B.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const allNon2xx = [...A.requests, ...B.requests].filter((r) => r.ok === false).map((r) => ({ method: r.method, status: r.status, body: r.errorBody }));
    rec.outcome(6, {
      failedSavesA: failedA,
      failedSavesB: failedB,
      result: failedA.length + failedB.length === 0 ? "no failed save" : "see list",
      pointerIf404: [...failedA, ...failedB].some((f) => f.status === 404) ? "A 404 save response was recorded. Pointer, no cause stated: Feature 77 FR-37 record and the lead's POS note of 2026-10-10." : "no 404 save response",
      allNon2xxResponsesAnyPath: allNon2xx,
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

    // ---- the idle-period request record (the point of this scenario) ---------
    rec.set("idleRequests", {
      note: "Lists are from two logs: the harness's /api log (with status) and a log of EVERY request and WebSocket of the page (any URL), both on the host clock (Playwright event times, not wire times). 'none' states the span.",
      T0: isoOf(T0),
      idleAloneA: idleWindow,
      idleAloneB: idleWindowB,
      idleBinsA,
      idleBinsB,
      afterEachTouchBeforeQ_A: Object.fromEntries(touchLog.map((t) => [t.id, t.requestsAWindow])),
      afterEachTouchBeforeQ_B: Object.fromEntries(touchLog.map((t) => [t.id, t.requestsBWindow])),
      wholeIdlePlusTouches_A: wholePreQWindow,
      nonGetRequestsByAFromT0ToQ: aNonGetBeforeQ,
      aPatchesSentBeforeTyping: aPatchesBeforeQ,
      totalRequestsA: { api: A.requests.length, allUnfiltered: allReqA.length },
      totalRequestsB: { api: B.requests.length, allUnfiltered: allReqB.length },
      aRevisionContentGetsAfterOpen: A.log().filter((e) => e.method === "GET" && /\/api\/resource\/revision\//.test(e.path) && e.sendT > T0).map((e) => ({ n: e.n, path: e.path, msAfterT0: Math.round(e.sendT - T0) })),
      bRevisionContentGetsAfterOpen: B.log().filter((e) => e.method === "GET" && /\/api\/resource\/revision\//.test(e.path) && e.sendT > T0).map((e) => ({ n: e.n, path: e.path, msAfterT0: Math.round(e.sendT - T0) })),
    });
    rec.set("touches", touchLog);
    rec.set("visibility", {
      note: "A's own document listeners (installed after open) and the context-wide visibility log written by the harness's init script. The context-wide log is shared by every page in A's context, so while the second page of the visibility touch exists it can include that page's events; A's own listener log cannot.",
      aOwnListenerEventsAll: aPageEventsAll.map((e) => ({ ...e, msAfterT0: Math.round(e.t - T0) })),
      contextWideLogA: visLogAAll.map((v) => ({ state: v.state, msAfterT0: Math.round(v.t - T0) })),
      aStateAtOpen: aFactsAtOpen,
      aStateEndOfIdle: aFactsEndOfIdle,
    });
    rec.set("clockAndSleepCheck", {
      wallClockStart: new Date(wallStart).toISOString(),
      wallClockEnd: new Date(wallEnd).toISOString(),
      elapsedWallSeconds: Math.round((wallEnd - wallStart) / 100) / 10,
      idleMeasuredMs: Math.round(idleEndT - T0),
      heartbeatIntervalMs: 1000,
      heartbeatCount: heartbeat.beats.length,
      maxWallClockGapBetweenBeatsMs: heartbeat.maxWallGapMs,
      maxPerfClockGapBetweenBeatsMs: Math.round(heartbeat.maxPerfGapMs),
      gapsOver3s: heartbeat.gapsOver3s,
      verdict: heartbeat.gapsOver3s.length === 0 ? "no gap over 3 s between 1 s heartbeats on either clock: the process was not suspended" : "GAP FOUND: the machine or process may have slept; this run is to be discarded and rerun",
      requestLogGapNote: "idle request gaps are in idleRequests; a sleep would also show as a clock gap",
    });
    rec.finding("a_stale_editor_replaced_other_text_on_a_keystroke", {
      aDocumentSent: sentQ.map((d) => ({ markers: d.markers, baseWordsPresent: d.baseWordsPresent, length: d.length })),
      bTokensNotInADocument: lostTokens,
      storesHeldAfterQ: stateAfterQ.st.classification.heldLabels,
      bTokensStillInServerPlainAfterQ: lostTokens.filter((t) => new Set(tokensOf(stateAfterQ.heldPlain ?? "")).has(t)).length,
      varied: `idle ${variant.idleMs / 1000} s; B's save at T0+${variant.bAtMs / 1000} s; touches in a fixed order; A's keystroke is one character with no space`,
    });
    rec.finding("b_saves_sent_with_no_typing", {
      aPatchesBeforeQTyping: aPatchesBeforeQ,
      aNonGetRequestsFromT0ToQ: aNonGetBeforeQ.length,
      aRequestsIdleAlone: idleWindow.count,
      perTouchApiAndAllRequestsA: touchLog.map((t) => ({ touch: t.id, apiRequests: t.requestsAWindow.count.api, allRequestsUnfiltered: t.requestsAWindow.count.allUnfiltered, patches: t.requestsAWindow.anyPatch })),
      everyPatchByA: aPatches.map((p) => ({ n: p.n, precededByTyping: p.precededByTyping, msAfterLastTypingEnd: p.msAfterLastTypingEnd, markers: p.markers })),
      everyPatchByB: bPatches.map((p) => ({ n: p.n, precededByTyping: p.precededByTyping, msAfterLastTypingEnd: p.msAfterLastTypingEnd, markers: p.markers })),
    });
    rec.finding("c_overwritten_device_told_anything", { B_overwritten_sinceAQSave: notifB, A_sinceBSave: notifA, note: "full lists in outcome 3; surfaces named there" });
    rec.finding("d_overwritten_text_recoverable", {
      lostTokens: clipList(lostTokens, 8),
      afterQSave: { locations: where(stateAfterQ), revisions: classifyRevisions(stateAfterQ), trash: stateAfterQ.trash },
      afterReload: { locations: where(final), revisions: classifyRevisions(final), trash: final.trash },
      qSaveResponseSnapshotCreated: sentQ.map((d) => d.snapshotCreated),
      noRecoverableCopyAmongLocationsRead: where(final).nonCanonicalRevisions.every((r) => !r.lostTokensPresent) && !where(final).canonicalContentBin && !where(final).contentTxt,
      locationsNotLooked: "browser storage and caches, the server's memory and logs, the writer's other devices",
    });
    rec.finding("e_overwritten_editor_shows_text_the_server_no_longer_holds", {
      bEditorEqualsServerRightAfterQSave: vsServer(editorsRightAfterQ, stateAfterQ).B_editorEqualsServerText,
      bEditorAt5s: vsServer(editorsAt5s, stateAfterQ).B_editorEqualsServerText,
      bEditorAt30s_noReload: vsServer(editorsAt30s, stateAfterQ).B_editorEqualsServerText,
      bEditorAfterReload: vsServer(afterReload, final).B_editorEqualsServerText,
      aEditorAtEndOfIdle_vsServerBeforeQ: vsServer(editorsEndOfIdle, stateAfterB).A_editorEqualsServerText,
      aEditorEndOfIdleText: editorsEndOfIdle.A.text,
      bEditorFooterAt30s: editorsAt30s.B.footer,
    });
    rec.finding("f_writing_log_effect", { actual: stateAfterQ.cmp.actual, expected: stateAfterQ.expected, tokensByProcessedSave: stateAfterQ.logTokens.map((t) => ({ save: t.save, addedCount: t.addedCount, deletedCount: t.deletedCount, deletedTokens: clipList(t.deletedTokens, 8), addedTokens: clipList(t.addedTokens, 8) })), matchesExpected: stateAfterQ.cmp.match });
    rec.finding("g_failed_save_on_the_device_the_writer_believes_is_last", { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "none" : "see list" });

    rec.set("requestLogA", A.log());
    rec.set("requestLogB", B.log());
    rec.set("labelsRegistered", labels.entries());
    rec.set("pageReloadMarks", { A: A.marks().map((m) => ({ ...m, at: isoOf(m.t) })), B: B.marks().map((m) => ({ ...m, at: isoOf(m.t) })) });

    out.verdict = finalVerdict;
    out.last = final.last.determined ? final.last.docLabel : `order not determined (${final.last.reason})`;
    out.held = final.st.classification.heldLabels;
    out.idleMeasuredMs = Math.round(idleEndT - T0);
    out.elapsedWallSeconds = Math.round((wallEnd - wallStart) / 100) / 10;
    out.maxWallGapMs = heartbeat.maxWallGapMs;
    out.gapsOver3s = heartbeat.gapsOver3s;
    out.idleRequestsA = idleWindow.count;
    out.perTouch = touchLog.map((t) => ({ touch: t.id, a: t.requestsAWindow.count, patches: t.requestsAWindow.anyPatch, events: t.aPageEventsInWindow.map((e) => e.type) }));
    out.aPatchesBeforeQ = aPatchesBeforeQ;
    out.digest = buildDigest({ variant, n, total, session, rec, T0, idleWindow, idleWindowB, touchLog, stateAfterB, stateAfterQ, final, finalVerdict, editorsEndOfIdle, editorsBeforeQ, editorsRightAfterQ, editorsAt30s, afterReload, sentQ, sentB, aPatches, notifA, notifB, failedA, failedB, lostTokens, where, classifyRevisions, vsServer, heartbeat, wallStart, wallEnd, aPageEventsAll });
  } catch (e) {
    out.harnessError = errLine(e);
    rec.set("HARNESS ERROR", errLine(e));
    say(`HARNESS ERROR (variant ${variant.id} run ${n}): ${errLine(e)}`);
    process.exitCode = 1;
  } finally {
    clearInterval(hb);
    const teardown = await session.close();
    rec.set("teardown", teardown);
    out.teardown = teardown;
    rec.print(say);
    try {
      out.jsonFile = rec.writeJson(path.join(RESULTS_DIR, "s4"));
      say(`JSON written: ${out.jsonFile}`);
    } catch (e) {
      say(`JSON NOT written: ${errLine(e)}`);
    }
    if (out.digest) {
      const dg = [...out.digest, "", `teardown: ${JSON.stringify(teardown)}`, `JSON: ${out.jsonFile ?? "(not written)"}`];
      const dfile = path.join(RESULTS_DIR, "s4", `${session.run.runId}-rep${String(n).padStart(2, "0")}-digest.txt`);
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

/** The compact text form of one run (everything except the two request logs, which the printed record carries). */
function buildDigest(c) {
  const { variant, n, total, session, rec, T0, idleWindow, idleWindowB, touchLog, stateAfterB, stateAfterQ, final, finalVerdict, editorsEndOfIdle, editorsBeforeQ, editorsRightAfterQ, editorsAt30s, afterReload, sentQ, sentB, aPatches, notifA, notifB, failedA, failedB, lostTokens, where, classifyRevisions, vsServer, heartbeat, wallStart, wallEnd, aPageEventsAll } = c;
  const L = [];
  const j = (x) => JSON.stringify(x);
  const ed = (e) => `A: "${normalizeWs(e.A.text)}" / ${e.A.footer.autosave} ; B: "${normalizeWs(e.B.text)}" / ${e.B.footer.autosave}`;
  const brief = (w) => ({ api: w.count.api, allUnfiltered: w.count.allUnfiltered, patches: w.anyPatch, nonGet: w.anyNonGet, result: w.result });
  L.push(`RUN s4 ${variant.id} ${n}/${total} run=${session.run.runId} commit=${rec.data.commit} node=${rec.data.node}`);
  L.push(`variant: ${variant.desc}`);
  L.push(`server: built standalone, sharing on, port ${rec.data.server.port}, pid ${rec.data.server.pid}; host to itself, not a second-device result; times are Playwright event times on the host clock`);
  L.push(`wall clock ${new Date(wallStart).toISOString()} -> ${new Date(wallEnd).toISOString()} (${Math.round((wallEnd - wallStart) / 100) / 10} s); heartbeat max wall gap ${heartbeat.maxWallGapMs} ms, max perf gap ${Math.round(heartbeat.maxPerfGapMs)} ms, gaps over 3 s: ${j(heartbeat.gapsOver3s)}`);
  L.push(`T0 ${isoOf(T0)}; idle measured ${Math.round(idleWindow.window.spanMs)} ms`);
  L.push(`IDLE ALONE, A: ${j(brief(idleWindow))}; list: ${j(idleWindow.allRequestsUnfiltered)} ; api: ${j(idleWindow.apiRequests)}`);
  L.push(`IDLE, B (B typed in it): ${j(brief(idleWindowB))}; api: ${j(idleWindowB.apiRequests.map((e) => `${e.method} ${e.path} ${e.status} @${e.msAfterT0}ms`))}`);
  for (const t of touchLog) {
    L.push(`TOUCH ${t.id}: start +${t.startMsAfterT0} ms, took ${t.durationMs} ms, window ${t.observationWindowMs} ms; A requests ${j(brief(t.requestsAWindow))}; listed: ${j(t.requestsAWindow.allRequestsUnfiltered)}; B requests ${j(brief(t.requestsBWindow))}; A page events ${j(t.aPageEventsInWindow.map((e) => `${e.type}:${e.state}${e.inEditor !== undefined ? `:inEditor=${e.inEditor}` : ""}@${e.msAfterStart}`))}; context-wide vis log ${j(t.contextWideVisibilityLogEventsInWindow)}; detail ${j(t.detail)}; error ${t.error}; A editor after: "${normalizeWs(t.aEditorAfter.text)}" / ${t.aEditorAfter.footer.autosave}; A page facts ${j(t.aPageFactsAfter)}`);
  }
  L.push(`A's own listener events, whole run before reload: ${j(aPageEventsAll.map((e) => `${e.type}:${e.state}@${Math.round(e.t - T0)}`))}`);
  L.push(`editors at end of idle: ${ed(editorsEndOfIdle)}`);
  L.push(`editors before Q: ${ed(editorsBeforeQ)}`);
  L.push(`editors right after Q save: ${ed(editorsRightAfterQ)}`);
  L.push(`editors 30 s after Q save, no reload: ${ed(editorsAt30s)}`);
  L.push(`editors after reload: ${ed(afterReload)}`);
  L.push(`A PATCHes: ${j(aPatches)}`);
  L.push(`sent by B: ${j(sentB)}`);
  L.push(`sent by A (Q): ${j(sentQ)}`);
  L.push(`stores after B's save (A idle): ${j(stateAfterB.st.classification && describeClassification(stateAfterB.st.classification))}; revisions ${j(classifyRevisions(stateAfterB))}`);
  L.push(`stores after A's Q save: ${j(describeClassification(stateAfterQ.st.classification))}; revisions ${j(classifyRevisions(stateAfterQ))}; sidecar ${j(stateAfterQ.st.summary.sidecar)}; expected wordCounts ${j(stateAfterQ.st.classification.expectedWordCounts)}`);
  L.push(`final stores: ${j(describeClassification(final.st.classification))}; revisions ${j(classifyRevisions(final))}; other entries under revisions/<R1>/: ${j(final.st.summary.otherRevisionEntries)}`);
  L.push(`.trash names: ${j(final.trash)}`);
  L.push(`last processed: ${j(final.last.determined ? { docLabel: final.last.docLabel, updatedAt: final.last.updatedAt } : { determined: false, reason: final.last.reason })}; evidence ${j(final.last.evidence)}`);
  L.push(`writing log: after B ${j(stateAfterB.cmp.actual)} (expected ${j(stateAfterB.expected)} match ${stateAfterB.cmp.match}); after Q ${j(stateAfterQ.cmp.actual)} (expected ${j(stateAfterQ.expected)} match ${stateAfterQ.cmp.match}); tokens ${j(stateAfterQ.logTokens.map((t) => ({ save: t.save, added: t.addedCount, deleted: t.deletedCount, addedTokens: t.addedTokens, deletedTokens: t.deletedTokens })))}`);
  L.push(`search after Q: ${j(Object.fromEntries(Object.entries(stateAfterQ.search).map(([k, v]) => [k, v.count ?? v.error])))}; final ${j(Object.fromEntries(Object.entries(final.search).map(([k, v]) => [k, v.count ?? v.error])))}`);
  L.push(`VERDICT: ${j(finalVerdict)}`);
  L.push(`lost tokens (B's words absent from A's document): ${j(lostTokens)}; locations after Q: ${j(where(stateAfterQ))}; after reload: ${j(where(final))}`);
  L.push(`editor vs server: ${j({ endOfIdle: vsServer(editorsEndOfIdle, stateAfterB), rightAfterQ: vsServer(editorsRightAfterQ, stateAfterQ), at30s: vsServer(editorsAt30s, stateAfterQ), afterReload: vsServer(afterReload, final) })}`);
  const slim = (nt) => ({ surfaces: nt.surfaces, console: nt.console, pageErrors: nt.pageErrors, dialogs: nt.dialogs, failedRequests: nt.failedRequests, nonOkResponses: nt.nonOkResponses, patchResponseSignals: nt.patchResponseSignals, reloadMarks: nt.reloadMarks });
  L.push(`notifications A (since B's ack; surfaces: ${notifA.surfacesChecked}): ${j(slim(notifA))}`);
  L.push(`notifications B (since A's Q ack): ${j(slim(notifB))}`);
  L.push(`failed saves: A ${j(failedA)}; B ${j(failedB)}`);
  return L;
}

async function main() {
  const which = process.argv[2];
  const total = Number(process.argv[3] ?? 1);
  if (!VARIANTS[which]) throw new Error(`usage: s4-idle-resume.mjs <${Object.keys(VARIANTS).join("|")}> [repetitions]`);
  const results = [];
  for (let n = 1; n <= total; n += 1) results.push(await runRepetition(VARIANTS[which], n, total));
  say("");
  say("S4 SUMMARY (host to itself, not a second-device result)");
  for (const r of results) {
    say(`  variant=${r.variant} run=${r.runId} port=${r.port} verdict=${r.verdict?.verdict ?? "HARNESS ERROR"} last=${r.last} held=${JSON.stringify(r.held)} idleMs=${r.idleMeasuredMs} wallS=${r.elapsedWallSeconds} maxWallGapMs=${r.maxWallGapMs} idleReqA=${JSON.stringify(r.idleRequestsA)} aPatchesBeforeQ=${r.aPatchesBeforeQ}`);
    if (r.verdict) say(`      reasons: ${JSON.stringify(r.verdict.reasons)}`);
    say(`      perTouch: ${JSON.stringify(r.perTouch)}`);
  }
  mkdirSync(path.join(RESULTS_DIR, "s4"), { recursive: true });
  const summaryFile = path.join(RESULTS_DIR, "s4", `summary-${results[0]?.runId ?? "none"}.json`);
  writeFileSync(summaryFile, `${JSON.stringify(results.map((r) => ({ variant: r.variant, runId: r.runId, port: r.port, pid: r.pid, verdict: r.verdict, last: r.last, held: r.held, idleMeasuredMs: r.idleMeasuredMs, elapsedWallSeconds: r.elapsedWallSeconds, maxWallGapMs: r.maxWallGapMs, gapsOver3s: r.gapsOver3s, idleRequestsA: r.idleRequestsA, perTouch: r.perTouch, aPatchesBeforeQ: r.aPatchesBeforeQ, jsonFile: r.jsonFile, digestFile: r.digestFile, harnessError: r.harnessError })), null, 2)}\n`);
  say(`summary JSON: ${summaryFile}`);
}

main().catch((e) => {
  console.error(`script error: ${errLine(e)}`);
  process.exit(1);
});
