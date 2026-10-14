#!/usr/bin/env node
/**
 * Feature 78, Task 3: scenario S1, in turn. A MEASUREMENT of the unchanged
 * product; it records and does not fix. Every request is host to itself, not a
 * second-device result.
 *
 * Sequence (one repetition = one fresh server, one fresh project, one fresh
 * resource with the base document `BASE alpha bravo charlie`):
 *   1. A and B both open R and the footer reads saved;
 *   2. A types " A1" (real keystrokes), waits for saved, then 5 s;
 *   3. B, NO reload, types " B1", waits for saved, then 5 s;
 *   4. A, NO reload, types " A2", waits for saved, then 5 s;
 *   5. both editors are read 30 s after the last save (no reload), then both
 *      reload and are read again.
 * After each typing step the six outcomes of tasks.md are read. The stores are
 * read in the middle of the 5 s wait (a passive read of files on disk), so the
 * next client starts typing about 5 s after the previous save was acknowledged;
 * the measured gap is recorded.
 *
 * A step's classification and "step state" verdict are informational. The
 * repetition's verdict is the one applied after the reload, against the Task 1
 * definition.
 *
 * Run OUTSIDE the command sandbox (server and Chromium). Usage:
 *   node s1-in-turn.mjs [repetitions=3]
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource } from "./lib/fixture.mjs";
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
import { allDocs, allSaves, notificationsSince, snapEditors, wordDelta } from "./lib/shared.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const say = (s) => console.log(s);
const TOKENS = ["A1", "A2", "B1", "BASE"];
const WAIT_AFTER_SAVE_MS = 5000;
const READ_AT_MS = 3500; // stores are read inside the 5 s wait, starting here
const LONG_WAIT_MS = 30000;

/** Read the six-outcome server state now (quiet wait, classify, log vs expected, search). */
async function readServerState(ctx, sinceMs) {
  const { docs } = allDocs(ctx);
  const st = await settleAndRead({ session: ctx.session, resource: ctx.resource, docs });
  const saves = allSaves(ctx);
  const last = determineLastProcessed(saves);
  const processed = [...saves].sort((x, y) => Date.parse(x.updatedAt) - Date.parse(y.updatedAt));
  const order = processed.map((s) => s.docLabel);
  const expected = expectedLogEntries(ctx.resource.baseContent, order.map((l) => docs[l]));
  const logSince = logEntriesSince(st.snapshot, sinceMs);
  const cmp = compareLog(logSince, expected);
  // which tokens each expected entry added / deleted (explanation of the word-bag rule, not an observation)
  let prev = plainOfContent(ctx.resource.baseContent) ?? "";
  const logTokens = order.map((l) => {
    const cur = plainOfContent(docs[l]) ?? "";
    const d = wordDelta(prev, cur);
    prev = cur;
    return { save: l, ...d };
  });
  const search = await searchFor(ctx.session, ctx.resource, TOKENS);
  const stepVerdict = verdict({ classification: st.classification, last, docs, requireReload: false });
  const heldPlain =
    st.classification.storesAgree && st.classification.heldLabels.length
      ? plainOfContent(docs[st.classification.heldLabels[0]])
      : null;
  return { st, saves, last, order, expected, logSince, cmp, logTokens, search, stepVerdict, heldPlain, docs };
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
        note: r.note ?? null,
        msAfterLastTypingEnd: prior ? Math.round(r.sendT - prior.endT) : null,
        lastTypingMarker: prior ? prior.text : null,
        afterAReloadMark: marks.some((m) => m.t < r.sendT),
      };
    });
}

