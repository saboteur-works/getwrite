/**
 * Feature 78 harness: one session = one server + one Chromium + paired clients,
 * with a teardown that stops only what was started, by recorded pid.
 *
 * Process safety (header rules of tasks.md): 7340 and 3000 listener status is
 * recorded before and after and never acted on; the server is stopped by its
 * recorded pids; the Chromium processes Playwright started are recorded (pids
 * of descendants of this process that are not the server) and confirmed gone;
 * the throwaway folder under /tmp/getwrite-two-client/<run-id>/ is removed and
 * the removal confirmed.
 */
import { errLine, sleep } from "./util.mjs";
import {
  cleanupRun,
  createRun,
  descendantsOf,
  listeners,
  pidAlive,
  startServer,
  stopServer,
} from "./server.mjs";
import { chromium, createClient } from "./clients.mjs";
import { createLabels } from "./fixture.mjs";
import {
  classifySnapshot,
  readSnapshot,
  searchTokens,
  snapshotDigest,
  summarizeSnapshot,
  waitQuiet,
} from "./stores.mjs";

export async function openSession({ label, clientLabels = ["A", "B"] }) {
  const run = createRun(label);
  const labels = createLabels();
  const pre = { listeners7340: listeners(7340), listeners3000: listeners(3000) };
  const session = { run, labels, pre, clients: {}, server: null, browser: null, browserPids: [] };

  session.get = async (urlPath) => {
    const res = await session.server.windowFetch(urlPath);
    let json;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  };

  session.close = async () => {
    const facts = { errors: [] };
    for (const c of Object.values(session.clients)) {
      try {
        await c.close();
      } catch (e) {
        facts.errors.push(errLine(e));
      }
    }
    try {
      await session.browser?.close();
    } catch (e) {
      facts.errors.push(`browser.close: ${errLine(e)}`);
    }
    await sleep(500);
    facts.browserPidsRecorded = session.browserPids.length;
    facts.browserPidsAliveAfterClose = session.browserPids.filter((p) => pidAlive(p.pid)).map((p) => p.pid);
    const stillOurs = new Set(descendantsOf(process.pid).map((p) => p.pid));
    for (const pid of facts.browserPidsAliveAfterClose) {
      // only pids this session recorded AND that are still descendants of this process
      if (!stillOurs.has(pid)) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // gone
      }
    }
    if (facts.browserPidsAliveAfterClose.length) await sleep(1500);
    facts.browserPidsAliveAfterTerm = session.browserPids.filter((p) => pidAlive(p.pid)).map((p) => p.pid);
    if (session.server) facts.server = await stopServer(session.server);
    facts.listeners7340After = listeners(7340);
    facts.listeners3000After = listeners(3000);
    facts.cleanup = cleanupRun(run);
    return facts;
  };

  try {
    session.server = await startServer(run);
    session.browser = await chromium.launch();
    for (const l of clientLabels) {
      session.clients[l] = await createClient({
        browser: session.browser,
        server: session.server,
        label: l,
        labels,
      });
    }
    const serverPids = new Set(session.server.known.keys());
    session.browserPids = descendantsOf(process.pid).filter(
      (p) => p.pid !== process.pid && !serverPids.has(p.pid),
    );
  } catch (e) {
    await session.close().catch(() => {});
    throw e;
  }
  return session;
}

/**
 * Wait for quiet, then read and classify every store. `docs` maps label ->
 * saved document string. Returns { quiet, snapshot (with raw text, memory
 * only), summary (safe to write), classification }.
 */
export async function settleAndRead({ session, resource, docs }) {
  const clients = Object.values(session.clients);
  const quiet = await waitQuiet({
    inflight: () => clients.reduce((n, c) => n + c.inflight(), 0),
    digest: () => snapshotDigest(resource.projectPath, resource.id),
  });
  for (const c of clients) await c.idle();
  const snapshot = readSnapshot(resource.projectPath, resource.id);
  return {
    quiet,
    snapshot,
    summary: summarizeSnapshot(snapshot, docs),
    classification: classifySnapshot(snapshot, docs),
  };
}

export const searchFor = (session, resource, tokens) =>
  searchTokens(session.get, resource.projectManifestId, tokens);
