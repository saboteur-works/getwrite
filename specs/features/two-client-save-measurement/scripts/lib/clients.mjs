/**
 * Feature 78 harness: a paired browser context driving the REAL editor.
 *
 * Typing is real keystrokes into the TipTap editor (focus the editor, move the
 * caret to the end with ControlOrMeta+End, `keyboard.type` with a per-key
 * delay). The harness never posts a document to the API itself, so the
 * client's own 2500 ms debounce (useCanonicalAutosave.ts, read, not run), its
 * footer, and what it does with the response are part of what is measured.
 * When each client types decides the timing; nothing here sends a save.
 *
 * Request log: every request the page makes to /api/ is logged with method,
 * path (ids replaced by labels at output time), send and response times on the
 * host clock (Playwright event times, NOT wire times), status, and for 2xx the
 * response fields updatedAt / snapshotCreated / writingLog; for non-2xx the
 * body truncated to 200 characters. A request carrying a document is also
 * logged with content length, sha256 and which marker tokens it contains; the
 * document itself is kept in memory (`sentDocs`) for classification and is
 * never written out.
 *
 * Hold/release: `holdPatches()` makes the page's revision PATCH requests wait
 * in a Playwright route handler until `releaseHeld()` continues them, so the
 * gap between two clients' releases is controlled and measured. A held
 * request's `releaseT` is the time the harness continued it; use
 * `effectiveSendT` (= releaseT when held, else sendT) as its send time.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { FRONTEND, errLine, hostNow, isoOf, normalizeWs, sha256, sleep } from "./util.mjs";
import { MARKER_TOKENS, WORD40 } from "./fixture.mjs";
import { plainOfContent } from "./stores.mjs";
import { pairContext } from "./pairing.mjs";

const requireFromFrontend = createRequire(path.join(FRONTEND, "package.json"));
export const { chromium } = requireFromFrontend("@playwright/test");

const SAVED_LABEL = /^(Saved|All changes saved)/;

/** Init script: records toasts/alerts/dialogs (role-based) and visibility changes. */
function pageInit() {
  // Records flow to the Node side at once through the exposed binding, so a page
  // reload (a new window) does not lose what an earlier document showed.
  const report = (rec) => {
    try {
      window.__gwReport(rec);
    } catch {
      // binding not ready
    }
  };
  document.addEventListener("visibilitychange", () => {
    report({ kind: "vis", t: Date.now(), state: document.visibilityState });
  });
  const SEL = '[role="status"],[role="alert"],[role="dialog"],[role="alertdialog"]';
  const last = new WeakMap();
  const note = (el) => {
    const text = (el.innerText ?? el.textContent ?? "").trim().slice(0, 300);
    if (!text || last.get(el) === text) return;
    last.set(el, text);
    report({ kind: "surface", t: Date.now(), role: el.getAttribute("role"), text });
  };
  const scan = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return;
    const own = el.closest ? el.closest(SEL) : null;
    if (own) note(own);
    if (el.querySelectorAll) el.querySelectorAll(SEL).forEach(note);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") scan(m.target);
      for (const n of m.addedNodes) scan(n);
      if (m.type === "childList") scan(m.target);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
}

function analyzeDocument(content) {
  const plain = plainOfContent(content);
  if (plain === null) return { parseable: false, length: content.length, sha256: sha256(content), markers: [] };
  const tokens = plain.split(/\s+/);
  return {
    parseable: true,
    length: content.length,
    sha256: sha256(content),
    markers: MARKER_TOKENS.filter((m) => tokens.includes(m)),
    baseWordsPresent: tokens.includes("BASE"),
    listWordsPresent: WORD40.filter((w) => tokens.includes(w)).length,
  };
}

