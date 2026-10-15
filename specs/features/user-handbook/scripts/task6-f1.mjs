// Task 6, web build: views/diff.md rows DF-01..DF-05. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, typeInto, pm, sidecars } from "./task6-lib.mjs";
await withWeb("t6-f1", {}, async ({ h, page }) => {
  await createProject(page, h, "Df", "Blank");
  await createNode(page, "Doc", "text");
  await typeInto(page, "Doc", "The cat sat on the mat. It was a quiet evening. The door was open.");
  await page.locator("button:has-text('EXPAND')").first().click(); await page.waitForTimeout(800);
  say("inputs in the revision panel: " + J(await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.getAttribute("aria-label")}|${i.placeholder}|${i.type}`))));
  await page.locator("input[placeholder*='evision'], input[aria-label*='evision']").first().fill("First draft"); await page.locator("button:has-text('SAVE')").first().click(); await page.waitForTimeout(2500);
  say("revision panel after save: " + J((await bodyText(page)).split("\n").slice(14, 40)));
  await pm(page).click(); await page.keyboard.press("Meta+A"); await page.keyboard.press("Delete");
  await page.keyboard.insertText("The dog sat on the mat. It was a quiet evening. A bell rang far away.");
  await page.waitForTimeout(5500);
  say("revisions on disk: " + J((await import("./task4-lib.mjs")).walk(h.projectsDir).filter((p) => /revisions\/.*\/(v-\d+)\/[^/]+$/.test(p)).map((p) => p.split("/revisions/")[1])));
  await page.click('[role=tab]:has-text("Diff")'); await page.waitForTimeout(2000);
  say("Diff tab text: " + J((await bodyText(page)).split("\n").slice(14, 40)));
  say("buttons: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim().replace(/\n+/g, " / ")).filter((t) => /First|Initial|v\d/.test(t)))));
  await page.locator("button:has-text('COMPARE'), button:has-text('Compare')").first().click(); await page.waitForTimeout(2500);
  say("after selecting First draft: " + J((await bodyText(page)).split("\n").slice(14, 60)));
  say("diff body html: " + J(await page.evaluate(() => { const els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /dog|cat|bell|door/.test(e.textContent)); return els.map((e) => `${e.tagName}|class=${e.className}|style=${e.getAttribute("style")}|${getComputedStyle(e).backgroundColor}|${getComputedStyle(e).textDecorationLine}|${e.textContent.slice(0, 40)}`); })));
  say("diff marks: " + J(await page.evaluate(() => [...document.querySelectorAll("ins,del,mark,[class*=diff],[class*=added],[class*=removed],[class*=insert],[class*=delet]")].slice(0, 30).map((e) => `${e.tagName}.${(e.className || "").toString().slice(0, 60)}|${e.textContent.slice(0, 50)}`))));
});
