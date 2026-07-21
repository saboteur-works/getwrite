/**
 * Integration tests for the media upload route.
 *
 * Calls the POST handler with real multipart requests against a temporary
 * projects directory, asserting on-disk persistence and validation
 * responses. Requests are scoped by a server-validated `projectId` (resolved
 * against `GETWRITE_PROJECTS_DIR`), per the 29-route tenant enforcement
 * feature (see `tags-api.test.ts` for the canonical pattern).
 *
 * Runs in the node environment so File/FormData/Request all come from undici;
 * jsdom's File implementation is incompatible with undici Request serialization.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/resource/upload/route";
import { generateUUID } from "../../src/lib/models/uuid";
import type { AnyResource } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-upload-"));
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

const ONE_PX_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
);

function buildWav(numSamples: number) {
  const sampleRate = 8000;
  const blockAlign = 1;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return Uint8Array.from(buffer);
}

function uploadRequest(form: FormData): Request {
  return new Request("http://localhost/api/resource/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/resource/upload (projectId-based)", () => {
  it("creates an image resource and persists the binary", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([ONE_PX_PNG], "cover.png", { type: "image/png" }),
      );
      form.append("projectId", projectId);
      form.append("title", "Cover Art");

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { resource: AnyResource };
      const resource = body.resource;

      expect(resource.type).toBe("image");
      expect(resource.name).toBe("Cover Art");
      if (resource.type === "image") {
        expect(resource.file).toBe("original.png");
        expect(resource.width).toBe(1);
        expect(resource.height).toBe(1);
      }

      const binary = await fs.readFile(
        path.join(projectPath, "resources", resource.id, "original.png"),
      );
      expect(new Uint8Array(binary)).toEqual(ONE_PX_PNG);
    });
  });

  it("derives the name from the filename when no title is given", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([ONE_PX_PNG], "mountain.png", { type: "image/png" }),
      );
      form.append("projectId", projectId);

      const res = await POST(uploadRequest(form));
      const body = (await res.json()) as { resource: AnyResource };
      expect(body.resource.name).toBe("mountain");
    });
  });

  it("creates an audio resource with duration and format", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([buildWav(8000)], "note.wav", { type: "audio/wav" }),
      );
      form.append("projectId", projectId);

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { resource: AnyResource };
      const resource = body.resource;
      expect(resource.type).toBe("audio");
      if (resource.type === "audio") {
        expect(resource.file).toBe("original.wav");
        expect(resource.format).toBe("wav");
        expect(resource.durationSeconds).toBeCloseTo(1, 1);
      }
    });
  });

  it("rejects an unsupported file type with 400", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([Uint8Array.from([0, 1, 2])], "malware.exe", {
          type: "application/octet-stream",
        }),
      );
      form.append("projectId", projectId);

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { reason?: string };
      expect(body.reason).toBe("unsupported-type");
    });
  });

  it("returns 400 when the file field is missing", async () => {
    const { projectsDir, projectId } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append("projectId", projectId);

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(400);
    });
  });

  it("returns the uniform 400 when projectId is missing", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([ONE_PX_PNG], "x.png", { type: "image/png" }),
      );

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const form = new FormData();
      form.append(
        "file",
        new File([ONE_PX_PNG], "x.png", { type: "image/png" }),
      );
      form.append("projectId", "../../etc/passwd");

      const res = await POST(uploadRequest(form));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});
