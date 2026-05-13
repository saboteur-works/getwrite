import fs from "node:fs/promises";
import path from "node:path";

/**
 * Recursively reads folder descriptors from a `folders/` directory tree.
 *
 * For each immediate child directory it attempts to read `folder.json`; on
 * failure (missing file, parse error) it silently continues so orphan
 * directories never cause a 500.  Recursion then descends into each
 * subdirectory regardless of whether a descriptor was found.
 */
export async function readFolderTree(dir: string): Promise<unknown[]> {
    const result: unknown[] = [];
    let names: string[];
    try {
        names = (await fs.readdir(dir)).filter((n) => n !== ".DS_Store");
    } catch {
        return result;
    }
    for (const name of names) {
        const subDir = path.join(dir, name);
        try {
            const stat = await fs.stat(subDir);
            if (!stat.isDirectory()) continue;
        } catch {
            continue;
        }
        try {
            const data = await fs.readFile(
                path.join(subDir, "folder.json"),
                "utf-8",
            );
            result.push(JSON.parse(data));
        } catch {
            // no folder.json — skip descriptor, still recurse
        }
        result.push(...(await readFolderTree(subDir)));
    }
    return result;
}

/**
 * Finds a folder by id in the `folders/` directory tree, updates its `name`,
 * and writes the change back to `folder.json`. Returns the updated descriptor,
 * or `null` if no folder with that id was found.
 */
export async function renameFolderById(
    foldersDir: string,
    folderId: string,
    newName: string,
): Promise<Record<string, unknown> | null> {
    let names: string[];
    try {
        names = (await fs.readdir(foldersDir)).filter((n) => n !== ".DS_Store");
    } catch {
        return null;
    }
    for (const name of names) {
        const subDir = path.join(foldersDir, name);
        try {
            const stat = await fs.stat(subDir);
            if (!stat.isDirectory()) continue;
        } catch {
            continue;
        }
        const folderJsonPath = path.join(subDir, "folder.json");
        try {
            const raw = await fs.readFile(folderJsonPath, "utf-8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            if (data.id === folderId) {
                const updated = { ...data, name: newName };
                await fs.writeFile(folderJsonPath, JSON.stringify(updated, null, 2), "utf-8");
                return updated;
            }
        } catch {
            // no folder.json or parse error — continue
        }
        // recurse into subdirectories
        const nested = await renameFolderById(subDir, folderId, newName);
        if (nested !== null) return nested;
    }
    return null;
}
