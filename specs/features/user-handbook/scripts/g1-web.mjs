// Handbook re-run, group 1 (OQ-8), web build: statements added or changed after Feature 81 on
// installing.md, start-page.md, project-types.md and resource-tree.md. Run OUTSIDE the sandbox.
// Usage: node g1-web.mjs <section>   sections: states, cards, tree, settings, ptm-off, ptm
import { withWeb, say, J, bodyText, newLines, createProject, closeProject, expandAll, treeRows, outline } from "./task3-lib.mjs";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const lines = async (page) => (await bodyText(page)).split("\n").map((l) => l.trim()).filter(Boolean);
const gear = async (page) => { await page.click('button[aria-label="Open project settings menu"]'); await page.waitForTimeout(400); };
const menuItems = (page) => page.$$eval("[role=menuitem]", (e) => e.map((x) => x.textContent.trim()));
const section = process.argv[2];

// ---------------------------------------------------------------- installing.md: list states
if (section === "states") {
  await withWeb("g1-states", {}, async ({ h, page }) => {
    await step("I-load", async () => {
      await page.route("**/api/projects", async (r) => { if (r.request().method() === "GET") { await new Promise((s) => setTimeout(s, 4000)); } await r.continue(); });
      await page.goto(h.baseUrl + "/");
      await page.waitForTimeout(1200);
      say(`I-load while /api/projects is held 4 s: ${J((await lines(page)).filter((l) => /Loading projects|No projects yet|could not be loaded/i.test(l)))}`);
      await page.waitForTimeout(5000);
      say(`I-load after it returns: ${J((await lines(page)).filter((l) => /Loading projects|No projects yet|could not be loaded/i.test(l)))}`);
      await page.unroute("**/api/projects");
    });
    await step("I-fail", async () => {
      await page.route("**/api/projects", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }) : r.continue()));
      await page.goto(h.baseUrl + "/");
      await page.waitForTimeout(2500);
      say(`I-fail with /api/projects answering 500: ${J((await lines(page)).filter((l) => /Loading projects|No projects yet|could not be loaded/i.test(l)))}`);
      await page.unroute("**/api/projects");
      await page.route("**/api/projects", (r) => (r.request().method() === "GET" ? r.abort("failed") : r.continue()));
      await page.goto(h.baseUrl + "/");
      await page.waitForTimeout(2500);
      say(`I-fail with /api/projects aborted (network error): ${J((await lines(page)).filter((l) => /Loading projects|No projects yet|could not be loaded/i.test(l)))}`);
      await page.unroute("**/api/projects");
    });
  });
}

