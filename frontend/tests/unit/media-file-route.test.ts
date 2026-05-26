import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../../app/api/resource/[resource-id]/file/route";
import {
  createImageResource,
  createAudioResource,
} from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";

const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
);

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeProjectDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-file-route-"));
  tmpDirs.push(dir);
  return dir;
}

function makeGetRequest(resourceId: string, projectPath: string): NextRequest {
  const url = new URL(
    `http://localhost/api/resource/${resourceId}/file?projectPath=${encodeURIComponent(projectPath)}`,
  );
  return new NextRequest(url.toString());
}

describe("GET /api/resource/[id]/file", () => {
  it("returns the binary with the correct Content-Type for a PNG image", async () => {
    const projectPath = await makeProjectDir();
    const resource = createImageResource({ name: "Art", file: "original.png" });
    await writeResourceToFile(projectPath, resource, { binary: PNG_BYTES });

    const res = await GET(makeGetRequest(resource.id, projectPath), {
      params: Promise.resolve({ "resource-id": resource.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = await res.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(PNG_BYTES);
  });

  it("returns the correct Content-Type for an mp3 audio resource", async () => {
    const projectPath = await makeProjectDir();
    const fakeAudio = Uint8Array.from([73, 68, 51, 4]);
    const resource = createAudioResource({
      name: "Note",
      file: "original.mp3",
      format: "mp3",
    });
    await writeResourceToFile(projectPath, resource, { binary: fakeAudio });

    const res = await GET(makeGetRequest(resource.id, projectPath), {
      params: Promise.resolve({ "resource-id": resource.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 404 when the resource has no stored file", async () => {
    const projectPath = await makeProjectDir();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, {
      id: resourceId,
      name: "No File",
      type: "image",
    });

    const res = await GET(makeGetRequest(resourceId, projectPath), {
      params: Promise.resolve({ "resource-id": resourceId }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the binary is missing from disk", async () => {
    const projectPath = await makeProjectDir();
    const resourceId = generateUUID();
    await writeSidecar(projectPath, resourceId, {
      id: resourceId,
      name: "Ghost",
      type: "image",
      file: "original.png",
    });

    const res = await GET(makeGetRequest(resourceId, projectPath), {
      params: Promise.resolve({ "resource-id": resourceId }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when projectPath is missing", async () => {
    const req = new NextRequest("http://localhost/api/resource/some-id/file");
    const res = await GET(req, {
      params: Promise.resolve({ "resource-id": "some-id" }),
    });
    expect(res.status).toBe(400);
  });
});
