// Task 8, web build: project-configuration.md rows PC-03 (name required?), PC-09 (absent flag means off; a flag set by hand). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, reloadProject, tick, projectDir, readPj, writePj, bodyText, sidebarText } from "./task8-lib.mjs";
await withWeb("t8-p9", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Cfg Five", "Blank");
  const pd = projectDir(h);
  await createNode(page, "Doc One", "text"); await treeClick(page, "Doc One");
  const heads = async () => (await sidebarText(page)).split("\n").filter((l) => /^[A-Z][A-Z /()-]+$/.test(l));
  say("PC-09 new project (no features key=" + J(!("features" in readPj(pd).config)) + ") sidebar headings: " + J(await heads()));
  const o = readPj(pd); o.config.features = { synopsis: true, pov: false }; writePj(pd, o);
  await reloadProject(page, "Cfg Five"); await treeClick(page, "Doc One");
  say("PC-09 features {synopsis:true, pov:false} written by hand (timeline, notes absent): sidebar headings: " + J(await heads()));
  const o2 = readPj(pd); delete o2.name; writePj(pd, o2);
  await page.goto(h.baseUrl + "/"); await tick(page, 2500);
  say("PC-03 project.json without a name: Start Page lines " + J((await bodyText(page)).split("\n").filter((l) => /ACTIVE|PROJECT|Cfg|No projects|could/i.test(l)).slice(0, 8)));
  o2.name = "Cfg Five"; writePj(pd, o2);
});