// ---------------------------------------------------------------- start-page.md: cannot-be-opened cards
if (section === "cards") {
  await withWeb("g1-cards", {}, async ({ h, page }) => {
    const names = ["Healthy", "BadJson", "NameNumber", "NoId", "NoCreatedAt", "Unreadable", "BadConfig", "TreeUnreadable"];
    for (const n of names) { await createProject(page, h, n, "Blank"); await closeProject(page); }
    const dirOf = {};
    for (const d of readdirSync(h.projectsDir)) dirOf[JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")).name] = d;
    const pj = (n) => path.join(h.projectsDir, dirOf[n], "project.json");
    const edit = (n, f) => { const j = JSON.parse(readFileSync(pj(n), "utf8")); f(j); writeFileSync(pj(n), JSON.stringify(j, null, 2)); };
    writeFileSync(pj("BadJson"), "{ not json");
    edit("NameNumber", (j) => { j.name = 42; });
    edit("NoId", (j) => { delete j.id; });
    edit("NoCreatedAt", (j) => { delete j.createdAt; });
    chmodSync(pj("Unreadable"), 0o000);
    edit("BadConfig", (j) => { j.config = { ...(j.config || {}), dailyWordGoal: "lots" }; });
    chmodSync(path.join(h.projectsDir, dirOf.TreeUnreadable, "folders"), 0o000);
    say(`C folder of each project: ${J(dirOf)}`);
    try {
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(3000);
      await step("C-cards", async () => {
        say(`C start page lines: ${J((await lines(page)).filter((l) => !/^(Get|Write)$/.test(l)))}`);
        const cards = await page.$$eval("article, li, [class*=card]", (els) => els.filter((e) => /cannot be opened/i.test(e.innerText) && e.innerText.length < 600).map((e) => ({ text: e.innerText.split("\n").filter(Boolean), buttons: [...e.querySelectorAll("button,a")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()) })));
        const seen = new Set();
        for (const c of cards) { const k = c.text.join("|"); if (seen.has(k)) continue; seen.add(k); say(`C card: ${J(c)}`); }
        say(`C Open buttons on page: ${J(await page.$$eval("button", (b) => b.map((x) => x.getAttribute("aria-label") || "").filter((l) => /^Open /.test(l))))}`);
      });
      await step("C-open-healthy", async () => {
        await page.click('button[aria-label="Open Healthy"]'); await page.waitForTimeout(2500);
        say(`C after opening Healthy: header ${J((await lines(page)).slice(2, 6))}`);
      });
      say(`C project.json bytes unchanged check (BadJson still "{ not json"): ${readFileSync(pj("BadJson"), "utf8") === "{ not json"}`);
    } finally {
      chmodSync(pj("Unreadable"), 0o644);
      chmodSync(path.join(h.projectsDir, dirOf.TreeUnreadable, "folders"), 0o755);
    }
  });
}

// ---------------------------------------------------------------- resource-tree.md: folder visibility and creation order
if (section === "tree") {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const wav = () => { const n = 800, b = Buffer.alloc(44 + n * 2); b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40); return b; };
  await withWeb("g1-tree", {}, async ({ h, page }) => {
    const imgPath = path.join(h.run.dir, "pic.png"); writeFileSync(imgPath, PNG);
    const audPath = path.join(h.run.dir, "tone.wav"); writeFileSync(audPath, wav());
    const mk = async (title, type, file, viaNode) => {
      if (viaNode) { await page.click(`button[aria-label="${viaNode} options"]`); await page.click(".resource-context-menu-item:has-text('Create')"); }
      else await page.locator('button[aria-label="Create Resource"]:visible').first().click();
      await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
      if (type !== "text") await page.selectOption("[role=dialog] select, dialog select", type);
      if (file) await page.setInputFiles("input[type=file]", file);
      await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
      await page.waitForTimeout(2500);
    };
    const reopen = async (name) => { await page.reload(); await page.waitForTimeout(2000); const b = page.locator(`button[aria-label="Open ${name}"]`); if (await b.count()) { await b.click(); await page.waitForTimeout(2000); } };
    const visibleRows = () => page.$$eval('button[aria-label$=" options"]', (b) => b.map((x) => x.getAttribute("aria-label").replace(/ options$/, "")));
    if (process.argv[3] !== "order") for (const run of [1, 2, 3]) {
      await step(`T-folder run ${run}`, async () => {
        await createProject(page, h, `Folder Test ${run}`, "Blank");
        await mk(`Sub ${run}`, "folder", null, "Workspace");
        say(`T-folder run ${run}: rows right after creating folder "Sub ${run}" under Workspace (no reload, no expand): ${J(await visibleRows())}`);
        await expandAll(page);
        say(`T-folder run ${run}: rows after expanding (no reload): ${J(await visibleRows())}`);
        await reopen(`Folder Test ${run}`);
        await expandAll(page);
        say(`T-folder run ${run}: rows after reload: ${J(await visibleRows())}`);
        await closeProject(page);
      });
    }
    if (process.argv[3] === "order") for (const run of [1, 2, 3]) {
      await step(`T-order run ${run}`, async () => {
        await createProject(page, h, `Order Test ${run}`, "Blank");
        await mk("Doc One", "text", null, "Workspace"); await mk("Picture", "image", imgPath, "Workspace"); await mk("Tone", "audio", audPath, "Workspace");
        await expandAll(page);
        say(`T-order run ${run}: created Doc One, Picture, Tone; before reload: ${J(outline(await treeRows(page)))}`);
        await reopen(`Order Test ${run}`); await expandAll(page);
        say(`T-order run ${run}: after reload: ${J(outline(await treeRows(page)))}`);
        await closeProject(page);
      });
    }
  });
}

