// Last Updated: 2026-03-11

/**
 * @module memoryAdapter
 *
 * In-memory implementation of the {@link StorageAdapter} contract.
 *
 * This adapter simulates a minimal filesystem tree using nested `Map`
 * structures and is primarily intended for tests where deterministic,
 * side-effect-free I/O is required.
 *
 * Supported behavior mirrors the subset of Node filesystem operations used by
 * the models layer:
 * - Directory creation
 * - File read/write
 * - Directory listing (`readdir` with Dirent-like entries)
 * - Basic stat checks (`isDirectory`)
 * - Remove and rename/move
 */
import path from "node:path";
import type { StorageAdapter } from "./io";
import type { Dirent, Stats } from "node:fs";

/**
 * Internal node representation for the in-memory filesystem tree.
 */
type DirNode = { type: "dir"; children: Map<string, Node> };
type FileNode = { type: "file"; data: string | Buffer };
type Node =
  /** Directory node containing named child entries. */
  | DirNode
  /** File node storing raw payload as text or binary. */
  | FileNode;

/**
 * Normalizes a path into POSIX segments.
 *
 * Leading slashes are stripped so all paths are treated relative to the
 * in-memory root node.
 *
 * @param p - Input path string.
 * @returns Array of path segments, or `[]` for root.
 */
function splitPath(p: string) {
  const normalized = path.posix.normalize(p).replace(/^\/+/, "");
  return normalized === "" ? [] : normalized.split("/");
}

/**
 * Copies a file node's payload, cloning `Buffer` data so the copy and original
 * do not alias the same bytes. Strings are immutable and returned as-is.
 *
 * @param data - Source payload.
 * @returns An independent copy of the payload.
 */
function cloneData(data: string | Buffer): string | Buffer {
  return Buffer.isBuffer(data) ? Buffer.from(data) : data;
}

/**
 * Deep-clones an in-memory {@link Node} tree so a copied subtree shares no
 * mutable state with its source.
 *
 * @param node - Node to clone.
 * @returns A structurally independent clone.
 */
function cloneNode(node: Node): Node {
  if (node.type === "file") return { type: "file", data: cloneData(node.data) };
  const children = new Map<string, Node>();
  for (const [name, child] of node.children.entries()) {
    children.set(name, cloneNode(child));
  }
  return { type: "dir", children };
}

/**
 * Concatenates appended data onto existing file payload, promoting to `Buffer`
 * when either side is binary so bytes are preserved.
 *
 * @param existing - Current file payload.
 * @param addition - Data being appended.
 * @returns The combined payload.
 */
function concatData(
  existing: string | Buffer,
  addition: string | Buffer,
): string | Buffer {
  if (Buffer.isBuffer(existing) || Buffer.isBuffer(addition)) {
    return Buffer.concat([toBuffer(existing), toBuffer(addition)]);
  }
  return existing + addition;
}

/** Coerces a string/Buffer payload to a `Buffer` (utf8 for strings). */
function toBuffer(data: string | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
}

/**
 * Creates a new in-memory {@link StorageAdapter} instance.
 *
 * Each call returns an isolated filesystem tree rooted at `/`.
 *
 * @returns Storage adapter backed by in-memory `Map` structures.
 *
 * @example
 * ```ts
 * const adapter = createMemoryAdapter();
 * await adapter.mkdir("project/meta", { recursive: true });
 * await adapter.writeFile("project/meta/file.txt", "hello");
 * const text = await adapter.readFile("project/meta/file.txt");
 * ```
 */
