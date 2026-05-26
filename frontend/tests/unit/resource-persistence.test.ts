import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createAudioResource,
  createFolderResource,
  createImageResource,
  createTextResource,
  getLocalResources,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const folderId = "11111111-1111-4111-8111-111111111111";

describe("models/resource persistence regressions (T007)", () => {
  it("returns an empty collection when no meta directory exists", () => {
    const missingProjectRoot = path.join(
      os.tmpdir(),
      "getwrite-missing-meta-root",
    );

    expect(getLocalResources(missingProjectRoot)).toEqual([]);
  });

  it("writes text resource content and sidecar userMetadata without changing identity", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-resource-persist-"),
    );

    try {
      const resource = createTextResource({
        name: "Persisted Scene",
        folderId,
        plainText: "Draft body",
        tiptap: { type: "doc", content: [{ type: "paragraph" }] },
        userMetadata: { section: "intro" },
      });

      const written = await writeResourceToFile(projectRoot, resource);
      expect(written).toBe(resource);

      const plainTextPath = path.join(
        projectRoot,
        "resources",
        resource.id,
        "content.txt",
      );
      const tiptapPath = path.join(
        projectRoot,
        "resources",
        resource.id,
        "content.tiptap.json",
      );

      await expect(fs.readFile(plainTextPath, "utf8")).resolves.toBe(
        "Draft body",
      );
      await expect(fs.readFile(tiptapPath, "utf8")).resolves.toContain(
        '"type": "doc"',
      );

      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar).toMatchObject({
        id: resource.id,
        name: "Persisted Scene",
        type: "text",
        folderId,
        slug: "persisted-scene",
      });

      const localResources = getLocalResources(projectRoot);
      expect(localResources).toHaveLength(1);
      expect(localResources[0]).toMatchObject({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        folderId,
      });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("ignores ancillary meta files like backlinks.json", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-meta-filter-"),
    );

    try {
      const resource = createTextResource({
        name: "Real Resource",
        plainText: "content",
      });
      await writeResourceToFile(projectRoot, resource);

      // Drop non-sidecar files into meta/ — the loader must skip these
      // rather than feeding them through Zod validation, which would
      // throw because they lack the AnyResource shape.
      const metaDir = path.join(projectRoot, "meta");
      await fs.writeFile(
        path.join(metaDir, "backlinks.json"),
        JSON.stringify({ "some-id": ["other-id"] }),
        "utf8",
      );
      await fs.writeFile(
        path.join(metaDir, "redirects.json"),
        JSON.stringify({ alias: "target" }),
        "utf8",
      );

      const localResources = getLocalResources(projectRoot);
      expect(localResources).toHaveLength(1);
      expect(localResources[0].id).toBe(resource.id);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("persists folder resources under the folders directory using the slug path", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-folder-persist-"),
    );

    try {
      const folder = createFolderResource({
        name: "Reference Folder",
        special: true,
        metadataSource: {
          isMetadataSource: true,
          metadataInputType: "multiselect",
        },
      });

      await writeResourceToFile(projectRoot, folder);
      await new Promise((resolve) => setTimeout(resolve, 25));

      const folderRecordPath = path.join(
        projectRoot,
        "folders",
        folder.slug ?? folder.id,
        "folder.json",
      );
      const folderRecord = JSON.parse(
        await fs.readFile(folderRecordPath, "utf8"),
      ) as { id: string; name: string; type: string; special?: boolean };

      expect(folderRecord).toMatchObject({
        id: folder.id,
        name: "Reference Folder",
        type: "folder",
        special: true,
        metadataSource: {
          isMetadataSource: true,
          metadataInputType: "multiselect",
        },
      });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("writes image binary to original.<ext> and records media metadata on the sidecar", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-image-persist-"),
    );

    try {
      const resource = createImageResource({
        name: "Cover Art",
        folderId,
        file: "original.png",
        width: 640,
        height: 480,
        exif: { Make: "Canon" },
      });
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      const written = await writeResourceToFile(projectRoot, resource, {
        binary: bytes,
      });
      expect(written).toBe(resource);

      const binaryPath = path.join(
        projectRoot,
        "resources",
        resource.id,
        "original.png",
      );
      const stored = await fs.readFile(binaryPath);
      expect(new Uint8Array(stored)).toEqual(bytes);

      // No text content files are written for media resources.
      await expect(
        fs.readFile(
          path.join(projectRoot, "resources", resource.id, "content.txt"),
        ),
      ).rejects.toThrow();

      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar).toMatchObject({
        id: resource.id,
        type: "image",
        file: "original.png",
        width: 640,
        height: 480,
        exif: { Make: "Canon" },
      });

      const localResources = getLocalResources(projectRoot);
      expect(localResources).toHaveLength(1);
      expect(localResources[0]).toMatchObject({
        id: resource.id,
        type: "image",
        file: "original.png",
      });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("writes audio binary and records duration/format on the sidecar", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-audio-persist-"),
    );

    try {
      const resource = createAudioResource({
        name: "Voice Note",
        file: "original.mp3",
        durationSeconds: 12.5,
        format: "mp3",
      });
      const bytes = new Uint8Array([73, 68, 51, 4]);

      await writeResourceToFile(projectRoot, resource, { binary: bytes });

      const binaryPath = path.join(
        projectRoot,
        "resources",
        resource.id,
        "original.mp3",
      );
      const stored = await fs.readFile(binaryPath);
      expect(new Uint8Array(stored)).toEqual(bytes);

      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar).toMatchObject({
        id: resource.id,
        type: "audio",
        file: "original.mp3",
        durationSeconds: 12.5,
        format: "mp3",
      });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("leaves the stored binary untouched on a metadata-only re-save", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-media-resave-"),
    );

    try {
      const resource = createImageResource({
        name: "Sketch",
        file: "original.webp",
        width: 100,
        height: 100,
      });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      await writeResourceToFile(projectRoot, resource, { binary: bytes });

      // Re-save without binary (e.g. a metadata update) must not erase the file.
      await writeResourceToFile(projectRoot, resource);

      const stored = await fs.readFile(
        path.join(projectRoot, "resources", resource.id, "original.webp"),
      );
      expect(new Uint8Array(stored)).toEqual(bytes);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("throws when binary is supplied for a media resource without a file name", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-media-nofile-"),
    );

    try {
      const resource = createImageResource({ name: "No File" });
      await expect(
        writeResourceToFile(projectRoot, resource, {
          binary: new Uint8Array([0]),
        }),
      ).rejects.toThrow(/missing 'file' name/);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