// ---------------------------------------------------------------- start-page.md: App Settings in the gear menu (web)
if (section === "settings") {
  await withWeb("g1-settings", {}, async ({ h, page }) => {
    await step("A-menu start", async () => {
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
      say(`A Start Page buttons: ${J(await page.$$eval("button", (b) => b.map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim()).filter(Boolean)))}`);
      await gear(page); say(`A gear menu, no project open: ${J(await menuItems(page))}`);
      await page.click("[role=menuitem]:has-text('App Settings')"); await page.waitForTimeout(800);
      say(`A App Settings dialog (path ${new URL(page.url()).pathname}): ${J(await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    });
    await step("A-menu project", async () => {
      await createProject(page, h, "Ent", "Blank");
      await gear(page); say(`A gear menu, project open: ${J(await menuItems(page))}`);
      await page.keyboard.press("Escape");
    });
    await step("A-noise", async () => {
      await page.click("button:has-text('CREATE RESOURCE')");
      await page.locator("[role=dialog] input[type=text]").first().fill("Quillfeather");
      await page.locator("[role=dialog] button:has-text('Create')").last().click(); await page.waitForTimeout(2500);
      await gear(page); await page.click("[role=menuitem]:has-text('Project Settings')"); await page.waitForTimeout(800);
      await page.locator("[role=dialog] [role=tab]:has-text('Entities')").click(); await page.waitForTimeout(500);
      const cb = page.locator("[role=dialog] input[type=checkbox]").last();
      if (!(await cb.isChecked())) await cb.click({ force: true });
      await page.waitForTimeout(800);
      await page.click("[role=dialog] button:has-text('Close')"); await page.waitForTimeout(500);
      await page.click("text=Quillfeather >> nth=0"); await page.waitForTimeout(1500);
      const ek = page.locator('input[placeholder*="ind" i], input[aria-label*="kind" i]').first();
      await ek.fill("character"); await ek.press("Enter"); await ek.blur(); await page.waitForTimeout(2000);
      const note = async () => (await lines(page)).filter((l) => /common English word|noise/i.test(l));
      say(`A entity Quillfeather, no global word: ${J(await note())}`);
      await gear(page); await page.click("[role=menuitem]:has-text('App Settings')"); await page.waitForTimeout(600);
      await page.locator("[role=dialog] input[type=text]").first().fill("quillfeather");
      await page.click("[role=dialog] button:has-text('Add')"); await page.waitForTimeout(800);
      say(`A App Settings after adding "quillfeather": ${J(await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      await page.reload(); await page.waitForTimeout(2500);
      const reopen = page.locator('button[aria-label="Open Ent"]'); if (await reopen.count()) { await reopen.click(); await page.waitForTimeout(2000); }
      await page.click("text=Quillfeather >> nth=0"); await page.waitForTimeout(1500);
      say(`A entity Quillfeather after the global word was added: ${J(await note())}`);
    });
  });
}

// ---------------------------------------------------------------- project-types.md: manager without a saved-types folder
if (section === "ptm-off") {
  await withWeb("g1-ptm-off", { copyTemplates: true }, async ({ h, page }) => {
    const open = async () => { await gear(page); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500); };
    const btns = () => page.$$eval("[role=dialog] button", (b) => b.map((x) => `${(x.textContent || "").trim().slice(0, 40)}${x.disabled ? " (disabled)" : ""}`).filter((t) => /^(Save|Save as copy|Delete|Discard|Keep editing)/.test(t)));
    await step("O-start", async () => {
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();
      say(`O no project open: dialog top ${J((await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean).slice(0, 6))))) }`);
      say(`O buttons (Article selected): ${J(await btns())}`);
      await page.click("[role=dialog] button:has-text('New Project Type')"); await page.waitForTimeout(600);
      say(`O buttons (new draft): ${J(await btns())}`);
      await page.getByLabel("Name", { exact: true }).first().fill("Draft Off");
      await page.click("[role=dialog] button:has-text('Close')"); await page.waitForTimeout(800);
      say(`O unsaved-changes prompt: ${J(await page.$$eval("[role=dialog],[role=alertdialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}; buttons ${J(await page.$$eval("[role=dialog] button,[role=alertdialog] button", (b) => b.map((x) => `${x.textContent.trim()}${x.disabled ? " (disabled)" : ""}`)))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      say(`O after Escape on the prompt, manager still open: ${(await page.$$eval("[role=dialog]", (d) => d.some((x) => /Project Type Manag/i.test(x.innerText))))}`);
    });
    await step("O-project", async () => {
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
      await createProject(page, h, "Off Project", "Blank"); await open();
      say(`O project open: dialog top ${J((await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean).slice(0, 6)))))}`);
      say(`O project open, buttons: ${J(await btns())}`);
    });
    await step("O-post", async () => {
      const spec = JSON.parse(readFileSync(path.join(h.templatesDir, "blank_project_type.json"), "utf8"));
      const r = await fetch(`${h.baseUrl}/api/project-types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...spec, id: "posted_type", name: "Posted Type" }) });
      say(`O POST /api/project-types with no saved-types folder: ${r.status} ${await r.text()}`);
      say(`O templates folder after POST: ${J(readdirSync(h.templatesDir))}`);
    });
  });
}

