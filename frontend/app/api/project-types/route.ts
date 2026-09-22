import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ProjectTypeSpec,
  validateProjectType,
} from "../../../src/lib/models/schemas";
import { isLockedAccessError } from "../../../src/lib/models/locked-access";

const TEMPLATES_DIR =
  process.env.GETWRITE_TEMPLATES_DIR ??
  path.join(
    process.cwd(),
    "..",
    "getwrite-config",
    "templates",
    "project-types",
  );

export async function GET() {
  try {
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    const results: ProjectTypeSpec[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      const filePath = path.join(TEMPLATES_DIR, e.name);
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
        const res = validateProjectType(parsed);
        if (res.success) {
          results.push(res.value as ProjectTypeSpec);
        }
      } catch (err) {
        // skip invalid files
        continue;
      }
    }
    return NextResponse.json(results);
  } catch (err) {
    // Rethrow a locked-access error rather than folding it into this route's
    // generic 500 shape (FR-14). NOTE: this `GET` handler is not wrapped by
    // `withStorageContext`, so a rethrow here does not currently resolve to
    // a 401/409 the way it does on the other eight fixed routes — see the
    // Task 14 report for this finding. This route also reads a fixed
    // template directory via `node:fs` directly rather than through the
    // `StorageContext`-scoped adapter, so `isLockedAccessError` is not
    // expected to ever observe a locked-access error here in practice.
    if (isLockedAccessError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Cannot read project types", details: msg },
      { status: 500 },
    );
  }
}
