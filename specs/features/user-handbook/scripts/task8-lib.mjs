// Shared helpers for the Task 8 runs (web build, Playwright; CLI). Builds on task7-lib.mjs.
export * from "./task7-lib.mjs";
import { say, J, bodyText } from "./task7-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export const readPj = (pd) => JSON.parse(readFileSync(path.join(pd, "project.json"), "utf8"));
export const writePj = (pd, o) => writeFileSync(path.join(pd, "project.json"), JSON.stringify(o, null, 2));
export const dlg = (page) => page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; });
export const settingsTabs = (page) => page.evaluate(() => [...document.querySelectorAll("[role=dialog] [role=tab], dialog [role=tab]")].map((t) => t.innerText.trim()));
export const controls = (page, scope = "[role=dialog], dialog") => page.evaluate((s) => [...document.querySelector(s).querySelectorAll("button,input,select,textarea,[role=checkbox],[role=switch]")].map((b) => `${b.tagName.toLowerCase()}|${b.type || ""}|${b.getAttribute("aria-label") || b.id || ""}|${(b.innerText || b.value || "").trim().slice(0, 40)}|${b.checked === true || b.getAttribute("aria-checked") === "true" ? "ON" : ""}${b.disabled ? "|disabled" : ""}`), scope);
export { say, J, bodyText };
import { execFileSync } from "node:child_process";
export function makeJpegWithExif(dir) {
  const png = path.join(dir, "base.png"), jpg0 = path.join(dir, "base.jpg"), jpg = path.join(dir, "photo.jpg");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=64x48", "-frames:v", "1", png]);
  execFileSync("sips", ["-s", "format", "jpeg", png, "--out", jpg0], { stdio: "ignore" });
  const base = readFileSync(jpg0);
  const make = Buffer.from("Canon\0"), model = Buffer.from("TestCam\0");
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
export function makeMp3(dir, secs = 2) {
  const mp3 = path.join(dir, "tone.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${secs}`, mp3]);
  return mp3;
}
export const closeDlg = async (page) => { const c = page.locator("[role=dialog] button:text-is('Close'), dialog button:text-is('Close')"); if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); } };
