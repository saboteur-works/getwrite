/**
 * @module resource-persistence
 *
 * Resource local persistence and metadata loading helpers.
 *
 * This module is responsible for:
 * - Persisting resource payloads/metadata to local filesystem storage.
 * - Loading resource metadata from local sidecar/meta files.
 */
import fs from "node:fs";
import path from "node:path";

import { validateResource } from "./resource-factory";
import { countWords } from "../word-count";
import { writeSidecar } from "./sidecar";
import type {
  AnyResource,
  AudioResource,
  Folder,
  ImageResource,
  MetadataValue,
  TextResource,
} from "./types";

/**
 * Type guard for folder resources.
 */
function isFolderResource(resource: AnyResource): resource is Folder {
  return resource.type === "folder";
}

/**
 * Type guard for text resources.
 */
function isTextResource(resource: AnyResource): resource is TextResource {
  return resource.type === "text" && !isFolderResource(resource);
}

/**
 * Type guard for media (image/audio) resources backed by a binary file.
 */
function isMediaResource(
  resource: AnyResource,
): resource is ImageResource | AudioResource {
  return resource.type === "image" || resource.type === "audio";
}

/** Optional inputs for persisting a resource. */
export interface WriteResourceOptions {
  /** Raw bytes for image/audio resources, written to `<resource>/<file>`. */
  binary?: Uint8Array;
}

/**
 * Persists a resource to local filesystem storage.
 *
 * For image/audio resources, pass `options.binary` to write the uploaded bytes
 * to `resources/<id>/<resource.file>`. The binary is only written when both the
 * bytes and `resource.file` are present, so metadata-only re-saves leave the
 * stored file untouched.
 */
export async function writeResourceToFile(
  projectPath: string,
  resource: AnyResource,
  options?: WriteResourceOptions,
): Promise<AnyResource> {
  const base = path.join(
    projectPath,
    resource.type === "folder" ? "folders" : "resources",
    resource.id,
  );

  if (isFolderResource(resource)) {
    const dir = path.join(projectPath, "folders", resource.slug ?? resource.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.writeFile(
      path.join(dir, "folder.json"),
      JSON.stringify(resource, null, 2),
      "utf8",
      () => {},
    );
    return resource;
  }

  if (isTextResource(resource)) {
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }

    const tiptapPath = `${base}/content.tiptap.json`;
    const plainPath = `${base}/content.txt`;
    fs.writeFileSync(
      tiptapPath,
      JSON.stringify(resource.tiptap ?? {}, null, 2),
      "utf8",
    );
    fs.writeFileSync(plainPath, resource.plainText ?? "", "utf8");
  }

  if (isMediaResource(resource)) {
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }

    if (options?.binary !== undefined) {
      if (!resource.file) {
        throw new Error(
          `Cannot persist binary for media resource ${resource.id}: missing 'file' name`,
        );
      }
      fs.writeFileSync(path.join(base, resource.file), options.binary);
    }
  }

  const sidecarData: Record<string, MetadataValue> = {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    createdAt: resource.createdAt,
    orderIndex: resource.orderIndex,
    folderId: resource.folderId || null,
    slug: resource.slug || null,
    userMetadata: resource.userMetadata || {},
  };

  if (isTextResource(resource) && resource.wordCount !== undefined) {
    sidecarData.wordCount = resource.wordCount;
  }

  if (isMediaResource(resource)) {
    if (resource.file !== undefined) sidecarData.file = resource.file;
    if (resource.type === "image") {
      if (resource.width !== undefined) sidecarData.width = resource.width;
      if (resource.height !== undefined) sidecarData.height = resource.height;
      if (resource.exif !== undefined) sidecarData.exif = resource.exif;
    } else {
      if (resource.durationSeconds !== undefined) {
        sidecarData.durationSeconds = resource.durationSeconds;
      }
      if (resource.format !== undefined) sidecarData.format = resource.format;
    }
  }

  await writeSidecar(projectPath, resource.id, sidecarData);
  return resource;
}

/**
 * Loads locally stored resources from `<projectPath>/meta/*.json`.
 */
export const getLocalResources = (projectPath: string): AnyResource[] => {
  const metaDir = path.join(projectPath, "meta");
  if (!fs.existsSync(metaDir)) {
    return [];
  }

  const metaFiles = fs.readdirSync(metaDir).sort();
  const resources: AnyResource[] = [];
  for (const metaFile of metaFiles) {
    // Only resource sidecars match this pattern; skip ancillary meta files
    // like backlinks.json, redirects.json, or the index/ subdirectory.
    if (!metaFile.startsWith("resource-") || !metaFile.endsWith(".meta.json")) {
      continue;
    }
    const metaPath = path.join(metaDir, metaFile);
    const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    resources.push(validateResource(metaData));
  }

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    if (r.type === "text" && (r as TextResource).wordCount === undefined) {
      const contentPath = path.join(
        projectPath,
        "resources",
        r.id,
        "content.txt",
      );
      if (fs.existsSync(contentPath)) {
        const plain = fs.readFileSync(contentPath, "utf-8");
        const wordCount = countWords(plain);
        resources[i] = { ...r, wordCount } as TextResource;
      }
    }
  }

  return resources;
};