async function runRepetition(n, total) {
  const session = await openSession({ label: `s1r${n}` });
  const { server, clients, labels } = session;
  const { A, B } = clients;
  const rec = createRecord({
    scenario: "s1",
    repetition: n,
    runId: session.run.runId,
    server,
    note: `S1 in turn, repetition ${n} of ${total}. Measurement of the unchanged product. Fresh server, project and resource.`,
  });
  const typings = { A: [], B: [] };
  const stepRecords = [];
  const out = { runId: session.run.runId, port: server.port, pid: server.pid, harnessError: null };
  const onSignal = async () => {
    await session.close().catch(() => {});
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
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

    const project = await createFixtureProject(server, `S1r${n} ${session.run.runId}`, labels);
    const resource = await createFixtureResource(server, project, `Doc ${session.run.runId}`, labels, "R1");
    const ctx = { session, resource, A, B };
    const sinceMs = hostNow();
    rec.step("fixture created through POST /api/projects and POST /api/resource", { resourceLabel: "R1", baseContentChars: resource.baseContent.length });

    const initial = await readServerState(ctx, sinceMs);
    rec.step("initial stores read before any client opened the resource", { classification: describeClassification(initial.st.classification) });

    const openA = await A.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const openB = await B.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const afterOpen = await snapEditors(A, B);
    rec.step("both clients opened R in the real editor", { openA, openB, editors: afterOpen });
    stepRecords.push({ step: 0, name: "both open R, footers", editors: afterOpen, initialSearch: initial.search });

    const plan = [
      { step: 1, who: "A", other: "B", marker: MARKERS.A1 },
      { step: 2, who: "B", other: "A", marker: MARKERS.B1 },
      { step: 3, who: "A", other: "B", marker: MARKERS.A2 },
    ];
    let lastSaveAck = null;
    const firstOtherSaveAck = { A: null, B: null };
    for (const p of plan) {
      const typer = clients[p.who];
      const gapMs = lastSaveAck === null ? null : Math.round(hostNow() - lastSaveAck);
      const editorsBeforeTyping = await snapEditors(A, B);
      rec.step(`step ${p.step}: ${p.who} about to type '${p.marker}'`, { msSinceLastSaveAck: gapMs, editorsBeforeTyping });
      const before = typer.okPatchCount();
      const patchCountBefore = typer.requests.filter((r) => r.method === "PATCH").length;
      const typed = await typer.typeText(p.marker);
      typings[p.who].push({ text: p.marker, startT: typed.startT, endT: typed.endT });
      const editorAfterTyping = await typer.editorText();
      const footerAfterTyping = await typer.footer();
      const saved = await typer.waitForSaved({ afterCount: before, timeoutMs: 25000 });
      const ackT = hostNow();
      lastSaveAck = ackT;
      if (firstOtherSaveAck[p.other] === null) firstOtherSaveAck[p.other] = ackT;
      const right = await snapEditors(A, B);
      rec.step(`step ${p.step}: ${p.who} typed '${p.marker}' and save acknowledged`, {
        typed: { firstToLastMs: typed.firstToLastMs, delayMs: typed.delayMs },
        editorAfterTyping,
        footerAfterTyping,
        saved,
        editorsRightAfterSave: right,
      });
      // stores are read inside the 5 s wait
      await sleep(READ_AT_MS);
      const state = await readServerState(ctx, sinceMs);
      const spent = hostNow() - ackT;
      if (spent < WAIT_AFTER_SAVE_MS) await sleep(WAIT_AFTER_SAVE_MS - spent);
      const at5s = await snapEditors(A, B);
      rec.step(`step ${p.step}: ${WAIT_AFTER_SAVE_MS} ms after the save acknowledgement`, { editorsAt5s: at5s, msFromSaveAckToEndOfStoresRead: Math.round(spent) });
      const sentThisStep = typer.requests.filter((r) => r.method === "PATCH" && r.doc && r.n > 0 && r.sendT >= typed.startT);
      stepRecords.push({
        step: p.step,
        who: p.who,
        marker: p.marker,
        msSinceLastSaveAckWhenTypingStarted: gapMs,
        patchesBeforeTypingInThisStep: typer.requests.filter((r) => r.method === "PATCH").length - sentThisStep.length - patchCountBefore,
        editorsBeforeTyping,
        editorsRightAfterSave: right,
        editorsAt5s: at5s,
        saved,
        sentDocument: sentThisStep.map((r) => ({ n: r.n, markers: r.doc.markers, baseWordsPresent: r.doc.baseWordsPresent, length: r.doc.length, sha256: r.doc.sha256, status: r.status, updatedAt: r.fields?.updatedAt ?? null, snapshotCreated: r.fields?.snapshotCreated ?? null, writingLog: r.fields?.writingLog ?? null })),
        server: compactState(state),
        _state: state,
      });
    }

    // 30 s after the last save, no reload (b)
    const lastAck = lastSaveAck;
    const remaining = LONG_WAIT_MS - (hostNow() - lastAck);
    if (remaining > 0) await sleep(remaining);
    const at30 = await snapEditors(A, B);
    rec.step("30 s after the last save acknowledgement, no reload (b)", { msSinceLastSaveAck: Math.round(hostNow() - lastAck), editors: at30 });

    const reloadA = await A.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const reloadB = await B.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const afterReload = await snapEditors(A, B);
    rec.step("both reloaded (page reload, then reopen) (c)", { reloadA, reloadB, editors: afterReload });
    const final = await readServerState(ctx, sinceMs);
    const reloadTexts = { A: afterReload.A.text, B: afterReload.B.text };
    const finalVerdict = verdict({ classification: final.st.classification, last: final.last, docs: final.docs, reloadTexts, requireReload: true });
    rec.step("final stores read after reload", { classification: describeClassification(final.st.classification) });

    // --- outcomes ---------------------------------------------------------
    const steps123 = stepRecords.filter((s) => s.step >= 1);
    rec.outcome(1, {
      onDiskNames: "revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json",
      initial: compactState(initial),
      afterStep1: steps123[0].server,
      afterStep2: steps123[1].server,
      afterStep3: steps123[2].server,
      afterReload: compactState(final),
    });
    const serverPlainAfter = (rr) => (rr.heldPlain === null ? null : rr.heldPlain);
    const editorVsServer = (snap, rr) => {
      const sp = serverPlainAfter(rr);
      return {
        serverHolds: rr.st.classification.heldLabels,
        A_editorEqualsServerText: sp === null ? null : normalizeWs(snap.A.text) === normalizeWs(sp),
        B_editorEqualsServerText: sp === null ? null : normalizeWs(snap.B.text) === normalizeWs(sp),
      };
    };
    rec.outcome(2, {
      note: "(a) immediately after the other client's save was acknowledged; (5 s) just before the next client typed; (b) 30 s after the LAST save only (the sequence puts the next step at 5 s, so a 30 s read per step is not possible); (c) after reload.",
      step0_bothOpen: afterOpen,
      step1: { editorsBeforeTyping: steps123[0].editorsBeforeTyping, editorsRightAfterSave: steps123[0].editorsRightAfterSave, editorsAt5s: steps123[0].editorsAt5s, vsServerRightAfter: editorVsServer(steps123[0].editorsAt5s, steps123[0]._state) },
      step2: { editorsBeforeTyping: steps123[1].editorsBeforeTyping, editorsRightAfterSave: steps123[1].editorsRightAfterSave, editorsAt5s: steps123[1].editorsAt5s, vsServerAt5s: editorVsServer(steps123[1].editorsAt5s, steps123[1]._state) },
      step3: { editorsBeforeTyping: steps123[2].editorsBeforeTyping, editorsRightAfterSave: steps123[2].editorsRightAfterSave, editorsAt5s: steps123[2].editorsAt5s, vsServerAt5s: editorVsServer(steps123[2].editorsAt5s, steps123[2]._state) },
      at30sAfterLastSave_noReload: at30,
      vsServerAt30s: editorVsServer(at30, steps123[2]._state),
      afterReload,
      vsServerAfterReload: editorVsServer(afterReload, final),
    });
    const notifA = await notificationsSince(A, firstOtherSaveAck.A ?? hostNow());
    const notifB = await notificationsSince(B, firstOtherSaveAck.B ?? hostNow());
    rec.outcome(3, { A_sinceBsFirstSave: notifA, B_sinceAsFirstSave: notifB });
    const patchesA = patchAnalysis(A, typings.A);
    const patchesB = patchAnalysis(B, typings.B);
    const heldAfter = (i) => steps123[i].server.heldLabels;
    const markersOf = (lbl) => {
      const d = final.docs[lbl];
      const p = d ? plainOfContent(d) : null;
      return p === null ? null : p.split(/\s+/).filter((t) => ["A1", "A2", "B1"].includes(t));
    };
    rec.outcome(4, {
      note: "established from outcome 1 (which document each store held after the step) and the PATCH log (markers in each sent document)",
      step2_B_stale_saved: {
        documentSentByB: steps123[1].sentDocument.map((d) => ({ markers: d.markers, baseWordsPresent: d.baseWordsPresent })),
        markersHeldByEachDocument: { "A#1": markersOf("A#1"), "B#1": markersOf("B#1") },
        storesHeldAfterStep2: heldAfter(1),
        patchesBByBeforeTypingInStep2: steps123[1].patchesBeforeTypingInThisStep,
        BsEditorTextAtTypingStart: steps123[1].editorsBeforeTyping.B.text,
        BsEditorHeldAsText_A1: normalizeWs(steps123[1].editorsBeforeTyping.B.text).split(" ").includes("A1"),
      },
      step3_A_stale_saved: {
        documentSentByA: steps123[2].sentDocument.map((d) => ({ markers: d.markers, baseWordsPresent: d.baseWordsPresent })),
        markersHeldByEachDocument: { "A#1": markersOf("A#1"), "B#1": markersOf("B#1"), "A#2": markersOf("A#2") },
        storesHeldAfterStep3: heldAfter(2),
        patchesAByBeforeTypingInStep3: steps123[2].patchesBeforeTypingInThisStep,
        AsEditorTextAtTypingStart: steps123[2].editorsBeforeTyping.A.text,
        AsEditorHeldAsText_B1: normalizeWs(steps123[2].editorsBeforeTyping.A.text).split(" ").includes("B1"),
      },
      everyPatchSentByA: patchesA,
      everyPatchSentByB: patchesB,
    });
    rec.outcome(5, {
      afterStep1: { revisions: steps123[0].server.revisionContents, writingLogActual: steps123[0].server.writingLogActual, writingLogExpected: steps123[0].server.writingLogExpected, writingLogMatchesExpected: steps123[0].server.writingLogMatchesExpected, tokens: steps123[0].server.writingLogTokensByProcessedSave, search: steps123[0].server.search, sidecarWordCount: steps123[0].server.sidecar.wordCount, expectedWordCounts: steps123[0].server.expectedWordCounts, mentionIndex: steps123[0].server.mentionIndex, diagnosticsIndex: steps123[0].server.diagnosticsIndex },
      afterStep2: { revisions: steps123[1].server.revisionContents, writingLogActual: steps123[1].server.writingLogActual, writingLogExpected: steps123[1].server.writingLogExpected, writingLogMatchesExpected: steps123[1].server.writingLogMatchesExpected, tokens: steps123[1].server.writingLogTokensByProcessedSave, search: steps123[1].server.search, sidecarWordCount: steps123[1].server.sidecar.wordCount, expectedWordCounts: steps123[1].server.expectedWordCounts, mentionIndex: steps123[1].server.mentionIndex, diagnosticsIndex: steps123[1].server.diagnosticsIndex },
      afterStep3: { revisions: steps123[2].server.revisionContents, writingLogActual: steps123[2].server.writingLogActual, writingLogExpected: steps123[2].server.writingLogExpected, writingLogMatchesExpected: steps123[2].server.writingLogMatchesExpected, tokens: steps123[2].server.writingLogTokensByProcessedSave, search: steps123[2].server.search, sidecarWordCount: steps123[2].server.sidecar.wordCount, expectedWordCounts: steps123[2].server.expectedWordCounts, mentionIndex: steps123[2].server.mentionIndex, diagnosticsIndex: steps123[2].server.diagnosticsIndex },
      afterReload: { revisions: final.st.classification.revisionContents, writingLogActual: final.cmp.actual, writingLogExpected: final.expected, writingLogMatchesExpected: final.cmp.match, search: final.search, mentionIndex: { filePresent: final.st.summary.mentionsFilePresent, recordsForResource: final.st.summary.mentionRecords }, diagnosticsIndex: { filePresent: final.st.summary.diagnosticsFilePresent, recordForResource: final.st.summary.diagnosticsRecord } },
      indexesComparedToPlainText: "not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed",
    });
    const failedA = A.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    const failedB = B.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody }));
    rec.outcome(6, { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "no failed save" : "see list" });

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

    // --- findings (raw observations, no verdict) ---------------------------
    rec.finding("a_stale_editor_replaced_other_text_on_a_keystroke", {
      step2_B: { storesHeldAfter: heldAfter(1), BsDocumentMarkers: steps123[1].sentDocument.map((d) => d.markers), A1_in_BsDocument: steps123[1].sentDocument.some((d) => d.markers.includes("A1")), A1_in_serverPlainAfterStep2: (serverPlainAfter(steps123[1]._state) ?? "").split(/\s+/).includes("A1") },
      step3_A: { storesHeldAfter: heldAfter(2), AsDocumentMarkers: steps123[2].sentDocument.map((d) => d.markers), B1_in_AsDocument: steps123[2].sentDocument.some((d) => d.markers.includes("B1")), B1_in_serverPlainAfterStep3: (serverPlainAfter(steps123[2]._state) ?? "").split(/\s+/).includes("B1") },
      varied: "nothing (in turn, 5 s gaps, short additions)",
    });
    rec.finding("b_saves_sent_with_no_typing", {
      patchesA: patchesA.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      patchesB: patchesB.map((p) => ({ n: p.n, hasDocument: p.hasDocument, markers: p.markers, msAfterLastTypingEnd: p.msAfterLastTypingEnd, afterAReloadMark: p.afterAReloadMark })),
      typingActions: { A: typings.A.map((t) => t.text), B: typings.B.map((t) => t.text) },
      patchesBeforeFirstTyping: {
        A: A.requests.filter((r) => r.method === "PATCH" && typings.A[0] && r.sendT < typings.A[0].startT).length,
        B: B.requests.filter((r) => r.method === "PATCH" && typings.B[0] && r.sendT < typings.B[0].startT).length,
      },
      idleApiRequestsNote: "see requestLogA / requestLogB in extra facts for every request",
    });
    rec.finding("c_overwritten_device_told_anything", { B_overwrittenAtStep3: notifB, A_overwrittenAtStep2: notifA, note: "full lists are in outcome 3; surfaces named there" });
    rec.finding("d_overwritten_text_recoverable", {
      afterStep2: steps123[1].server.revisionContents,
      afterStep3: steps123[2].server.revisionContents,
      afterReload: final.st.classification.revisionContents,
      revisionDirListingAfterReload: final.st.summary.revisions.map((r) => ({ dir: r.dir, name: r.name, automaticSnapshot: r.automaticSnapshot, isCanonical: r.isCanonical, contentEquals: r.contentEquals })),
    });
    rec.finding("e_overwritten_editor_shows_text_the_server_no_longer_holds", {
      afterStep2_A_editor: editorVsServer(steps123[1].editorsRightAfterSave, steps123[1]._state).A_editorEqualsServerText,
      A_editorTextAfterStep2: steps123[1].editorsRightAfterSave.A.text,
      afterStep3_B_editor: editorVsServer(steps123[2].editorsRightAfterSave, steps123[2]._state).B_editorEqualsServerText,
      B_editorTextAfterStep3: steps123[2].editorsRightAfterSave.B.text,
      at30s_noReload: editorVsServer(at30, steps123[2]._state),
      afterReload: editorVsServer(afterReload, final),
    });
    rec.finding("f_writing_log_effect", {
      actualAfterStep3: steps123[2].server.writingLogActual,
      expectedAfterStep3: steps123[2].server.writingLogExpected,
      tokensByProcessedSave: steps123[2].server.writingLogTokensByProcessedSave,
      matchesExpected: steps123[2].server.writingLogMatchesExpected,
    });
    rec.finding("g_failed_save_on_the_device_the_writer_believes_is_last", { failedSavesA: failedA, failedSavesB: failedB, result: failedA.length + failedB.length === 0 ? "none" : "see list" });

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
    rec.set("timelineSummary", { stepGapsMs: stepRecords.filter((s) => s.step >= 1).map((s) => ({ step: s.step, who: s.who, msSinceLastSaveAckWhenTypingStarted: s.msSinceLastSaveAckWhenTypingStarted })) });
    out.verdict = finalVerdict;
    out.last = final.last.determined ? final.last.docLabel : `order not determined (${final.last.reason})`;
    out.held = final.st.classification.heldLabels;
    out.finalClassification = describeClassification(final.st.classification);
    out.stepHeld = steps123.map((s) => s.server.heldLabels);
    out.stepGaps = steps123.map((s) => s.msSinceLastSaveAckWhenTypingStarted);
  } catch (e) {
    out.harnessError = errLine(e);
    rec.set("HARNESS ERROR", errLine(e));
    say(`HARNESS ERROR (repetition ${n}): ${errLine(e)}`);
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
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
  return out;
}

