import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    sidecarFilename,
    readSidecar,
    writeSidecar,
} from "../../../src/lib/models/sidecar";
import type { MetadataValue } from "../../../src/lib/models/types";
import { flushIndexer } from "../../../src/lib/models/indexer-queue";
import { generateUUID } from "../../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/sidecar", () => {
    it("writes and reads a sidecar file in project meta folder", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
        const resourceId = generateUUID();
        const meta: Record<string, MetadataValue> = {
            title: "Sample",
            tags: ["a", "b"],
        };

        await writeSidecar(tmp, resourceId, meta);

        const expectedPath = path.join(
            tmp,
            "meta",
            sidecarFilename(resourceId),
        );
        const exists = await fs.readFile(expectedPath, "utf8");
        expect(typeof exists).toBe("string");

        const read = await readSidecar(tmp, resourceId);
        expect(read).not.toBeNull();
        expect((read as any).title).toBe("Sample");

        // ensure background indexing finished before cleanup
        await flushIndexer();

        // cleanup
        await removeDirRetry(tmp);
    });

    it("returns null when sidecar is missing", async () => {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
        const resourceId = generateUUID();
        const read = await readSidecar(tmp, resourceId);
        expect(read).toBeNull();
        await removeDirRetry(tmp);
    });
});