// ---------------------------------------------------------------- project-types.md: manager with a throwaway saved-types folder
if (section === "ptm") {
  await withWeb("g1-ptm", { copyTemplates: true, savedTypes: true }, async ({ h, page }) => {
    const hashDir = (d) => J(readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort().map((f) => f + ":" + createHash("sha1").update(readFileSync(path.join(d, f))).digest("hex").slice(0, 8)));
    const builtinsBefore = hashDir(h.templatesDir);
    const saved = () => readdirSync(h.savedTypesDir).sort();
    const savedJson = (f) => JSON.parse(readFileSync(path.join(h.savedTypesDir, f), "utf8"));
    const dlg = () => page.locator("[role=dialog]").first();
    const open = async () => { await gear(page); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500); };
    const pick = async (label) => { await dlg().locator(`button:has-text("${label}")`).first().click(); await page.waitForTimeout(700); };
    const btns = () => page.$$eval("[role=dialog] button", (b) => b.map((x) => `${(x.textContent || "").trim().slice(0, 40)}${x.disabled ? " (disabled)" : ""}`).filter((t) => /^(Save|Save as copy|Delete)( \(disabled\))?$/.test(t)));
    const field = (label, nth = 0) => dlg().getByLabel(label, { exact: true }).nth(nth);
    const click = async (name) => { await dlg().getByRole("button", { name, exact: true }).first().click(); await page.waitForTimeout(1200); };
    const diff = (name) => newLines(page, () => click(name));
    const freshDraft = async () => { await click("New Project Type"); };
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();

    await step("M-list", async () => {
      say(`M list: ${J(await page.$$eval("[role=dialog] button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /json|draft/i.test(t))))}`);
      say(`M built-in Article buttons: ${J(await btns())}`);
    });
    await step("M-copy", async () => {
      await field("Description").fill("Edited before copying.");
      const added = await diff("Save as copy");
      say(`M Save as copy on Article: new lines ${J(added)}; saved files ${J(saved())}`);
      for (const f of saved()) { const j = savedJson(f); say(`M saved ${f}: id=${j.id} name=${J(j.name)} description=${J(j.description)}`); }
      say(`M built-in templates unchanged after Save as copy: ${hashDir(h.templatesDir) === builtinsBefore}`);
    });
    await step("M-saved-buttons", async () => {
      say(`M list after copy: ${J(await page.$$eval("[role=dialog] button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /json|draft|Saved|Copy/i.test(t))))}`);
      say(`M buttons on the saved copy: ${J(await btns())}`);
      say(`M id field on the saved copy: readOnly=${await field("ID").evaluate((e) => e.readOnly)} disabled=${await field("ID").isDisabled()}`);
      await field("Word Count Goal").fill("2222");
      const added = await diff("Save");
      const f = saved()[0];
      say(`M Save on the saved copy: new lines ${J(added)}; files ${J(saved())}; ${f} wordCountGoal=${J(savedJson(f).wordCountGoal ?? savedJson(f).config?.wordCountGoal)}`);
    });
    await step("M-delete", async () => {
      const before = saved();
      await click("Delete");
      say(`M Delete confirm: ${J(await page.$$eval("[role=dialog],[role=alertdialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean).slice(0, 6))))}`);
      await page.getByRole("button", { name: "Cancel", exact: true }).last().click(); await page.waitForTimeout(600);
      say(`M after Cancel, files ${J(saved())} (before ${J(before)})`);
      await click("Delete");
      await page.locator("[role=alertdialog] button:has-text('Delete'), [role=dialog] >> nth=-1 >> button:has-text('Delete')").last().click(); await page.waitForTimeout(1500);
      say(`M after confirming Delete, files ${J(saved())}; status ${J((await lines(page)).filter((l) => /Deleted/.test(l)))}`);
    });
    await step("M-draft-id", async () => {
      await freshDraft();
      say(`M new draft buttons: ${J(await btns())}; id editable=${await field("ID").isEditable()}`);
      await field("ID").fill("zz_type"); await field("Name").fill("ZZ Type");
      const added = await diff("Save");
      say(`M new draft Save: new lines ${J(added)}; files ${J(saved())}`);
      say(`M id after first save: editable=${await field("ID").isEditable()} readOnly=${await field("ID").evaluate((e) => e.readOnly)}`);
    });
    const attempt = async (tag, setup) => {
      await freshDraft();
      await field("ID").fill(`t_${tag.replace(/\W+/g, "_").toLowerCase().slice(0, 30)}`); await field("Name").fill(`T ${tag}`);
      await setup();
      const before = saved();
      const added = await diff("Save");
      say(`M refuse [${tag}]: new lines ${J(added)}; file written: ${J(saved().filter((f) => !before.includes(f)))}`);
    };
    await step("M-clash-id", () => attempt("clash id", async () => { await field("ID").fill("novel"); }));
    await step("M-clash-name", () => attempt("clash name", async () => { await field("Name").fill("  NOVEL "); }));
    await step("M-blank-name", () => attempt("blank name", async () => { await field("Name").fill("   "); }));
    await step("M-blank-status", () => attempt("blank status", async () => { await click("Add Status"); }));
    await step("M-dup-status", () => attempt("dup status", async () => { await click("Add Status"); await field("Status Label", 0).fill("Draft"); await click("Add Status"); await field("Status Label", 1).fill(" draft "); }));
    await step("M-blank-folder", () => attempt("blank folder", async () => { await field("Folder Name", 0).fill(""); }));
    await step("M-blank-sub", () => attempt("blank subfolder", async () => { await click("Add Default Folder"); await field("Parent Folder", 0).fill("Workspace"); }));
    await step("M-blank-parent", () => attempt("blank parent", async () => { await click("Add Default Folder"); await field("Name", 1).fill("Chapter A"); }));
    await step("M-similar", () => attempt("similar siblings", async () => { await click("Add Folder"); await field("Folder Name", 1).fill("Chapter 1"); await click("Add Folder"); await field("Folder Name", 2).fill("Chapter 1!"); }));
    await step("M-similar-sub", () => attempt("similar subfolders", async () => { await click("Add Default Folder"); await field("Name", 1).fill("Part 1"); await field("Parent Folder", 0).fill("Workspace"); await click("Add Default Folder"); await field("Name", 2).fill("part-1"); await field("Parent Folder", 1).fill("Workspace"); }));
    await step("M-blank-doc", () => attempt("blank starter doc", async () => { await click("Add Resource"); }));
    await step("M-id-blank", () => attempt("id blank", async () => { await field("ID").fill(""); }));
    await step("M-id-chars", () => attempt("id chars", async () => { await field("ID").fill("Bad ID"); }));
    await step("M-id-long", () => attempt("id long", async () => { await field("ID").fill("a".repeat(65)); }));
    await step("M-goal-neg", () => attempt("goal negative", async () => { await field("Word Count Goal").fill("-1"); }));
    await step("M-goal-frac", () => attempt("goal fraction", async () => { await field("Word Count Goal").fill("1.5"); }));
    await step("M-no-folders", () => attempt("no folders", async () => { await dlg().locator("button:has-text('Remove')").first().click(); }));
    await step("M-two-docs", () => attempt("two docs same name", async () => { for (const i of [0, 1]) { await click("Add Resource"); await field("Name", 1 + i).fill("Same Doc"); } }));
    await step("M-trim", async () => {
      await attempt("trim", async () => { await field("ID").fill("trim_type"); await field("Name").fill("  Spaced Type  "); await field("Folder Name", 0).fill("  Workspace  "); });
      if (saved().includes("trim_type.json")) { const j = savedJson("trim_type.json"); say(`M trim saved: name=${J(j.name)} folders=${J(j.folders)}`); }
    });
    await step("M-empty-folder-doc", async () => {
      await freshDraft();
      await field("ID").fill("empty_folder_doc"); await field("Name").fill("Empty Folder Doc");
      await click("Add Folder"); await field("Folder Name", 1).fill("Second");
      const added = await newLines(page, () => click("Add Resource"));
      say(`M Add Resource lines (Folder left empty): ${J(added)}`);
      await field("Name", 1).fill("Starter");
      const saveLines = await diff("Save");
      say(`M save with empty starter Folder: ${J(saveLines)}; files ${J(saved())}`);
    });
    await step("M-unsaved", async () => {
      await pick("Blank"); await field("Description").fill("Unsaved edit.");
      await dlg().getByRole("button", { name: "Close", exact: true }).click(); await page.waitForTimeout(800);
      say(`M Close with an unsaved edit: ${J(await page.$$eval("[role=dialog],[role=alertdialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      say(`M after Escape: manager open=${await page.$$eval("[role=dialog]", (d) => d.some((x) => /Project Type Manag/i.test(x.innerText)))}; Blank description still edited=${(await field("Description").inputValue()) === "Unsaved edit."}`);
      await pick("Novel"); await page.waitForTimeout(600);
      say(`M select another type with an unsaved edit: ${J(await page.$$eval("[role=alertdialog], [role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean).slice(0, 10))))}`);
      await page.mouse.click(5, 5); await page.waitForTimeout(600);
      say(`M after clicking outside the prompt: manager open=${await page.$$eval("[role=dialog]", (d) => d.some((x) => /Project Type Manag/i.test(x.innerText)))}`);
      await pick("Novel");
      await page.getByRole("button", { name: "Discard", exact: true }).last().click(); await page.waitForTimeout(800);
      say(`M after Discard: selected type name field=${J(await field("Name").inputValue())}`);
    });
    await step("M-unsaved-refused", async () => {
      await freshDraft(); await field("ID").fill("novel"); await field("Name").fill("Refused Draft");
      await dlg().getByRole("button", { name: "Close", exact: true }).click(); await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Save", exact: true }).last().click(); await page.waitForTimeout(1500);
      say(`M Save in the prompt with a refused draft: manager open=${await page.$$eval("[role=dialog]", (d) => d.some((x) => /Project Type Manag/i.test(x.innerText)))}; lines ${J((await lines(page)).filter((l) => /novel|Novel|already|clash|use/i.test(l)).slice(0, 6))}`);
      await page.keyboard.press("Escape");
    });
    await step("M-create-from-saved", async () => {
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
      await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(600);
      say(`M create dialog type options: ${J(await page.$$eval("select option", (o) => o.map((x) => x.textContent.trim())))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      if (saved().includes("empty_folder_doc.json")) {
        await createProject(page, h, "From Saved", "Empty Folder Doc");
        await expandAll(page);
        say(`M project from saved type "Empty Folder Doc": tree ${J(outline(await treeRows(page)))}`);
        await closeProject(page);
      }
    });
    await step("M-bad-files", async () => {
      writeFileSync(path.join(h.savedTypesDir, "broken_one.json"), "{ nope");
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();
      say(`M one unusable file: ${J((await lines(page)).filter((l) => /could not be/i.test(l)))}; list ${J(await page.$$eval("[role=dialog] button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /broken/i.test(t))))}`);
      writeFileSync(path.join(h.savedTypesDir, "broken_two.json"), JSON.stringify({ id: "broken_two", name: "" }));
      await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();
      say(`M two unusable files: ${J((await lines(page)).filter((l) => /could not be/i.test(l)))}`);
      chmodSync(h.savedTypesDir, 0o000);
      try {
        await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();
        say(`M saved-types folder unreadable: ${J((await lines(page)).filter((l) => /could not be/i.test(l)))}`);
      } finally { chmodSync(h.savedTypesDir, 0o755); }
    });
    say(`M built-in templates unchanged at end: ${hashDir(h.templatesDir) === builtinsBefore}`);
  });
}

// ---------------------------------------------------------------- project-types.md: copy, saved type, delete, unsaved prompt
if (section === "ptm2") {
  await withWeb("g1-ptm2", { copyTemplates: true, savedTypes: true }, async ({ h, page }) => {
    const saved = () => readdirSync(h.savedTypesDir).sort();
    const savedJson = (f) => JSON.parse(readFileSync(path.join(h.savedTypesDir, f), "utf8"));
    const dlg = () => page.locator("[role=dialog]").filter({ hasText: "Project Type Management" }).first();
    const open = async () => { await gear(page); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500); };
    const pick = async (label) => { await dlg().locator(`button:has-text("${label}")`).first().click(); await page.waitForTimeout(700); };
    const btns = () => dlg().evaluate((d) => [...d.querySelectorAll("button")].map((x) => `${(x.textContent || "").trim().slice(0, 40)}${x.disabled ? " (disabled)" : ""}`).filter((t) => /^(Save|Save as copy|Delete)( \(disabled\))?$/.test(t)));
    const field = (label, nth = 0) => dlg().getByLabel(label, { exact: true }).nth(nth);
    const desc = () => dlg().locator("textarea").first();
    const click = async (name) => { await dlg().getByRole("button", { name, exact: true }).first().click(); await page.waitForTimeout(1200); };
    const diff = (name) => newLines(page, () => click(name));
    const dialogs = () => page.$$eval("[role=dialog],[role=alertdialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean).slice(0, 8)));
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500); await open();
    await step("M2-copy", async () => {
      await desc().fill("Edited before copying.");
      const added = await diff("Save as copy");
      say(`M2 Save as copy on Article: new lines ${J(added)}; saved files ${J(saved())}`);
      for (const f of saved()) { const j = savedJson(f); say(`M2 saved ${f}: id=${j.id} name=${J(j.name)} description=${J(j.description)}`); }
      const art = JSON.parse(readFileSync(path.join(h.templatesDir, "article_project_type.json"), "utf8"));
      say(`M2 built-in Article description after copy: ${J(art.description)}`);
    });
    await step("M2-saved", async () => {
      say(`M2 selected after copy: name=${J(await field("Name").inputValue())}; buttons ${J(await btns())}`);
      await field("Word Count Goal").fill("2222");
      const added = await diff("Save");
      const f = saved()[0];
      say(`M2 Save on the saved copy: new lines ${J(added)}; files ${J(saved())}; wordCountGoal in file ${J(savedJson(f).wordCountGoal)}`);
    });
    await step("M2-delete", async () => {
      const before = saved();
      await click("Delete");
      say(`M2 Delete confirm: ${J(await dialogs())}`);
      await page.getByRole("button", { name: "Cancel", exact: true }).last().click(); await page.waitForTimeout(600);
      say(`M2 after Cancel: files ${J(saved())} (before ${J(before)})`);
      await click("Delete");
      await page.getByRole("button", { name: "Delete", exact: true }).last().click(); await page.waitForTimeout(1500);
      say(`M2 after confirming Delete: files ${J(saved())}; lines ${J((await bodyText(page)).split("\n").filter((l) => /Deleted/.test(l)))}`);
    });
    await step("M2-inspect", async () => {
      await click("New Project Type");
      await field("ID").fill("blank_parent"); await field("Name").fill("Blank Parent");
      await click("Add Default Folder"); await field("Name", 1).fill("Chapter A");
      say(`M2 Parent Folder value as added: ${J(await field("Parent Folder", 0).inputValue())}`);
      await field("Parent Folder", 0).fill("");
      say(`M2 blank parent save: ${J(await diff("Save"))}`);
      if (saved().includes("blank_parent.json")) say(`M2 blank_parent.json defaultFolders=${J(savedJson("blank_parent.json").defaultFolders)}`);
      await click("New Project Type");
      await field("ID").fill("goal_fraction"); await field("Name").fill("Goal Fraction");
      await field("Word Count Goal").fill("1.5");
      say(`M2 word count goal input value after typing 1.5: ${J(await field("Word Count Goal").inputValue())}`);
      say(`M2 goal 1.5 save: ${J(await diff("Save"))}`);
      if (saved().includes("goal_fraction.json")) say(`M2 goal_fraction.json wordCountGoal=${J(savedJson("goal_fraction.json").wordCountGoal)}`);
    });
    await step("M2-unsaved", async () => {
      await pick("Blank"); await desc().fill("Unsaved edit.");
      await click("Close");
      say(`M2 Close with an unsaved edit: ${J(await dialogs())}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      say(`M2 after Escape: dialogs ${J((await dialogs()).map((d) => d[0]))}; Blank description still edited=${(await desc().inputValue()) === "Unsaved edit."}`);
      await pick("Novel");
      say(`M2 selecting another type with an unsaved edit: ${J((await dialogs()).map((d) => d[0]))}`);
      const box = await page.locator("[role=alertdialog], [role=dialog]:has-text('Unsaved changes')").last().boundingBox();
      await page.mouse.click(5, 895); await page.waitForTimeout(600);
      say(`M2 after clicking outside the prompt (prompt box ${J(box)}): dialogs ${J((await dialogs()).map((d) => d[0]))}`);
      await pick("Novel");
      await page.getByRole("button", { name: "Discard", exact: true }).last().click(); await page.waitForTimeout(800);
      say(`M2 after Discard: Name field ${J(await field("Name").inputValue())}; dialogs ${J((await dialogs()).map((d) => d[0]))}`);
      await pick("Blank");
      say(`M2 Blank description after Discard: ${J(await desc().inputValue())}`);
    });
    await step("M2-back", async () => {
      await desc().fill("Edit then go back.");
      await page.goBack(); await page.waitForTimeout(800);
      say(`M2 browser Back with an unsaved edit: ${J((await dialogs()).map((d) => d[0]))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    });
    await step("M2-refused-in-prompt", async () => {
      await click("New Project Type"); await field("ID").fill("novel"); await field("Name").fill("Refused Draft");
      await click("Close");
      await page.getByRole("button", { name: "Save", exact: true }).last().click(); await page.waitForTimeout(1500);
      say(`M2 Save in the prompt with a refused draft: dialogs ${J((await dialogs()).map((d) => d[0]))}; message ${J((await bodyText(page)).split("\n").filter((l) => /already uses/.test(l)))}`);
    });
  });
}
