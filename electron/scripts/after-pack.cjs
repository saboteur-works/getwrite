// electron-builder afterPack hook (electron-builder.yml `afterPack`). Runs after
// the app is copied and before it is signed.
//
// Next's standalone output can carry a hoisted pnpm symlink whose target was
// never traced into it (e.g. .pnpm/node_modules/scheduler ->
// scheduler@0.27.0, absent). Nothing resolves it at runtime, but
// @electron/osx-sign stats every file it walks and fails the signed build
// with ENOENT on it. This removes such links from the packaged copy only;
// frontend/.next/standalone is left as built.
const fs = require("fs/promises");
const path = require("path");

/**
 * The bundled standalone server's node_modules inside the packaged app.
 * @param {{ appOutDir: string, electronPlatformName: string, packager: { appInfo: { productFilename: string } } }} context
 * @returns {string}
 */
function standaloneNodeModulesDir(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");
  return path.join(
    resources,
    "frontend",
    ".next",
    "standalone",
    "node_modules",
  );
}

/**
 * Remove every symlink under `root` whose target does not exist. Does not
 * follow symlinked directories. A missing `root` yields no removals.
 * @param {string} root
 * @returns {Promise<string[]>} the removed link paths
 */
async function pruneDanglingSymlinks(root) {
  /** @type {string[]} */
  const removed = [];
  /** @param {string} dir */
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          await fs.stat(entryPath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          await fs.unlink(entryPath);
          removed.push(entryPath);
        }
      } else if (entry.isDirectory()) {
        await walk(entryPath);
      }
    }
  }
  await walk(root);
  return removed;
}

/** @param {Parameters<typeof standaloneNodeModulesDir>[0]} context */
async function afterPack(context) {
  const root = standaloneNodeModulesDir(context);
  const removed = await pruneDanglingSymlinks(root);
  for (const link of removed) {
    console.log(`  • removed dangling symlink  ${path.relative(root, link)}`);
  }
}

module.exports = afterPack;
module.exports.pruneDanglingSymlinks = pruneDanglingSymlinks;
module.exports.standaloneNodeModulesDir = standaloneNodeModulesDir;