async function main() {
  const total = Number(process.argv[2] ?? 3);
  const results = [];
  for (let n = 1; n <= total; n += 1) {
    results.push(await runRepetition(n, total));
  }
  say("");
  say("S1 SUMMARY (host to itself, not a second-device result)");
  for (const r of results) {
    say(`  rep run=${r.runId} port=${r.port} verdict=${r.verdict?.verdict ?? "HARNESS ERROR"} last=${r.last} held=${JSON.stringify(r.held)} stepHeld=${JSON.stringify(r.stepHeld)} stepGapsMs=${JSON.stringify(r.stepGaps)}`);
    if (r.verdict) say(`      reasons: ${JSON.stringify(r.verdict.reasons)}`);
  }
  mkdirSync(path.join(RESULTS_DIR, "s1"), { recursive: true });
  const summaryFile = path.join(RESULTS_DIR, "s1", `summary-${results[0]?.runId ?? "none"}.json`);
  writeFileSync(
    summaryFile,
    `${JSON.stringify(
      results.map((r) => ({ runId: r.runId, port: r.port, pid: r.pid, verdict: r.verdict, last: r.last, held: r.held, stepHeld: r.stepHeld, stepGaps: r.stepGaps, finalClassification: r.finalClassification, jsonFile: r.jsonFile, harnessError: r.harnessError })),
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
