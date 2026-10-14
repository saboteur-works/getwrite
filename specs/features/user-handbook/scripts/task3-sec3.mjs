// Task 3, web build: Resource Tree rows R-01..R-10. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, expandAll, treeRows, outline } from "./task3-lib.mjs";
import { writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0,3).join(" | ")}`); } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
function wav() {
  const n = 800, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
await withWeb("web", {}, async ({ h, page }) => {
  const dlgOk = () => page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
  const mk = async (title, type, file, viaNode) => {
    if (viaNode) { await page.click(`button[aria-label="${viaNode} options"]`); await page.click(".resource-context-menu-item:has-text('Create')"); }
    else await page.click("button:has-text('CREATE RESOURCE')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
    if (type !== "text") await page.selectOption("select", type);
    if (file) await page.setInputFiles('input[type=file]', file);
    await dlgOk();
    await page.waitForTimeout(2500);
  };
  const reopen = async () => {
    await page.reload(); await page.waitForTimeout(2000);
    const b = page.locator('button[aria-label="Open Tree Test"]');
    if (await b.count()) { await b.click(); await page.waitForTimeout(2000); }
  };
  const outl = async () => { await expandAll(page); return outline(await treeRows(page)); };
  await createProject(page, h, "Tree Test", "Blank");
  const imgPath = path.join(h.run.dir, "pic.png"); writeFileSync(imgPath, PNG);
  const audPath = path.join(h.run.dir, "tone.wav"); writeFileSync(audPath, wav());
  await step("R-01/R-03/R-09", async () => {
    await mk("Doc One", "text", null, "Workspace");
    await mk("Folder One", "folder", null, "Workspace");
    say(`R-03 raw body after creating folder: ${J((await bodyText(page)).split("\n").slice(0, 16))}`);
    await mk("Picture", "image", imgPath, "Workspace");
    await mk("Tone", "audio", audPath, "Workspace");
    say(`R-01/03/09 tree after creating a document, folder, image, audio: ${J(await outl())}`);
    const rf = (await bodyText(page)).match(/RECENT FILES[\s\S]*?METADATA/);
    say(`R-09 recent files kinds: ${J(rf ? rf[0].split("\n").filter(Boolean) : null)}`);
    say(`R-09 tree row icons (svg class per row): ${J(await page.$$eval('button[aria-label$=" options"]', (bs) => bs.map((b) => { const row = b.closest("div").parentElement; const s = row.querySelector("svg:not([class*=chevron])"); return b.getAttribute("aria-label").replace(" options","") + ":" + [...(row.querySelectorAll("svg"))].map((x) => (x.getAttribute("class")||"").split(" ").find((c) => c.startsWith("lucide-")) || "").join(","); })))}`);
  });
  await step("R-03 reload", async () => {
    await reopen();
    say(`R-03 tree after reload (no rename yet): ${J(await outl())}`);
  });
  await step("R-02", async () => {
    await page.click("text=Doc One >> nth=0");
    await page.waitForTimeout(1500);
    say(`R-02 click Doc One: editor present=${await page.locator(".ProseMirror").count()}; work area text ${J((await bodyText(page)).split("\n").filter((l) => /DOC ONE|Doc One|EDITING|Words/.test(l)))}`);
    await page.click("text=Picture >> nth=0");
    await page.waitForTimeout(1500);
    say(`R-02 click Picture: imgs=${await page.locator("img").count()}; lines ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-12))}`);
    await page.click("text=Tone >> nth=0");
    await page.waitForTimeout(1500);
    say(`R-02 click Tone: audio elements=${await page.locator("audio").count()}`);
  });
  await step("R-04", async () => {
    await page.click('button[aria-label="Doc One options"]');
    await page.click(".resource-context-menu-item:has-text('Rename')");
    await page.waitForTimeout(500);
    say(`R-04 rename dialog: ${J(await page.$$eval("[role=dialog] *, dialog *", (els) => els.filter((e) => e.children.length === 0 || e.tagName === "INPUT").map((e) => e.tagName + ":" + (e.value || e.textContent || "").trim().slice(0, 40)).filter((x) => !x.endsWith(":"))))}`);
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("Doc Renamed");
    await page.locator("[role=dialog] button:has-text('Save'), dialog button:has-text('Save'), [role=dialog] button:has-text('Rename'), dialog button:has-text('Rename')").last().click();
    await page.waitForTimeout(1500);
    await reopen();
    say(`R-04 after rename and reload: ${J(await outl())}`);
  });
  await step("R-05 move", async () => {
    await page.click('button[aria-label="Doc Renamed options"]');
    await page.click(".resource-context-menu-item:has-text('Move to')");
    await page.waitForTimeout(600);
    say(`R-05 Move to dialog: ${J(await page.$$eval("[role=dialog] *, dialog *", (els) => els.filter((e) => e.children.length === 0).map((e) => e.tagName + ":" + (e.textContent || "").trim().slice(0, 40)).filter((x) => !x.endsWith(":"))))}`);
    await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t3-move.png" });
    await page.keyboard.press("Escape");
  });
  await step("R-06/R-07", async () => {
    await reopen();
    await expandAll(page);
    await mk("Alpha Doc", "text", null, "Folder One");
    await mk("Bravo Doc", "text", null, "Folder One");
    await mk("Charlie Doc", "text", null, "Folder One");
    const o1 = await outl();
    say(`R-06 tree before drag: ${J(o1)}`);
    const box = async (name) => page.locator(`text="${name}"`).first().boundingBox();
    const a = await box("Charlie Doc"), b = await box("Alpha Doc");
    await page.mouse.move(a.x + 10, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y - 5, { steps: 5 });
    await page.mouse.move(b.x + 10, b.y + 1, { steps: 15 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    say(`R-06 tree after dragging Charlie Doc above Alpha Doc: ${J(await outl())}`);
    await reopen();
    say(`R-06 tree after reload: ${J(await outl())}`);
    await page.click("text=Folder One >> nth=0");
    await page.waitForTimeout(1500);
    const t = await bodyText(page);
    say(`R-10/R-07 selecting Folder One: tab ${J(await page.$$eval("[role=tab][aria-selected=true]", (e) => e.map((x) => x.textContent)))}; Work Area lines ${J(t.split("\n").filter(Boolean).filter((l) => /Doc|Folder One|Open|text file/.test(l)))}`);
    await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t3-organizer-order.png" });
  });
  await step("R-07 compile order", async () => {
    // nothing else claimed; the tree order is only compared with the Organizer here
  });
});
