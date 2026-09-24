/**
 * Serves the built Storybook (`storybook-static/`) over plain HTTP for the
 * Playwright e2e suite.
 *
 * WHY THIS EXISTS — measured 2026-09-23, three consecutive runs of the full
 * suite in each mode, `--retries=0`:
 *
 *   against `storybook dev`     16, 38, 12 failures   (41 tests nondeterministic)
 *   against the built output     7,  7,  7 failures   ( 0 tests nondeterministic)
 *
 * The same 7 tests fail in both modes. Everything above that number was an
 * artifact of the dev server: Vite compiles each story on first request, and a
 * cold compile regularly exceeds the suite's 5s action/expect timeouts — the
 * failures were overwhelmingly `locator.click: Timeout` and
 * `expect(locator).toBeVisible()` rather than wrong values. Serving a
 * pre-built Storybook removes compile-on-demand from the measurement.
 *
 * Written by hand rather than adding `http-server`/`serve`: the suite needs
 * static file serving on one port, no dependency in `package.json` earns that,
 * and this matches the repo's existing zero-dependency `scripts/*.mjs`.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "storybook-static",
);
const port = Number(process.env.PORT ?? 6006);

/** Minimal extension → content-type map for what a Storybook build emits. */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
};

/**
 * Resolves a request path to a file inside `storybook-static`, or `null` when
 * it escapes the root or does not resolve to a file.
 *
 * Path traversal is refused rather than clamped: this only ever serves a build
 * output, so anything reaching outside it is a bug in the caller, not a
 * request to satisfy.
 */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const candidate = path.join(root, decoded === "/" ? "index.html" : decoded);
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      const index = path.join(resolved, "index.html");
      await stat(index);
      return index;
    }
    return resolved;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type":
      CONTENT_TYPES[path.extname(file).toLowerCase()] ??
      "application/octet-stream",
    // The suite rebuilds before serving, and a stale story would silently
    // test the previous commit.
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  // Playwright's `webServer` waits on the port, not on this line; it is here
  // so a human running the script directly sees where it landed.
  console.log(`Serving ${root} on http://localhost:${port}`);
});
