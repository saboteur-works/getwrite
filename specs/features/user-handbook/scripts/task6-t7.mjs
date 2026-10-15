// Task 6, web build: views/timeline.md T-10 (Story End Date makes a span). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, handEdit, chipsInfo, tick, treeClick, openSettings, closeSettings, sidebarText, sidecars } from "./task6-tlib.mjs";
await withWeb("t6-t7", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "End", "Blank");
  await createNode(page, "E1", "text"); await createNode(page, "E2", "text"); await createNode(page, "E3", "text");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500); await closeSettings(page);
  await treeClick(page, "E1");
  await page.fill("input[aria-label=story-date-input]", "2026-04-01"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 1500);
  await treeClick(page, "E2");
  await page.fill("input[aria-label=story-date-input]", "2026-04-10"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 1500);
  await page.fill("input[aria-label=story-duration-quantity]", "2"); await page.selectOption("select[aria-label=story-duration-unit]", { label: "day" }); await page.locator("input[aria-label=story-duration-quantity]").blur(); await tick(page, 1500);
  await treeClick(page, "E3");
  await page.fill("input[aria-label=story-date-input]", "2026-04-20"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 1500);
  say("E3 sidebar timeline part: " + J((await sidebarText(page)).split("TIMELINE")[1]?.slice(0, 200)));
  say("E3 buttons: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim() + "|" + (b.getAttribute("aria-label") || "")).filter((t) => /Override|end|End/.test(t)))));
  await page.locator("button:has-text('Override')").first().click(); await tick(page, 1000);
  say("after Override: inputs=" + J(await page.evaluate(() => [...document.querySelectorAll("input,select")].map((e) => `${e.getAttribute("aria-label")}|${e.type}|${e.value}`).filter((t) => /end|story/i.test(t)))));
  const ei = page.locator("input[aria-label=story-end-date-input]").first();
  if (await ei.count()) { await ei.fill("2026-05-20T12:00"); await ei.blur(); await tick(page, 1500); }
  say("E3 stored: " + J(sidecars(h).find((s) => s.json.name === "E3").json.userMetadata));
  await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  say("chips: " + J((await chipsInfo(page)).map((c) => `${c.label}|${J(c.text)}|${c.w}x${c.h}@${c.x}`)));
  say("text: " + J((await bodyText(page)).split("\n").filter((l) => /SCENE|^· /.test(l))));
});
