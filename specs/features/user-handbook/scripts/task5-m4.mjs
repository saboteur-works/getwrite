// Task 5, web build: story/metadata.md rows M-48..M-57 (Prose diagnostics). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, createNode, treeClick, sidebarText, sidecarByName, projectDir, walk, pm, waitSaved, createProject } from "./task5-lib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
const diagLines = async (page) => (await sidebarText(page)).split("\n").filter((l) => /^(Dialogue ratio|Average sentence length|Top repeated words)/.test(l));
async function setText(page, text) {
  let w = 0; for (; w < 40; w++) { if (!((await page.evaluate(() => document.querySelector(".ProseMirror")?.innerText || "")).trim())) break; await page.waitForTimeout(250); }
  if (w >= 40) say("NOTE setText: the editor was still not empty after 10 s; typing anyway");
  await pm(page).click();
  await page.keyboard.press("Meta+A"); await page.keyboard.press("Delete");
  await page.keyboard.insertText(text);
  await tick(page, 6500);
}
const diskRec = (h, name) => { try { const pd = projectDir(h); const all = JSON.parse(readFileSync(path.join(pd, "meta/index/diagnostics.json"), "utf8")); const id = sidecarByName(h, name).json.id; const r = all[id] ?? all.records?.[id]; return r ? { dialogueRatio: r.dialogueRatio, averageSentenceLength: r.averageSentenceLength, top: (r.topRepeatedWords || []).map((x) => `${x.word}(${x.count})`) } : null; } catch (e) { return String(e.message).slice(0, 60); } };
let H;
async function diagAfterReselect(page, name, other = "Doc") {
  const before = await diagLines(page);
  // wait (up to 20 s) for the on-disk record of this resource to exist
  let waited = 0; for (let i = 0; i < 30; i++) { const r = diskRec(H, name); if (r && typeof r === "object" && r.averageSentenceLength !== 0) break; await page.waitForTimeout(1000); waited++; }
  await tick(page, 1500);
  await treeClick(page, other); await treeClick(page, name); await tick(page, 2500);
  return { shownRightAfterTyping: before, secondsUntilTheOnDiskRecordWasNonZero: waited, onDiskRecord: diskRec(H, name), afterReselectingTheResource: await diagLines(page) };
}
const edText = (page) => page.evaluate(() => document.querySelector(".ProseMirror").innerText);
await withWeb("t5-m4", {}, async ({ h, page }) => {
  H = h;
  const hosts = new Set();
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch {} });
  await newProjectWithDoc(page, h, "Prose Test", "Doc");
  for (const n of ["Plain", "Quoted", "Mixed", "Sent", "Rep", "Mr"]) await createNode(page, n, "text");

  await step("M-48 section", async () => {
    await treeClick(page, "Plain");
    say(`M-48 section for an empty text document: ${J(await diagLines(page))}; sidebar section order: ${J((await sidebarText(page)).split("\n").filter((l) => /^(PROSE DIAGNOSTICS|SUBTYPE|DOCUMENT|TAGS|WORD COUNT GOAL)$/.test(l)))}`);
    say(`M-48 inputs/buttons inside the Prose diagnostics section: ${J(await page.evaluate(() => { const hd = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /^PROSE DIAGNOSTICS$/i.test((e.textContent || "").trim())); let n = hd; for (let i = 0; i < 4 && n && !n.querySelector("button:not([aria-expanded])"); i++) n = n.parentElement; const sec = hd.closest("section") || n; return { inputs: [...sec.querySelectorAll("input,select,textarea")].length, buttons: [...sec.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.innerText.trim()) }; }))}`);
  });

  await step("M-49 dialogue ratio", async () => {
    await treeClick(page, "Plain");
    const t0 = "The river ran past the old mill and the road was long.";
    await setText(page, t0);
    say(`M-49 no quotes: editor text=${J(await edText(page))} -> ${J(await diagAfterReselect(page, "Plain"))}`);
    await treeClick(page, "Quoted");
    const t1 = "“Where are you going this late at night?”";
    await setText(page, t1);
    say(`M-49 whole text inside curly quotes: editor text=${J(await edText(page))} -> ${J(await diagAfterReselect(page, "Quoted"))}`);
    await treeClick(page, "Mixed");
    const t2 = "She waited. “I am going home now,” he said. The door closed.";
    await setText(page, t2);
    const et = (await edText(page)).trim(); const dm = await diagAfterReselect(page, "Mixed");
    const inq = (et.match(/“[^”]*”/g) || []).join("").length;
    say(`M-49 mixed: editor text=${J(et)} (${et.length} characters, ${inq} inside the quote marks incl. the marks => ${(100 * inq / et.length).toFixed(1)}%) -> ${J(dm)}`);
    // straight quotes
    await createNode(page, "Straight", "text"); await treeClick(page, "Straight");
    await setText(page, 'He said "go home now" and left.');
    say(`M-49 straight quotes: editor text=${J((await edText(page)).trim())} -> ${J(await diagAfterReselect(page, "Straight"))}`);
  });

  await step("M-50 sentence length", async () => {
    await treeClick(page, "Sent");
    await setText(page, "One two three. Four five six seven eight. Nine ten!");
    say(`M-50 sentences of 3, 5 and 2 words (expected mean 3.3): editor=${J((await edText(page)).trim())} -> ${J(await diagAfterReselect(page, "Sent"))}`);
    await treeClick(page, "Mr");
    await setText(page, "Mr. Smith went home today.");
    say(`M-55 "Mr. Smith went home today." (5 words, one sentence by eye): ${J(await diagAfterReselect(page, "Mr"))}`);
    await createNode(page, "Mr2", "text"); await treeClick(page, "Mr2");
    await setText(page, "Dr. Jones and Mrs. Lee met Prof. Gray.");
    say(`M-55 "Dr. Jones and Mrs. Lee met Prof. Gray." (8 words, one sentence by eye): ${J(await diagAfterReselect(page, "Mr2"))}`);
    await createNode(page, "Mr3", "text"); await treeClick(page, "Mr3");
    await setText(page, "Smith went home today.");
    say(`M-55 control "Smith went home today." (4 words): ${J(await diagAfterReselect(page, "Mr3"))}`);
  });

  await step("diagnostics API vs disk vs sidebar", async () => {
    const urls = []; const onR = (r) => { if (/\/diagnostics(\?|$)/.test(r.url())) urls.push(r.url()); };
    page.on("request", onR);
    await treeClick(page, "Doc"); await treeClick(page, "Sent"); await tick(page, 2500);
    page.off("request", onR);
    const tmpl = urls[urls.length - 1];
    say(`diag request URL shape for Sent: ${J(tmpl ? tmpl.replace(/^http:\/\/127\.0\.0\.1:\d+/, "").replace(/[0-9a-f-]{36}/g, "<id>") : null)}`);
    for (const n of ["Plain", "Straight", "Sent", "Mr2"]) {
      const id = sidecarByName(h, n).json.id;
      const api = tmpl ? await page.evaluate(async ([u, a, b]) => { const r = await fetch(u.replace(a, b)); return { status: r.status, body: await r.json().catch(() => null) }; }, [tmpl, tmpl.match(/[0-9a-f-]{36}/)[0], id]) : null;
      say(`diagnostics API for ${n}: ${J(api)}; on disk: ${J(diskRec(h, n))}`);
    }
    say(`Sent: editor text now: ${J((await edText(page)).trim())}; sidecar wordCount=${sidecarByName(h, "Sent").json.wordCount}`);
  });
  await step("M-51 repeated words + M-52/53 detail", async () => {
    await treeClick(page, "Rep");
    const reqs = []; const onReq = (r) => { try { const u = new URL(r.url()); reqs.push(u.host.replace(/:\d+$/, ":PORT") + u.pathname); } catch {} };
    page.on("request", onReq);
    const text = "river river river river stone stone stone the the the the the and and and and and and wind wind";
    await setText(page, text);
    say(`M-51 text=${J(text)} -> ${J(await diagAfterReselect(page, "Rep"))}`);
    const lines = (await sidebarText(page)).split("\n");
    say(`M-51 raw lines after "Top repeated words": ${J(lines.slice(lines.findIndex((l) => /^Top repeated/.test(l)), lines.findIndex((l) => /^Top repeated/.test(l)) + 4))}`);
    await page.click("button:text-is('Show detail')"); await tick(page, 2000);
    const d1 = await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; });
    say(`M-52 Show detail dialog text: ${J(d1)}`);
    const expectedOffsets = (w) => [...text.matchAll(new RegExp(`\\b${w}\\b`, "g"))].map((m) => m.index);
    say(`M-52 offsets of "river" and "stone" in the text (computed by the script, 0-based): river=${J(expectedOffsets("river"))} stone=${J(expectedOffsets("stone"))}`);
    const closeBtn = page.locator("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')").first();
    if (await closeBtn.count()) await closeBtn.click(); else await page.keyboard.press("Escape");
    await tick(page, 800);
    const pd = projectDir(h);
    const diag = readFileSync(path.join(pd, "meta/index/diagnostics.json"), "utf8");
    const idRep = sidecarByName(h, "Rep").json.id;
    say(`M-53 meta/index/diagnostics.json for Rep: ${J(JSON.parse(diag)[idRep] ?? JSON.parse(diag).records?.[idRep] ?? diag.slice(0, 600))}`);
    say(`M-53 files under the project containing the digits of a detail offset for river (e.g. "\\"offsets\\"" or "positions"): ${J(walk(pd).filter((p) => { try { return /offsets|positions|locations/i.test(readFileSync(p, "utf8")) && !/mentions|\\.next/.test(p); } catch { return false; } }).map((p) => p.replace(pd, "")))}; all files: ${J(walk(pd).map((p) => p.replace(pd, "")).filter((p) => !/resource-|revisions|resources\//.test(p)))}`);
    // edit text then reopen detail
    await pm(page).click(); await page.keyboard.press("Meta+End"); await page.keyboard.insertText(" river river"); await tick(page, 6500);
    say(`M-53 after adding two more "river": ${J(await diagLines(page))}`);
    await page.click("button:text-is('Show detail')"); await tick(page, 2000);
    say(`M-53 detail dialog again: ${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; }))}`);
    await page.keyboard.press("Escape"); await tick(page, 600);
    page.off("request", onReq);
    say(`M-48 requests the page made while typing, saving, reading the diagnostics and opening Show detail twice (host:PORT+path, distinct): ${J([...new Set(reqs)])}`);
  });

  await step("M-54 red", async () => {
    await page.click("button:text-is('Show detail')"); await tick(page, 1500);
    const reds = await page.evaluate(() => {
      const isRed = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; return r > 150 && g < 110 && b < 110; };
      const hd = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /^PROSE DIAGNOSTICS$/i.test((e.textContent || "").trim()));
      const sec = hd.closest("section") || hd.parentElement.parentElement;
      const d = document.querySelector("[role=dialog], dialog");
      const test = (root) => [...root.querySelectorAll("*")].concat([root]).filter((e) => { const cs = getComputedStyle(e); return isRed(cs.color) || isRed(cs.backgroundColor) || isRed(cs.borderTopColor) || isRed(cs.borderLeftColor); }).length;
      return { sectionElements: sec.querySelectorAll("*").length, sectionRed: test(sec), dialogElements: d ? d.querySelectorAll("*").length : 0, dialogRed: d ? test(d) : null };
    });
    say(`M-54 elements in the Prose diagnostics section and in the detail dialog with a red-ish colour (r>150, g<110, b<110) in text, background or border: ${J(reds)}`);
    await page.keyboard.press("Escape"); await tick(page, 600);
  });

  await step("M-48 image/audio", async () => {
    const { execFileSync } = await import("node:child_process");
    const png = path.join(h.run.dir, "p.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
    await createNode(page, "Pic", "image", "Workspace", png);
    await treeClick(page, "Pic");
    say(`M-48 image resource sidebar has a Prose diagnostics section: ${J((await sidebarText(page)).toUpperCase().includes("PROSE DIAGNOSTICS"))}`);
  });
  say(`M-48 hosts the page contacted during the whole run: ${J([...hosts])}`);
});
