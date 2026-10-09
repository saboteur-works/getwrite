/** Credential-store status (Feature 75, FR-27); contract with the shared fixtures. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  CREDENTIALS_FILE_NAME,
  readCredentialStoreStatus,
} from "../src/sharing/store-status";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-store-status-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function install(fixture: string): void {
  fs.copyFileSync(
    path.join(FIXTURES, fixture),
    path.join(dir, CREDENTIALS_FILE_NAME),
  );
}

describe("readCredentialStoreStatus", () => {
  it("is missing when there is no file", () => {
    expect(readCredentialStoreStatus(dir)).toBe("missing");
  });

  it("is ok for the valid fixture", () => {
    install("device-credentials.valid.json");
    expect(readCredentialStoreStatus(dir)).toBe("ok");
  });

  it("is corrupt for the corrupt fixture", () => {
    install("device-credentials.corrupt.json");
    expect(readCredentialStoreStatus(dir)).toBe("corrupt");
  });

  it("is corrupt when the path cannot be read as a file", () => {
    fs.mkdirSync(path.join(dir, CREDENTIALS_FILE_NAME));
    expect(readCredentialStoreStatus(dir)).toBe("corrupt");
  });

  it("is corrupt for well-formed JSON of the wrong shape", () => {
    const write = (value: unknown): void =>
      fs.writeFileSync(
        path.join(dir, CREDENTIALS_FILE_NAME),
        JSON.stringify(value),
      );
    write({ version: 2, devices: [] });
    expect(readCredentialStoreStatus(dir)).toBe("corrupt");
    write({ version: 1, devices: [{ id: "a" }] });
    expect(readCredentialStoreStatus(dir)).toBe("corrupt");
    write([]);
    expect(readCredentialStoreStatus(dir)).toBe("corrupt");
  });

  it("is ok for an empty device list", () => {
    fs.writeFileSync(
      path.join(dir, CREDENTIALS_FILE_NAME),
      JSON.stringify({ version: 1, devices: [] }),
    );
    expect(readCredentialStoreStatus(dir)).toBe("ok");
  });
});
