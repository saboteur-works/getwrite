#!/usr/bin/env node
/**
 * Feature 78, Task 2: DRY RUN of the harness. One fresh resource, one typed
 * marker (" A1") on one client, one save end to end, then the stores read and
 * classified and the verdict function applied.
 *
 * THIS MEASURES NOTHING ABOUT THE PRODUCT and must not be presented as a
 * finding. It only shows the harness can drive a real editor, see the save,
 * read the stores and print a record. Every request is host to itself, not a
 * second-device result.
 *
 * Needs the built standalone server (see experiments.md "Baselines"). Run
 * OUTSIDE the command sandbox (server and Chromium).
 *
 * Usage: node dry-run.mjs
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource } from "./lib/fixture.mjs";
import { labelDocs, savesFrom } from "./lib/clients.mjs";
import { createRecord } from "./lib/record.mjs";
import { openSession, searchFor, settleAndRead } from "./lib/session.mjs";
import {
  compareLog,
  describeClassification,
  determineLastProcessed,
  expectedLogEntries,
  logEntriesSince,
  verdict,
} from "./lib/stores.mjs";
import { errLine, hostNow, sleep } from "./lib/util.mjs";

const say = (s) => console.log(s);

async function main() {
  const session = await openSession({ label: "dry" });
  const { server, clients, labels } = session;
  const { A, B } = clients;
  const rec = createRecord({
    scenario: "dry-run",
    runId: session.run.runId,
    server,
    note: "DRY RUN of the harness. Measures nothing about the product; not a finding.",
  });
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

  let teardown;
  try {
    const project = await createFixtureProject(server, `Dry ${session.run.runId}`, labels);
    const resource = await createFixtureResource(server, project, `Doc ${session.run.runId}`, labels, "R1");
    rec.step("fixture created through POST /api/projects and POST /api/resource", {
      resourceLabel: "R1",
      baseContentChars: resource.baseContent.length,
    });
    const sinceMs = hostNow();

    const initial = await settleAndRead({ session, resource, docs: { base: resource.baseContent } });
    rec.step("initial stores read (before any client opened the resource)", {
      classification: describeClassification(initial.classification),
      revisions: initial.summary.revisions,
    });
    const searchBefore = await searchFor(session, resource, ["A1", "BASE"]);

    const openA = await A.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    const openB = await B.openResource(project.name, resource.name, { expectText: BASE_TEXT });
    rec.step("both clients opened the resource in the real editor", { openA, openB, aText: await A.editorText(), bText: await B.editorText() });
    rec.step("footers after open", { A: await A.footer(), B: await B.footer() });
    const requestsAfterOpen = { A: A.requests.length, B: B.requests.length };
    rec.step("requests each page made while opening (no typing yet)", requestsAfterOpen);

    const before = A.okPatchCount();
    const typed = await A.typeText(MARKERS.A1);
    rec.step("A typed ' A1' with real keystrokes", {
      delayMs: typed.delayMs,
      firstToLastMs: typed.firstToLastMs,
      editorAfterTyping: await A.editorText(),
      footerRightAfterTyping: await A.footer(),
    });
    const editorTextAfterTyping = await A.editorText();
    const caretAtEnd = editorTextAfterTyping.trim().endsWith("A1") && editorTextAfterTyping.includes(BASE_TEXT);
    const saved = await A.waitForSaved({ afterCount: before, timeoutMs: 20000 });
    rec.step("A's save answered and footer read Saved", { caretAtEnd, ...saved });

    const bRightAfter = { text: await B.editorText(), footer: await B.footer() };
    rec.step("B's editor right after A's save was acknowledged (no reload) (a)", bRightAfter);
    await sleep(30000);
    rec.step("B's editor after 30 s (no reload) (b)", { text: await B.editorText(), footer: await B.footer() });

    const { docs: docsA, byN: byNA } = labelDocs(A);
    const docs = { base: resource.baseContent, ...docsA };
    const state = await settleAndRead({ session, resource, docs });
    rec.step("quiet wait finished, stores read", state.quiet);

    const reloadA = await A.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const reloadB = await B.reloadAndOpen(project.name, resource.name, { expectText: BASE_TEXT });
    const reloadTexts = { A: await A.editorText(), B: await B.editorText() };
    rec.step("both reloaded (page reload, then reopen) (c)", { reloadA, reloadB, footerA: await A.footer(), footerB: await B.footer() });

    const saves = savesFrom(A, (n) => byNA[n]);
    const last = determineLastProcessed(saves);
    const v = verdict({ classification: state.classification, last, docs, reloadTexts, requireReload: true });
    const searchAfter = await searchFor(session, resource, ["A1", "BASE"]);
    const logSince = logEntriesSince(state.snapshot, sinceMs);
    const expectedLog = expectedLogEntries(resource.baseContent, [docsA["A#1"]]);

    rec.outcome(1, {
      classification: describeClassification(state.classification),
      revisionDirsAndMetadata: state.summary.revisions,
      otherRevisionDirEntries: state.summary.otherRevisionEntries,
      sidecar: state.summary.sidecar,
      contentTiptapJson: state.summary.contentTiptapJson,
      contentTxt: state.summary.contentTxt,
      allFourAgree: state.classification.storesAgree,
      quietWait: state.quiet,
      onDiskNames: "revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json",
    });
    rec.outcome(2, {
      A_afterReload: reloadTexts.A,
      B_rightAfterOtherSave: bRightAfter,
      B_afterReload: reloadTexts.B,
    });
    rec.outcome(3, {
      surfacesChecked: "role=status/alert/dialog elements added or changed (MutationObserver), JS dialogs, console errors/warnings, page errors, failed requests",
      A: { surfaces: await A.surfaces(sinceMs), console: A.consoleMsgs, pageErrors: A.pageErrors, dialogs: A.dialogs, failedRequests: A.failedRequests },
      B: { surfaces: await B.surfaces(sinceMs), console: B.consoleMsgs, pageErrors: B.pageErrors, dialogs: B.dialogs, failedRequests: B.failedRequests },
    });
    rec.outcome(4, { note: "not applicable to the dry run: no stale editor saved" });
    rec.outcome(5, {
      revisions: state.classification.revisionContents,
      writingLogEntriesSinceStart: logSince,
      expectedWritingLog: expectedLog,
      writingLogMatchesExpected: compareLog(logSince, expectedLog).match,
      searchBefore,
      searchAfter,
      sidecarWordCount: state.classification.sidecar.wordCount,
      expectedWordCounts: state.classification.expectedWordCounts,
      mentionIndex: { filePresent: state.summary.mentionsFilePresent, recordsForResource: state.summary.mentionRecords },
      diagnosticsIndex: { filePresent: state.summary.diagnosticsFilePresent, recordForResource: state.summary.diagnosticsRecord },
      indexesComparedToPlainText: "not compared by the harness (the diagnostics heuristics are TypeScript and are not ported); raw records are printed",
    });
    rec.outcome(6, {
      failedSavesA: A.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody })),
      failedSavesB: B.failedPatches().map((r) => ({ n: r.n, status: r.status, body: r.errorBody })),
      result: A.failedPatches().length + B.failedPatches().length === 0 ? "no failed save" : "see list",
    });
    rec.verdictInputs({
      saves: saves.map((s) => ({ id: s.id, docLabel: s.docLabel, updatedAt: s.updatedAt, sendT: s.sendT, respT: s.respT })),
      lastProcessed: last.determined ? { docLabel: last.docLabel, updatedAt: last.updatedAt } : { determined: false, reason: last.reason },
      evidence: last.evidence,
      documentHashes: Object.fromEntries(
        [...A.sentDocs].map((d, i) => [`A#${i + 1}`, d.sha256]),
      ),
      requireReload: true,
      reloadTexts,
    });
    rec.verdict(v);
    rec.set("requestLogA", A.log());
    rec.set("requestLogB", B.log());
    rec.set("typedMarkerCaretAtEnd", caretAtEnd);
    rec.set("labelsRegistered", labels.entries());
    rec.set("pageReloadMarks", { A: A.marks(), B: B.marks() });
    rec.set("visibilityEvents", { A: await A.visibilityEvents(), B: await B.visibilityEvents() });
  } catch (e) {
    rec.set("HARNESS ERROR", errLine(e));
    say(`HARNESS ERROR: ${errLine(e)}`);
    process.exitCode = 1;
  } finally {
    teardown = await session.close();
    rec.set("teardown", teardown);
    rec.print(say);
    try {
      say(`JSON written: ${rec.writeJson()}`);
    } catch (e) {
      say(`JSON NOT written: ${errLine(e)}`);
    }
    say(`DRY RUN: measures nothing about the product; host to itself, not a second-device result.`);
  }
}

main().catch((e) => {
  console.error(`script error: ${errLine(e)}`);
  process.exit(1);
});
