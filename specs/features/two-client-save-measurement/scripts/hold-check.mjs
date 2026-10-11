#!/usr/bin/env node
/**
 * Feature 78, Task 2: check that the hold/release hook works.
 *
 * Two clients, TWO DIFFERENT resources of one project (so this is not a
 * two-clients-one-resource scenario and measures nothing about the product's
 * save behaviour): each types a marker with real keystrokes, each page's PATCH
 * is held in a Playwright route handler, nothing is answered while held, the
 * two are released a requested gap apart, and the achieved gap between the
 * releases (host clock, Playwright event times) is printed. Host to itself,
 * not a second-device result. Run OUTSIDE the command sandbox.
 *
 * Usage: node hold-check.mjs [gapMs=250]
 */
import { BASE_TEXT, MARKERS, createFixtureProject, createFixtureResource } from "./lib/fixture.mjs";
import { labelDocs } from "./lib/clients.mjs";
import { openSession, settleAndRead } from "./lib/session.mjs";
import { describeClassification } from "./lib/stores.mjs";
import { errLine, hostNow, sleep } from "./lib/util.mjs";

const say = (s) => console.log(s);
const askedGap = Number(process.argv[2] ?? 250);

async function main() {
  const session = await openSession({ label: "holdcheck" });
  const { A, B } = session.clients;
  say("HOLD/RELEASE HOOK CHECK: measures nothing about the product; two different resources; host to itself, not a second-device result");
  say(`server port ${session.server.port} pid ${session.server.pid}; 7340 listeners before: ${session.pre.listeners7340.length ? session.pre.listeners7340 : "none"}; 3000: ${session.pre.listeners3000.length ? session.pre.listeners3000 : "none"}`);
  let teardown;
  try {
    const project = await createFixtureProject(session.server, `Hold ${session.run.runId}`, session.labels);
    const r1 = await createFixtureResource(session.server, project, `One ${session.run.runId}`, session.labels, "R1");
    const r2 = await createFixtureResource(session.server, project, `Two ${session.run.runId}`, session.labels, "R2");
    await A.openResource(project.name, r1.name, { expectText: BASE_TEXT });
    await B.openResource(project.name, r2.name, { expectText: BASE_TEXT });
    await A.holdPatches();
    await B.holdPatches();
    const typedAt = await Promise.all([A.typeText(MARKERS.A1), B.typeText(MARKERS.B1)]);
    say(`typed concurrently; first-to-last key: A ${typedAt[0].firstToLastMs} ms, B ${typedAt[1].firstToLastMs} ms; last key times differ by ${Math.round(Math.abs(typedAt[0].endT - typedAt[1].endT))} ms`);
    const heldA = await A.waitHeld(1);
    const heldB = await B.waitHeld(1);
    say(`both PATCHes held: A ${heldA}, B ${heldB}`);
    await sleep(1500);
    const answeredWhileHeld = [A, B].map((c) => c.requests.filter((r) => r.method === "PATCH" && r.doc && r.respT !== null).length);
    say(`PATCH answered while held (A,B): ${answeredWhileHeld.join(",")} (expected 0,0); footers: A "${(await A.footer()).autosave}", B "${(await B.footer()).autosave}"`);
    const relA = await A.releaseHeld();
    await sleep(askedGap);
    const relB = await B.releaseHeld();
    const achieved = relB[0].releaseT - relA[0].releaseT;
    say(`asked release gap ${askedGap} ms (A then B; includes the setTimeout and the first release's own await); achieved gap between releaseT values ${achieved.toFixed(1)} ms`);
    const sa = await A.waitForSaved({ afterCount: 0 });
    const sb = await B.waitForSaved({ afterCount: 0 });
    say(`after release: A saved ${sa.ok} (${sa.footer.autosave}), B saved ${sb.ok} (${sb.footer.autosave})`);
    for (const c of [A, B]) {
      for (const e of c.log().filter((r) => r.method === "PATCH")) {
        say(`  client ${c.label} PATCH ${e.path} sendT(event)=${e.sendAt} releaseT=${e.releaseT} respAt=${e.respAt} durMs(from release)=${e.durMs} status=${e.status} doc.markers=${JSON.stringify(e.doc?.markers)} doc.length=${e.doc?.length}`);
      }
    }
    for (const [res, c] of [[r1, A], [r2, B]]) {
      const { docs } = labelDocs(c);
      const state = await settleAndRead({ session, resource: res, docs: { base: res.baseContent, ...docs } });
      say(`  ${res.label}: ${describeClassification(state.classification).join(" ; ")}`);
    }
    await A.stopHolding();
    await B.stopHolding();
  } catch (e) {
    say(`HARNESS ERROR: ${errLine(e)}`);
    process.exitCode = 1;
  } finally {
    teardown = await session.close();
    say(`teardown: ${JSON.stringify(teardown)}`);
    say(`at ${new Date(hostNow()).toISOString()}`);
  }
}

main().catch((e) => {
  console.error(`script error: ${errLine(e)}`);
  process.exit(1);
});
