/**
 * Integration tests for the single-resource plain-text export route.
 *
 * Calls the POST handler against a temporary project directory containing real
 * content.txt files, asserting the route reads the current saved content from
 * disk (rather than any client-side snapshot).
 *
 * Runs in the node environment so Request/Response come from undici.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/export/text/route";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeProjectDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-txt-export-"));
  tmpDirs.push(dir);
  return dir;
}

async function writeResourceText(
  projectPath: string,
  id: string,
  plainText: string,
): Promise<void> {
  const dir = path.join(projectPath, "resources", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "content.txt"), plainText, "utf8");
}

function exportRequest(body: unknown): Request {
  return new Request("http://localhost/api/export/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export/text", () => {
  it("exports the resource's current on-disk content, not a stale snapshot", async () => {
    const projectPath = await makeProjectDir();
    // Simulates content that was just autosaved to disk.
    await writeResourceText(projectPath, "r1", "old line\nbrand new line");

    const res = await POST(
      exportRequest({
        projectPath,
        resourceIds: ["r1"],
        resources: [{ id: "r1", name: "My Note", type: "text" }],
        exportName: "My Note",
      }) as never,
    );
    const json = await res.json();

    expect(json.filename).toBe("my-note.txt");
    expect(json.text).toContain("brand new line");
    // Single resource: no section header.
    expect(json.text).not.toContain("My Note");
  });

  it("includes section headers when exporting multiple resources", async () => {
    const projectPath = await makeProjectDir();
    await writeResourceText(projectPath, "r1", "first body");
    await writeResourceText(projectPath, "r2", "second body");

    const res = await POST(
      exportRequest({
        projectPath,
        resourceIds: ["r1", "r2"],
        resources: [
          { id: "r1", name: "Chapter One", type: "text" },
          { id: "r2", name: "Chapter Two", type: "text" },
        ],
        exportName: "Book",
      }) as never,
    );
    const json = await res.json();

    expect(json.filename).toBe("book.txt");
    expect(json.text).toContain("Chapter One");
    expect(json.text).toContain("first body");
    expect(json.text).toContain("second body");
  });

  it("ignores non-text resources in the selection", async () => {
    const projectPath = await makeProjectDir();
    await writeResourceText(projectPath, "r1", "keep this");

    const res = await POST(
      exportRequest({
        projectPath,
        resourceIds: ["r1", "img"],
        resources: [
          { id: "r1", name: "Text", type: "text" },
          { id: "img", name: "Picture", type: "image" },
        ],
        exportName: "Text",
      }) as never,
    );
    const json = await res.json();

    expect(json.text).toContain("keep this");
    expect(json.filename).toBe("text.txt");
  });
});
