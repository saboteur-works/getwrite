// Task 5, web build: story/metadata-queries.md rows Q-21, Q-22, Q-27 (date operators on Created At / Updated At; links made by a reference field). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, chips, setField, setOp, tick, queryHelpers, newProjectWithDoc, createNode, openSettings, closeSettings, treeClick, sidecarByName, projectDir, typeInto } from "./task5-qlib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
await withWeb("t5-q5", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  const P = "Q Five";
  await newProjectWithDoc(page, h, P, "Scene A");
  await createNode(page, "Mara", "text");
  await openSettings(page, "Metadata"); await page.getByRole("checkbox", { name: /Point of View/ }).first().click(); await tick(page, 1200); await closeSettings(page);
  await treeClick(page, "Scene A");
  await page.fill("input[aria-label=pov-input]", "Mar"); await tick(page, 900); await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 1500);
  await typeInto(page, "Some words in scene A.");
  const created = sidecarByName(h, "Scene A").json.createdAt;
  say(`Scene A createdAt=${created}; updatedAt=${sidecarByName(h, "Scene A").json.updatedAt}; Mara updatedAt=${sidecarByName(h, "Mara").json.updatedAt}; now=${new Date().toISOString()}`);
  const { newQuery, saveAs, run, pickRef } = queryHelpers(page, h);
  const qdir = path.join(projectDir(h), "meta/queries");
  const def = (n) => readdirSync(qdir).map((f) => JSON.parse(readFileSync(path.join(qdir, f), "utf8"))).find((x) => x.name === n)?.definition;
  const dateQ = async (name, field, op, val) => {
    await newQuery(); await setField(page, 0, field); await setOp(page, 0, op);
    await chips(page).nth(0).locator("input[aria-label='Date']").fill(val); await tick(page, 400);
    await saveAs(name); say(`${name}: result=${J(await run(name))}; definition=${J(def(name))}`);
  };
  await step("Q-21", async () => {
    await dateQ("Q-21 Created At is before 2099-01-01", "Created At", "is before", "2099-01-01");
    await dateQ("Q-21 Created At is after 2099-01-01", "Created At", "is after", "2099-01-01");
    await dateQ("Q-21 Created At is on the creation date", "Created At", "is on", created.slice(0, 10));
  });
  await step("Q-22 in the last", async () => {
    await newQuery(); await setField(page, 0, "Updated At"); await setOp(page, 0, "in the last");
    await chips(page).nth(0).locator("input[aria-label='Amount']").fill("1"); await chips(page).nth(0).locator("select[aria-label='Unit']").selectOption({ label: "days" }); await tick(page, 400);
    await saveAs("Q-22 Updated At in the last 1 days"); say(`Q-22 Updated At in the last 1 days (Scene A was edited minutes ago): result=${J(await run("Q-22 Updated At in the last 1 days"))}; definition=${J(def("Q-22 Updated At in the last 1 days"))}`);
  });
  await step("Q-27 links via a reference field", async () => {
    say(`Q-27 meta/backlinks.json: ${J(JSON.parse(readFileSync(path.join(projectDir(h), "meta/backlinks.json"), "utf8")))}; ids: Scene A=${sidecarByName(h, "Scene A").json.id}, Mara=${sidecarByName(h, "Mara").json.id}`);
    await newQuery(); await setField(page, 0, "Links To"); await setOp(page, 0, "includes"); await pickRef(0, "Mar", "Mara");
    await saveAs("Q-27 Links To includes Mara"); say(`Q-27 "Links To includes Mara" (Scene A has Mara as its POV reference, no [[link]] in its text): result=${J(await run("Q-27 Links To includes Mara"))}`);
  });
});
