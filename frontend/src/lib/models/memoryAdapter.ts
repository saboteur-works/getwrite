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
    function resolveParent(p: string) {
        const parts = splitPath(p);
        const name = parts.pop();
        let cur: DirNode = root;
        for (const part of parts) {
            const child: Node | undefined = cur.children.get(part);
            if (!child || child.type !== "dir") return null;
            cur = child;
        }
        return { parent: cur, name } as {
            parent: DirNode;
            name?: string;
        } | null;
    }

    return {
        /** @inheritdoc */
        mkdir: async (p: string, opts?: { recursive?: boolean }) => {
            mkdirSync(p);
        },
        /** @inheritdoc */
        writeFile: async (p: string, data: string | Buffer) => {
            const res = resolveParent(p);
            if (!res || !res.name) throw new Error("ENOENT");
            const { parent, name } = res;
            if (parent.type !== "dir") throw new Error("ENOTDIR");
            parent.children.set(name!, { type: "file", data });
        },
        /** @inheritdoc */
        readFile: async (p: string) => {
            const parts = splitPath(p);
            let cur: Node = root;
            for (const part of parts) {
                const child: Node | undefined =
                    cur.type === "dir" ? cur.children.get(part) : undefined;
                if (!child)
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                cur = child;
            }
            if (cur.type !== "file")
                throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });
            return cur.data.toString();
        },
        /** @inheritdoc */
        readdir: async (p: string, opts?: { withFileTypes?: boolean }) => {
            const parts = splitPath(p);
            let cur: Node = root;
            for (const part of parts) {
                const child: Node | undefined =
                    cur.type === "dir" ? cur.children.get(part) : undefined;
                if (!child)
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                cur = child;
            }
            if (cur.type !== "dir")
                throw Object.assign(new Error("ENOTDIR"), { code: "ENOTDIR" });
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
            if (parts.length === 0) return { isDirectory: () => true } as any;
            for (const part of parts) {
                const child: Node | undefined =
                    cur.type === "dir" ? cur.children.get(part) : undefined;
                if (!child)
                    throw Object.assign(new Error("ENOENT"), {
                        code: "ENOENT",
                    });
                cur = child;
            }
            return {
                isDirectory: () => cur.type === "dir",
            } as unknown as Stats;
        },
        /** @inheritdoc */
        rm: async (
            p: string,
            opts?: { recursive?: boolean; force?: boolean },
        ) => {
            const res = resolveParent(p);
            if (!res || !res.name) return;
            const { parent, name } = res;
            if (parent.type !== "dir") return;
            parent.children.delete(name!);
        },
        /** @inheritdoc */
        rename: async (oldPath: string, newPath: string) => {
            const oldRes = resolveParent(oldPath);
            // Ensure new parent dirs exist before resolving destination parent.
            mkdirSync(path.posix.dirname(newPath));
            const newRes = resolveParent(newPath);
            if (!oldRes || !oldRes.name || !newRes || !newRes.name)
                throw new Error("ENOENT");
            const { parent: oldParent, name: oldName } = oldRes;
            const node = oldParent.children.get(oldName!);
            if (!node)
                throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            const { parent: newParent, name: newName } = newRes;
            newParent.children.set(newName!, node);
            oldParent.children.delete(oldName!);
        },
    };
}

export default { createMemoryAdapter };
