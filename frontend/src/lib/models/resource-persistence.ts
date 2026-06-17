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
 * Reads the `id` from a `folder.json` at `dir`, or `null` if the descriptor is
 * absent or unreadable. Used to detect slug collisions before overwriting.
 */
function readFolderDescriptorId(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "folder.json"), "utf8");
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the on-disk directory for a folder, guarding against slug
 * collisions. Folders are stored at `folders/<slug>/`, but two distinct folders
 * can slugify to the same value (e.g. an "Episode 1" recreated after a previous
 * "Episode 1" was renamed in place). Writing both to the same directory would
 * silently overwrite the first descriptor and orphan its children.
 *
 * Resolution is deterministic so re-saving the same folder always lands on its
 * own directory:
 * - If `folders/<slug>/` is free or already holds *this* folder, use it.
 * - Otherwise fall back to `folders/<slug>-<id-prefix>/`, and finally to
 *   `folders/<slug>-<full-id>/` in the astronomically unlikely event the
 *   prefixed directory is itself taken by a different folder.
 */
function resolveFolderDir(projectPath: string, folder: Folder): string {
  const foldersRoot = path.join(projectPath, "folders");
  const slug = folder.slug ?? folder.id;

  const preferred = path.join(foldersRoot, slug);
  const preferredOwner = readFolderDescriptorId(preferred);
  if (preferredOwner === null || preferredOwner === folder.id) {
    return preferred;
  }

  const prefixed = path.join(foldersRoot, `${slug}-${folder.id.slice(0, 8)}`);
  const prefixedOwner = readFolderDescriptorId(prefixed);
  if (prefixedOwner === null || prefixedOwner === folder.id) {
    return prefixed;
  }

  return path.join(foldersRoot, `${slug}-${folder.id}`);
}

/**
 * Type guard for text resources.
 */
function isTextResource(resource: AnyResource): resource is TextResource {
  return resource.type === "text";
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
  if (isFolderResource(resource)) {
    const dir = resolveFolderDir(projectPath, resource);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dir, "folder.json"),
      JSON.stringify(resource, null, 2),
      "utf8",
    );
    return resource;
  }

  const base = path.join(projectPath, "resources", resource.id);

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

  return resources.map((r) => {
    if (r.type !== "text" || (r as TextResource).wordCount !== undefined) {
      return r;
    }
    const contentPath = path.join(
      projectPath,
      "resources",
      r.id,
      "content.txt",
    );
    if (!fs.existsSync(contentPath)) return r;
    const plain = fs.readFileSync(contentPath, "utf-8");
    return { ...r, wordCount: countWords(plain) } as TextResource;
  });
};

/**
 * Reads short text excerpts for the given resources straight from their
 * `content.txt`. Intended for a bounded, on-demand set (e.g. the cards visible
 * in one Organizer folder) — not the whole project — so it stays off the hot
 * load path.
 *
 * Each excerpt is capped to `maxChars + 1` characters: the extra character lets
 * the caller's truncation add a trailing ellipsis when the source was longer.
 * Resources with no `content.txt` (folders, media) or empty content are omitted.
 *
 * @param projectPath - Absolute project root directory.
 * @param resourceIds - Resource ids to read excerpts for.
 * @param maxChars - Maximum excerpt length to read (defaults to 200).
 * @returns A map of resource id → excerpt for the resources that had content.
 */
export const readResourceExcerpts = (
  projectPath: string,
  resourceIds: readonly string[],
  maxChars = 200,
): Record<string, string> => {
  const cap = maxChars > 0 ? maxChars : 200;
  // Read only a bounded prefix — enough bytes to cover `cap + 1` UTF-8 chars
  // (max 4 bytes/char) — so a multi-MB content.txt is never loaded in full.
  const maxBytes = (cap + 1) * 4;
  const excerpts: Record<string, string> = {};
  for (const id of resourceIds) {
    const contentPath = path.join(projectPath, "resources", id, "content.txt");
    let fd: number;
    try {
      fd = fs.openSync(contentPath, "r");
    } catch {
      continue; // no content.txt (folder/media) or unreadable
    }
    try {
      const buf = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
      // Trim before capping so the `cap + 1` "was-truncated" signal reflects
      // real content (the caller adds an ellipsis when the excerpt exceeds the
      // cap); leading whitespace must not eat into that one-char headroom.
      const text = buf.toString("utf-8", 0, bytesRead).trim();
      if (text === "") continue;
      excerpts[id] = text.slice(0, cap + 1);
    } finally {
      fs.closeSync(fd);
    }
  }
  return excerpts;
};
