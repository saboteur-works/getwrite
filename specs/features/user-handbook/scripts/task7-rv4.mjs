// Task 7, web build: RV-01 "Every resource keeps a history of revisions" - do image, audio and folder resources have one? Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, projectDir, walkFiles, rel, tick, sidecars } from "./task7-lib.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
await withWeb("t7-rv4", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Rev Types", "Blank");
  const png = path.join(h.run.dir, "p.png"); const mp3 = path.join(h.run.dir, "t.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", mp3]);
  await createNode(page, "Doc T", "text"); await createNode(page, "Pic", "image", "Workspace", png); await createNode(page, "Tone", "audio", "Workspace", mp3); await createNode(page, "Fold", "folder", "Workspace");
  const pd = projectDir(h);
  const idOf = Object.fromEntries(sidecars(h).map((s) => [s.json.name, s.json.id]));
  const revs = walkFiles(path.join(pd, "revisions")).map((p) => rel(path.join(pd, "revisions"), p).split("/")[0]);
  for (const n of ["Doc T", "Pic", "Tone"]) say(`revisions dir for ${n}: ${revs.includes(idOf[n])}`);
  for (const n of ["Doc T", "Pic", "Tone"]) {
    await treeClick(page, n);
    const t = await bodyText(page);
    say(`${n}: page mentions revision text: ${J(t.split("\n").filter((l) => /revision/i.test(l)))}; revision-control panel present: ${await page.locator("section.revision-control-root").count()}`);
  }
});