export function createMemoryAdapter(): StorageAdapter {
  /** Root directory node for this adapter instance. */
  const root: DirNode = { type: "dir", children: new Map() };

  /**
   * Ensures every directory segment in `p` exists.
   *
   * Missing directories are created eagerly. If an intermediate segment is a
   * file node, throws `ENOTDIR`.
   *
   * @param p - Directory path to create/ensure.
   * @throws {Error} `ENOTDIR` when traversing through a file node.
   */
  function mkdirSync(p: string) {
    const parts = splitPath(p);
    let cur: DirNode = root;
    for (const part of parts) {
      let child: Node | undefined = cur.children.get(part);
      if (!child) {
        child = { type: "dir", children: new Map() };
        cur.children.set(part, child);
      }
      if (child.type !== "dir") throw new Error("ENOTDIR");
      cur = child;
    }
  }

  /**
   * Resolves the parent directory node and basename for `p`.
   *
   * @param p - Target file/directory path.
   * @returns Parent directory and leaf name when resolvable, otherwise `null`.
   */
  function resolveParent(p: string): { parent: DirNode; name: string } | null {
    const parts = splitPath(p);
    const name = parts.pop();
    if (!name) return null;
    let cur: DirNode = root;
    for (const part of parts) {
      const child: Node | undefined = cur.children.get(part);
      if (!child || child.type !== "dir") return null;
      cur = child;
    }
    return { parent: cur, name };
  }

  /**
   * Resolves a full path to its {@link Node}, or `undefined` when any segment
   * is missing or traverses through a file.
   *
   * @param p - Path to resolve.
   * @returns The node at `p`, or `undefined`.
   */
  function resolveNode(p: string): Node | undefined {
    const parts = splitPath(p);
    let cur: Node = root;
    for (const part of parts) {
      if (cur.type !== "dir") return undefined;
      const child = cur.children.get(part);
      if (!child) return undefined;
      cur = child;
    }
    return cur;
  }

  return {
    /** @inheritdoc */
    mkdir: async (p: string, _opts?: { recursive?: boolean }) => {
      mkdirSync(p);
    },
    /** @inheritdoc */
    writeFile: async (p: string, data: string | Buffer) => {
      const res = resolveParent(p);
      if (!res) throw new Error("ENOENT");
      const { parent, name } = res;
      if (parent.type !== "dir") throw new Error("ENOTDIR");
      parent.children.set(name, { type: "file", data });
    },
    /** @inheritdoc */
    readFile: async (p: string) => {
      const parts = splitPath(p);
      let cur: Node = root;
      for (const part of parts) {
        const child: Node | undefined =
          cur.type === "dir" ? cur.children.get(part) : undefined;
        if (!child)
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        cur = child;
      }
      if (cur.type !== "file")
        throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });
      return cur.data.toString();
    },
    /** @inheritdoc */
    readFileBuffer: async (p: string) => {
      const node = resolveNode(p);
      if (!node) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (node.type !== "file")
        throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });
      return toBuffer(node.data);
    },
    /** @inheritdoc */
    readdir: async (p: string, opts?: { withFileTypes?: boolean }) => {
      const parts = splitPath(p);
      let cur: Node = root;
      for (const part of parts) {
        const child: Node | undefined =
          cur.type === "dir" ? cur.children.get(part) : undefined;
        if (!child)
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        cur = child;
      }
      if (cur.type !== "dir")
        throw Object.assign(new Error("ENOTDIR"), { code: "ENOTDIR" });
      // Mirror `fs.readdir`: bare names by default, Dirent-like entries only
      // when `withFileTypes` is requested.
      if (!opts?.withFileTypes) {
        return [...cur.children.keys()];
      }
      const entries: Dirent[] = [] as unknown as Dirent[];
      for (const [name, node] of cur.children.entries()) {
        // Minimal Dirent-like object used by tests and adapters
        entries.push({
          name,
          isDirectory: () => node.type === "dir",
        } as unknown as Dirent);
      }
      return entries;
    },
    /** @inheritdoc */
    stat: async (p: string) => {
      const parts = splitPath(p);
      let cur: Node = root;
      if (parts.length === 0)
        return { isDirectory: () => true } as unknown as Stats;
      for (const part of parts) {
        const child: Node | undefined =
          cur.type === "dir" ? cur.children.get(part) : undefined;
        if (!child)
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        cur = child;
      }
      return { isDirectory: () => cur.type === "dir" } as unknown as Stats;
    },
    /** @inheritdoc */
    rm: async (p: string, _opts?: { recursive?: boolean; force?: boolean }) => {
      const res = resolveParent(p);
      if (!res) return;
      const { parent, name } = res;
      if (parent.type !== "dir") return;
      parent.children.delete(name);
    },
    /** @inheritdoc */
    rename: async (oldPath: string, newPath: string) => {
      const oldRes = resolveParent(oldPath);
      // Ensure new parent dirs exist before resolving destination parent.
      mkdirSync(path.posix.dirname(newPath));
      const newRes = resolveParent(newPath);
      if (!oldRes || !newRes) throw new Error("ENOENT");
      const { parent: oldParent, name: oldName } = oldRes;
      const node = oldParent.children.get(oldName);
      if (!node) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const { parent: newParent, name: newName } = newRes;
      newParent.children.set(newName, node);
      oldParent.children.delete(oldName);
    },
    /** @inheritdoc */
    copyFile: async (src: string, dst: string) => {
      const node = resolveNode(src);
      if (!node || node.type !== "file")
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const res = resolveParent(dst);
      if (!res) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      res.parent.children.set(res.name, {
        type: "file",
        data: cloneData(node.data),
      });
    },
    /** @inheritdoc */
    cp: async (src: string, dst: string, _opts?: { recursive?: boolean }) => {
      const node = resolveNode(src);
      if (!node) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      mkdirSync(path.posix.dirname(dst));
      const res = resolveParent(dst);
      if (!res) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      res.parent.children.set(res.name, cloneNode(node));
    },
    /** @inheritdoc */
    appendFile: async (p: string, data: string | Buffer) => {
      const res = resolveParent(p);
      if (!res) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const existing = res.parent.children.get(res.name);
      if (existing && existing.type === "file") {
        existing.data = concatData(existing.data, data);
      } else {
        res.parent.children.set(res.name, { type: "file", data });
      }
    },
    /** @inheritdoc */
    fsyncFile: async () => {
      // In-memory adapter has no on-disk state to flush; durability is
      // a no-op so atomicWriteFile(durable: true) is safe in tests.
    },
  };
}

export default { createMemoryAdapter };