/** Create a paired client (its own context) with capture wired up. */
export async function createClient({ browser, server, label, labels }) {
  const { context, facts: pairFacts } = await pairContext(browser, server, label);
  const surfaceLog = [];
  const visLog = [];
  const marks = [];
  await context.exposeBinding("__gwReport", (_source, rec) => {
    const { kind, ...rest } = rec;
    (kind === "vis" ? visLog : surfaceLog).push(rest);
  });
  await context.addInitScript(pageInit);
  const page = await context.newPage();

  const requests = [];
  const byRequest = new Map();
  const pending = new Set();
  const consoleMsgs = [];
  const pageErrors = [];
  const dialogs = [];
  const failedRequests = [];
  const sentDocs = [];
  const held = [];
  const holdState = { enabled: false, routed: false };
  let inflight = 0;
  let seq = 0;

  page.on("dialog", async (d) => {
    dialogs.push({ t: hostNow(), type: d.type(), message: d.message().slice(0, 300) });
    await d.accept().catch(() => {});
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      consoleMsgs.push({ t: hostNow(), type: m.type(), text: m.text().split("\n")[0].slice(0, 300) });
    }
  });
  page.on("pageerror", (e) => pageErrors.push({ t: hostNow(), text: errLine(e).slice(0, 300) }));

  page.on("request", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/api/")) return;
    seq += 1;
    inflight += 1;
    const e = {
      n: seq,
      method: req.method(),
      rawPath: u.pathname + u.search,
      sendT: hostNow(),
      releaseT: null,
      respT: null,
      status: null,
      ok: null,
      doc: null,
      fields: null,
      errorBody: null,
    };
    if (req.method() === "PATCH") {
      try {
        const body = JSON.parse(req.postData() ?? "{}");
        if (typeof body.content === "string") {
          e.doc = analyzeDocument(body.content);
          sentDocs.push({ n: e.n, t: e.sendT, content: body.content, sha256: e.doc.sha256 });
        } else if (typeof body.preserve === "boolean") {
          e.note = "preserve toggle";
        } else {
          e.note = "PATCH without content";
        }
      } catch {
        e.note = "PATCH body unreadable";
      }
    }
    requests.push(e);
    byRequest.set(req, e);
  });
  page.on("response", (resp) => {
    const e = byRequest.get(resp.request());
    if (!e) return;
    e.respT = hostNow();
    e.status = resp.status();
    e.ok = resp.ok();
    const p = (async () => {
      try {
        const text = await resp.text();
        if (e.ok) {
          const json = JSON.parse(text);
          e.fields = {
            updatedAt: json.updatedAt ?? null,
            snapshotCreated: json.snapshotCreated ?? null,
            writingLog: json.writingLog ?? null,
          };
        } else {
          e.errorBody = text.slice(0, 200);
        }
      } catch {
        if (!e.ok) e.errorBody = "(unreadable)";
      }
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
  });
  const finish = (req) => {
    if (byRequest.has(req)) inflight = Math.max(0, inflight - 1);
  };
  page.on("requestfinished", finish);
  page.on("requestfailed", (req) => {
    const e = byRequest.get(req);
    if (e) {
      e.failure = req.failure()?.errorText ?? "failed";
      failedRequests.push({ n: e.n, method: e.method, error: e.failure });
    }
    finish(req);
  });

  const editor = () => page.locator('.ProseMirror[contenteditable="true"]').first();

  const client = {
    label,
    page,
    context,
    pairFacts,
    requests,
    sentDocs,
    consoleMsgs,
    pageErrors,
    dialogs,
    failedRequests,
    inflight: () => inflight,
    editor,

    /** From the start page, open the project and select the resource; wait for the editor. */
    async openResource(projectName, resourceName, { expectText } = {}) {
      const t0 = hostNow();
      await page.goto(`${server.baseUrl}/`, { waitUntil: "load" });
      const openBtn = page.getByRole("button", { name: `Open ${projectName}`, exact: true });
      await openBtn.waitFor({ timeout: 30000 });
      await openBtn.click();
      const item = page.locator(".resource-tree-button").filter({ hasText: resourceName }).first();
      await item.waitFor({ timeout: 30000 });
      await item.click();
      await editor().waitFor({ state: "visible", timeout: 30000 });
      await page.getByTestId("editview-loading").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
      if (expectText !== undefined) {
        const deadline = hostNow() + 15000;
        while (hostNow() < deadline) {
          if (normalizeWs(await client.editorText()).includes(normalizeWs(expectText))) break;
          await sleep(100);
        }
      }
      return { openedInMs: Math.round(hostNow() - t0) };
    },

    /** Reload the page (a fresh page load), then open the resource again. */
    async reloadAndOpen(projectName, resourceName, opts) {
      marks.push({ name: "page.reload", t: hostNow() });
      await page.reload({ waitUntil: "load" });
      return client.openResource(projectName, resourceName, opts);
    },

    editorText: async () => (await editor().innerText()).replace(/ /g, " "),

    /** Footer text verbatim and the autosave label (the last live-region span). */
    async footer() {
      const full = (await page.locator("#editview-footer").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const label = await page
        .locator('#editview-footer div[aria-live="polite"] span')
        .last()
        .innerText()
        .catch(() => "");
      return { full, autosave: label.trim() };
    },

    /** Caret to the end of the document with the keyboard (not a mouse position). */
    async focusEnd() {
      await editor().click();
      await page.keyboard.press("ControlOrMeta+End");
    },

    /** Real keystrokes at the end of the document, one key at a time with a delay. */
    async typeText(text, { delayMs = 40 } = {}) {
      await client.focusEnd();
      const startT = hostNow();
      await page.keyboard.type(text, { delay: delayMs });
      const endT = hostNow();
      return { text, delayMs, startT, endT, firstToLastMs: Math.round(endT - startT) };
    },

    okPatchCount: () => requests.filter((r) => r.method === "PATCH" && r.doc && r.ok === true).length,
    failedPatches: () => requests.filter((r) => r.method === "PATCH" && r.doc && r.ok === false),

    /**
     * Wait until a content save made after `afterCount` successful saves has been
     * answered 2xx and the footer reads Saved. Returns early with ok:false if a
     * save was answered non-2xx or the timeout passes.
     */
    async waitForSaved({ afterCount, timeoutMs = 20000 }) {
      const t0 = hostNow();
      const failedBefore = client.failedPatches().length;
      for (;;) {
        if (client.failedPatches().length > failedBefore) {
          return { ok: false, reason: "a save was answered non-2xx", footer: await client.footer(), waitedMs: Math.round(hostNow() - t0) };
        }
        if (client.okPatchCount() > afterCount) {
          const f = await client.footer();
          if (SAVED_LABEL.test(f.autosave)) return { ok: true, footer: f, savedSeenAt: hostNow(), waitedMs: Math.round(hostNow() - t0) };
        }
        if (hostNow() - t0 > timeoutMs) {
          return { ok: false, reason: "timeout", footer: await client.footer(), waitedMs: Math.round(hostNow() - t0) };
        }
        await sleep(100);
      }
    },

    /** Everything toast/alert/dialog-like the page showed at or after `sinceMs`. */
    async surfaces(sinceMs = 0) {
      return surfaceLog.filter((s) => s.t >= sinceMs);
    },
    async visibilityEvents() {
      return [...visLog];
    },
    /** Moments the harness itself navigated (a reload aborts in-flight fetches; console errors and ERR_ABORTED failures near one are reload effects). */
    marks: () => [...marks],

    // ---- hold / release -------------------------------------------------

    /** From now on, revision PATCH requests of this page wait until released. */
    async holdPatches() {
      holdState.enabled = true;
      if (holdState.routed) return;
      holdState.routed = true;
      await page.route("**/api/resource/revision/**", async (route) => {
        const req = route.request();
        if (holdState.enabled && req.method() === "PATCH") {
          held.push({ route, req, heldT: hostNow() });
        } else {
          await route.continue().catch(() => {});
        }
      });
    },
    heldCount: () => held.length,
    async waitHeld(n, timeoutMs = 20000) {
      const t0 = hostNow();
      while (held.length < n) {
        if (hostNow() - t0 > timeoutMs) return false;
        await sleep(20);
      }
      return true;
    },
    /** Continue every held request; records releaseT on its log entry. Hold stays on. */
    async releaseHeld() {
      const batch = held.splice(0, held.length);
      const out = [];
      for (const h of batch) {
        const e = byRequest.get(h.req);
        const t = hostNow();
        if (e) e.releaseT = t;
        await h.route.continue().catch(() => {});
        out.push({ n: e?.n ?? null, heldT: h.heldT, releaseT: t });
      }
      return out;
    },
    async stopHolding() {
      holdState.enabled = false;
      return client.releaseHeld();
    },

    /** The request log with ids replaced by labels. Documents are not included. */
    log() {
      return requests.map((e) => {
        const effectiveSendT = e.releaseT ?? e.sendT;
        return {
          n: e.n,
          method: e.method,
          path: labels.apply(e.rawPath),
          sendT: round3(e.sendT),
          sendAt: isoOf(e.sendT),
          releaseT: e.releaseT === null ? null : round3(e.releaseT),
          effectiveSendT: round3(effectiveSendT),
          respT: e.respT === null ? null : round3(e.respT),
          respAt: e.respT === null ? null : isoOf(e.respT),
          durMs: e.respT === null ? null : Math.round(e.respT - effectiveSendT),
          status: e.status,
          fields: e.ok ? e.fields : undefined,
          errorBody: e.ok === false ? e.errorBody : undefined,
          failure: e.failure,
          doc: e.doc ?? undefined,
          note: e.note,
        };
      });
    },

    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },

    async close() {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    },
  };
  return client;
}

const round3 = (t) => Math.round(t * 1000) / 1000;

/** Build the saves list the verdict needs from a client's 2xx content saves (by request number). */
export function savesFrom(client, docLabelByN, filter = () => true) {
  return client.requests
    .filter((r) => r.method === "PATCH" && r.doc && r.ok === true && r.fields?.updatedAt && filter(r))
    .map((r) => ({
      id: `${client.label}${r.n}`,
      client: client.label,
      n: r.n,
      docLabel: docLabelByN(r.n),
      sendT: r.releaseT ?? r.sendT,
      respT: r.respT,
      updatedAt: r.fields.updatedAt,
    }));
}

/** label -> document string for a client's sent documents: `${client}#${k}` in send order. */
export function labelDocs(client) {
  const docs = {};
  const byN = {};
  client.sentDocs.forEach((d, i) => {
    const label = `${client.label}#${i + 1}`;
    docs[label] = d.content;
    byN[d.n] = label;
  });
  return { docs, byN };
}
