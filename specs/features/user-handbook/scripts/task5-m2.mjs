// Task 5, web build: story/metadata.md rows M-23, M-24, M-25 (image/audio sidebar, default field visibility) and M-58..M-60 (tags).
// Run OUTSIDE the sandbox.
import { createProject, withWeb, say, J, bodyText, step, newProjectWithDoc, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, createNode, treeClick, sidecarByName, projectJson, projectDir, walk } from "./task5-lib.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
const stepSafe = (page) => async (id, fn) => { await step(id, fn); const c = page.locator("[role=dialog] button:text-is('Close'), dialog button:text-is('Close')"); if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); } };
function makeJpegWithExif(dir) {
  const png = path.join(dir, "base.png"), jpg0 = path.join(dir, "base.jpg"), jpg = path.join(dir, "photo.jpg");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=64x48", "-frames:v", "1", png]);
  execFileSync("sips", ["-s", "format", "jpeg", png, "--out", jpg0], { stdio: "ignore" });
  const base = readFileSync(jpg0);
  const make = Buffer.from("Canon\0"), model = Buffer.from("TestCam\0");
  // TIFF: header 8 bytes, IFD0 with 2 entries (Make 0x010F, Model 0x0110), next-IFD 0, then data
  const ifdStart = 8, entries = 2, dataStart = ifdStart + 2 + entries * 12 + 4;
  const tiff = Buffer.alloc(dataStart + make.length + model.length);
  tiff.write("II", 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(ifdStart, 4);
  tiff.writeUInt16LE(entries, ifdStart);
  const ent = (i, tag, data, off) => { const o = ifdStart + 2 + i * 12; tiff.writeUInt16LE(tag, o); tiff.writeUInt16LE(2, o + 2); tiff.writeUInt32LE(data.length, o + 4); tiff.writeUInt32LE(off, o + 8); data.copy(tiff, off); };
  ent(0, 0x010f, make, dataStart); ent(1, 0x0110, model, dataStart + make.length);
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const seg = Buffer.alloc(4); seg.writeUInt8(0xff, 0); seg.writeUInt8(0xe1, 1); seg.writeUInt16BE(exif.length + 2, 2);
  writeFileSync(jpg, Buffer.concat([base.subarray(0, 2), seg, exif, base.subarray(2)]));
  return jpg;
}
await withWeb("t5-m2", {}, async ({ h, page }) => {
  const jpg = makeJpegWithExif(h.run.dir);
  const mp3 = path.join(h.run.dir, "tone.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", mp3]);
  say(`fixtures: jpg ${readFileSync(jpg).length} bytes (64x48, hand-added EXIF Make=Canon Model=TestCam); mp3 ${readFileSync(mp3).length} bytes (2 s sine)`);
  await newProjectWithDoc(page, h, "Media Test", "Scene One");
  await openSettings(page, "Metadata");
  await page.getByRole("checkbox", { name: /Synopsis/ }).click(); await tick(page, 1200);
  await closeSettings(page);
  await addSidebarField(page, "ftext", "F Text", "Text", "Document");
  say(`M-25 text resource sidebar: ${J((await sidebarText(page)).split("\n").filter((l) => /^(SYNOPSIS|STATUS|F TEXT|TAGS)$/i.test(l)))}`);
  const S = stepSafe(page);
  await S("tags create", async () => {
    await openSettings(page, "Manage Tags");
    say(`M-60 Manage Tags tab: ${J((await dialogText(page)).split("\n").slice(12, 40))}; controls=${J(await page.$$eval("[role=dialog] input, [role=dialog] button", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.placeholder || x.textContent.trim().slice(0, 20))).filter((s) => /tag|Add|Create|Delete|Rename|Save|Edit/i.test(s))))}`);
    await page.fill("input[aria-label='New tag name']", "flashback"); await page.keyboard.press("Enter"); await tick(page, 1500);
    say(`M-60 after Enter: ${J((await dialogText(page)).split("\n").filter((l) => /flashback/i.test(l)))}`);
    await page.fill("input[aria-label='New tag name']", "draft2"); 
    await page.locator("button:text-is('Add Tag')").click(); await tick(page, 1500);
    say(`M-60 dialog lines mentioning the tags: ${J((await dialogText(page)).split("\n").filter((l) => /flashback|draft2|Delete|Rename|Edit/i.test(l)).slice(0, 12))}; buttons/inputs with tag names: ${J(await page.$$eval("[role=dialog] [aria-label]", (o) => o.map((x) => x.getAttribute("aria-label")).filter((l) => /flashback|draft2|tag/i.test(l))))}; tags.json: ${J(walk(projectDir(h)).filter((p) => /tags/.test(p)).map((p) => [p.replace(projectDir(h), ""), readFileSync(p, "utf8").slice(0, 400)]))}`);
    await closeSettings(page);
  });
  await S("media", async () => {
    await createNode(page, "Picture", "image", "Workspace", jpg);
    await createNode(page, "Tone", "audio", "Workspace", mp3);
    await treeClick(page, "Picture");
    await tick(page, 1500);
    const sp = await sidebarText(page);
    say(`M-23/24 image sidebar text: ${J(sp)}`);
    say(`M-23 image sidebar controls: ${J(await page.$$eval("input, select, textarea", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.type)).filter((s) => !/resource-search|Font|Line Height/.test(s))))}`);
    say(`M-23 image sidecar: ${J(sidecarByName(h, "Picture").json)}`);
    await treeClick(page, "Tone");
    await tick(page, 1500);
    say(`M-23/24 audio sidebar text: ${J(await sidebarText(page))}`);
    say(`M-23 audio sidebar controls: ${J(await page.$$eval("input, select, textarea", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.type)).filter((s) => !/resource-search|Font|Line Height/.test(s))))}`);
    say(`M-23 audio sidecar: ${J(sidecarByName(h, "Tone").json)}`);
  });
  await S("media edit", async () => {
    await treeClick(page, "Picture");
    await page.selectOption("select[aria-label=status]", { label: "Published" }); await tick(page, 1500);
    if (await page.locator("textarea[aria-label=synopsis]").count()) { await page.fill("textarea[aria-label=synopsis]", "A red rectangle."); await page.locator("textarea[aria-label=synopsis]").blur(); await tick(page, 1500); }
    if (await page.locator("input[aria-label=ftext]").count()) { await page.fill("input[aria-label=ftext]", "photo-field"); await page.locator("input[aria-label=ftext]").blur(); await tick(page, 1500); }
    say(`M-23 image sidecar after edits: ${J(sidecarByName(h, "Picture").json.userMetadata)}`);
    const tagsText = (await sidebarText(page)).split("\n").slice(-14);
    say(`M-23 image Tags section text: ${J(tagsText)}; tag controls: ${J(await page.$$eval("[role=checkbox], input[type=checkbox], button", (o) => o.map((x) => x.getAttribute("aria-label") || x.textContent.trim()).filter((s) => /flashback|draft2|tag/i.test(s))))}`);
    const tagEl = page.locator("button:text-is('flashback')");
    say(`M-59 tag control element: ${J(await tagEl.first().evaluate((e) => ({ tag: e.tagName, role: e.getAttribute("role"), type: e.getAttribute("type"), pressed: e.getAttribute("aria-pressed"), checked: e.checked })))}`);
    await tagEl.first().click(); await tick(page, 2000);
    const grep = (needle) => walk(projectDir(h)).filter((p) => { try { return readFileSync(p, "utf8").includes(needle); } catch { return false; } }).map((p) => p.replace(projectDir(h), ""));
    say(`M-59 project.json tag-related content after assignment: ${J(Object.fromEntries(Object.entries(projectJson(h)).filter(([k]) => /tag/i.test(k)).concat(Object.entries(projectJson(h).config).filter(([k]) => /tag/i.test(k)))))}`);
    say(`M-23/M-59 after clicking the flashback tag on the image: state=${J(await tagEl.first().evaluate((e) => ({ pressed: e.getAttribute("aria-pressed"), checked: e.checked, cls: e.className.slice(0, 80) })))}; files containing "flashback": ${J(grep("flashback"))}`);
    await tagEl.first().click(); await tick(page, 2000);
    say(`M-59 after clicking it again (remove): state=${J(await tagEl.first().evaluate((e) => ({ pressed: e.getAttribute("aria-pressed"), checked: e.checked })))}; files containing "flashback": ${J(grep("flashback"))}`);
    await tagEl.first().click(); await tick(page, 2000);
    await treeClick(page, "Tone");
    await page.locator("button:text-is('draft2')").first().click(); await tick(page, 2000);
    say(`M-23 audio resource tag assigned (draft2): files containing "draft2": ${J(grep("draft2"))}`);
    await openSettings(page, "Manage Tags");
    say(`M-60 Manage Tags tab controls with two tags present: ${J(await page.$$eval("[role=dialog] [aria-label]", (o) => o.map((x) => x.getAttribute("aria-label")).filter((l) => /tag|Rename|Edit/i.test(l))))}; clicking the tag name text: ${J(await (async () => { await page.locator("[role=dialog] >> text=draft2").first().click().catch(() => {}); return (await page.$$eval("[role=dialog] input[type=text]", (o) => o.map((x) => x.getAttribute("aria-label") || x.value))); })())}`);
    await page.click("[aria-label='Delete tag draft2']"); await tick(page, 1200);
    say(`M-60 delete tag draft2: dialog/confirm=${J(await page.evaluate(() => [...document.querySelectorAll("[role=alertdialog], [role=dialog]")].map((d) => d.innerText.slice(0, 200)).filter((t) => /delete|remove/i.test(t) && !/Project Settings/.test(t.slice(0, 20)))))}`);
    const conf = page.locator("[role=alertdialog] button, [role=dialog] button").filter({ hasText: /^(Delete|Confirm|Remove|Yes)/ });
    if (await conf.count()) { await conf.last().click(); await tick(page, 1500); }
    say(`M-60 after delete: tags in dialog=${J((await page.$$eval("[aria-label^='Delete tag']", (o) => o.map((x) => x.getAttribute("aria-label")))))}; files containing "draft2": ${J(grep("draft2"))}`);
    await closeSettings(page);
    say(`M-60 audio sidebar Tags right after delete (dialog closed): ${J((await sidebarText(page)).split("\n").slice(-6))}`);
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Media Test"]'); await tick(page, 2000); await treeClick(page, "Tone");
    say(`M-60 audio sidebar Tags after a reload: ${J((await sidebarText(page)).split("\n").slice(-6))}; project.json tag-related content: ${J(Object.fromEntries(Object.entries(projectJson(h)).filter(([k]) => /tag/i.test(k)).concat(Object.entries(projectJson(h).config).filter(([k]) => /tag/i.test(k)))))}`);
    await treeClick(page, "Tone");
    await page.selectOption("select[aria-label=status]", { label: "Draft" }); await tick(page, 1500);
    say(`M-23 audio sidecar after status: ${J(sidecarByName(h, "Tone").json.userMetadata)}`);
  });
  await S("tags project-scoped", async () => {
    await createProject(page, h, "Media Two", "Blank");
    await openSettings(page, "Manage Tags");
    say(`M-58 second new project, Manage Tags tab: ${J((await dialogText(page)).split("\n").filter((l) => /No tags|FLASHBACK|DRAFT2/i.test(l)))}`);
  });
});
