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
