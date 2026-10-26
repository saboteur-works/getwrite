// Shape check for longpress-probe.js (Task 57). NOT a device result: scripted
// events in desktop Chromium. Run: node longpress-probe.check.mjs [--print]
// Needs Playwright Chromium (resolved from frontend/node_modules).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../../frontend/package.json"));
const { chromium } = require("playwright");
const probe = readFileSync(join(here, "longpress-probe.js"), "utf8");
const print = process.argv.includes("--print");

const html = `<!doctype html><body><div class="ProseMirror" contenteditable="true" style="font:20px sans-serif;padding:20px">
<p>recieve teh <span class="spell-error" id="w">wrold</span> and fine words</p></div></body>`;

async function run(page, withEditorStub) {
  await page.setContent(html);
  if (withEditorStub) {
    await page.evaluate(() => {
      const w = document.getElementById("w");
      const doc = { content: { size: 40 }, textBetween: () => "teh wrold and" };
      document.querySelector(".ProseMirror").editor = {
        state: { doc, selection: { constructor: { name: "TextSelection" }, from: 1, to: 6, anchor: 1, head: 6 } },
        view: {
          state: { doc },
          posAtCoords: () => ({ pos: 3, inside: 3 }),
          domAtPos: () => ({ node: w.firstChild, offset: 3 }),
        },
      };
    });
  }
  const domBefore = await page.evaluate(() => document.body.innerHTML);
  await page.evaluate(probe);
  const box = await page.locator("#w").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(900);
  await page.evaluate(([x, y]) => {
    const t = document.getElementById("w");
    t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
    window.getSelection().selectAllChildren(t);
  }, [x, y]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(450);
  const out = await page.evaluate(() => ({ text: window.__longpressProbe.dump(), prevented: window.__prevented }));
  const domAfter = await page.evaluate(() => document.body.innerHTML);
  assert.equal(domAfter, domBefore, "probe changed the DOM");
  await page.evaluate(() => window.__longpressProbe.stop());
  const n = await page.evaluate(() => window.__longpressProbe.log.length);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__longpressProbe.log.length), n, "stop() did not detach listeners");
  return JSON.parse(out.text);
}

const browser = await chromium.launch();
const page = await browser.newPage({ hasTouch: true, viewport: { width: 600, height: 300 } });
for (const stub of [false, true]) {
  const d = await run(page, stub);
  const types = d.log.map((e) => e.type);
  for (const t of ["touchstart", "touchend", "contextmenu", "contextmenu-bubble", "selectionchange", "after-contextmenu"])
    assert.ok(types.includes(t), `${stub ? "stub" : "fallback"}: missing ${t} in ${types}`);
  for (const e of d.log) {
    assert.equal(typeof e.perfNow, "number");
    assert.equal(typeof e.dateNow, "number");
  }
  const cm = d.log.find((e) => e.type === "contextmenu");
  for (const k of ["isTrusted", "clientX", "clientY", "button", "sourceCapabilities", "defaultPrevented"])
    assert.ok(k in cm, `contextmenu lacks ${k}`);
  const snaps = d.log.filter((e) => e.type === "after-contextmenu");
  // Two snapshots per contextmenu; Chromium may also deliver its own trusted
  // contextmenu for the held touch, so count against contextmenu entries.
  const cmCount = d.log.filter((e) => e.type === "contextmenu").length;
  assert.equal(snaps.length, 2 * cmCount);
  console.log("contextmenu isTrusted:", d.log.filter((e) => e.type === "contextmenu").map((e) => e.isTrusted));
  assert.equal(snaps[0].selection.text, "wrold");
  assert.equal(snaps[0].hitAtEventCoords.insideSpellError, true);
  assert.equal(snaps[0].hitAtEventCoords.method, stub ? "view.posAtCoords" : "elementFromPoint");
  assert.equal(snaps[0].selection.view, stub ? "reachable" : "unreachable");
  console.log(`${stub ? "stub view" : "no view (fallback)"}: ok, event order ${types.join(" > ")}`);
  if (print) console.log(JSON.stringify(d.log.filter((e) => ["touchstart", "contextmenu", "after-contextmenu"].includes(e.type)).slice(0, 4), null, 1));
}
await browser.close();
console.log("longpress-probe shape check passed (not a device result)");
