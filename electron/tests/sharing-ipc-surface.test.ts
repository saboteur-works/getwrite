/** The preload bridge exposes only the four new sharing channels (Feature 75, Task 19). */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const preload = fs.readFileSync(
  path.resolve(__dirname, "../src/preload.ts"),
  "utf8",
);
const main = fs.readFileSync(path.resolve(__dirname, "../src/main.ts"), "utf8");

const EXISTING = [
  "getwrite:workspace-dir",
  "getwrite:choose-workspace-dir",
  "getwrite:restart",
  "getwrite:scrivener-choose-source",
  "getwrite:scrivener-start-import",
  "getwrite:docx-choose-file",
  "getwrite:docx-choose-folder",
  "getwrite:docx-start-import",
  "getwrite:global-noise-words-get",
  "getwrite:global-noise-words-set",
];
const NEW = [
  "getwrite:sharing-get-status",
  "getwrite:sharing-set-enabled",
  "getwrite:sharing-generate-code",
  "getwrite:sharing-get-code",
];
const DEVICE = [
  "getwrite:sharing-list-devices",
  "getwrite:sharing-rename-device",
  "getwrite:sharing-revoke-device",
];
const deviceIpc = fs.readFileSync(
  path.resolve(__dirname, "../src/sharing/device-ipc.ts"),
  "utf8",
);

function invokedChannels(source: string): string[] {
  return [...source.matchAll(/ipcRenderer\.invoke\(\s*"([^"]+)"/g)].map(
    (m) => m[1],
  );
}

describe("preload sharing surface", () => {
  it("invokes exactly the existing channels plus the four sharing ones and the three device ones", () => {
    expect(invokedChannels(preload).sort()).toEqual(
      [...EXISTING, ...NEW, ...DEVICE].sort(),
    );
  });

  it("never invokes a non-literal channel (no passthrough)", () => {
    const total = [...preload.matchAll(/ipcRenderer\.invoke\(/g)].length;
    expect(total).toBe(invokedChannels(preload).length);
  });

  it("main registers a handler for each new channel", () => {
    for (const channel of NEW) {
      expect(main).toContain(`"${channel}"`);
    }
  });

  it("main does not log the pairing code or window secret in the sharing handlers", () => {
    const start = main.indexOf("function registerSharingHandlers");
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf("\n}\n", start));
    expect(body).not.toMatch(/log\([^)]*(code|secret)/i);
  });

  it("main registers each device channel in an ipcMain.handle call routed through createDeviceHandlers", () => {
    for (const channel of DEVICE) {
      const at = main.indexOf(`ipcMain.handle(\n    "${channel}"`);
      const inline = main.indexOf(`ipcMain.handle("${channel}"`);
      const start = at >= 0 ? at : inline;
      expect(start, channel).toBeGreaterThan(-1);
      const call = main.slice(start, main.indexOf(");", start) + 2);
      expect(call, channel).toMatch(/devices\.(list|rename|revoke)/);
    }
    expect(main).toContain("createDeviceHandlers(");
  });

  it("device-ipc handlers each start with the sender check", () => {
    for (const name of ["list", "rename", "revoke"]) {
      const m = new RegExp(`async ${name}\\([^)]*\\)[^{]*\\{\\s*([^;]*;)`).exec(
        deviceIpc,
      );
      expect(m, name).not.toBeNull();
      expect(m![1].trim()).toMatch(/^assertTrusted\(event\);$/);
    }
  });

  it("the sharing handlers log only counts and outcome kinds through interpolation", () => {
    const start = main.indexOf("function registerSharingHandlers");
    const body = main.slice(start, main.indexOf("\n}\n", start));
    for (const call of body.match(/log\([^;]*\);/g) ?? []) {
      for (const m of call.matchAll(/\$\{([^}]*)\}/g)) {
        expect(m[1]).toMatch(
          /^(enabled \? "on" : "off"|result\.kind|result\.devices\.length)$/,
        );
      }
      expect(call).not.toMatch(/\b(token|hash|secret)\b/i);
    }
  });
});
