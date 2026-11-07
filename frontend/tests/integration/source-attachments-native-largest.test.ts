/**
 * Feature 102 Task 35 (FR-31 (d)): an attachment of the largest size the cap
 * accepts (`MAX_MEDIA_FILE_BYTES`, 100 MB) is added through the native
 * attachments transport and read back, byte for byte, over the fake
 * Capacitor filesystem.
 *
 * This is a measurement of the native code path in a Node process, not a
 * device measurement: the fake filesystem keeps files in memory, and the
 * duration it logs says nothing about the Phase 3 device baseline.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { MAX_MEDIA_FILE_BYTES } from "../../src/lib/models/media-validation";
import { readFileBuffer } from "../../src/lib/models/io";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { createNativeAttachmentsTransport } from "../../src/store/transport/native-source-attachments-backend";
import { createNativeResourcesTransport } from "../../src/store/transport/native-resource-backend";

const PROJECTS_DIR = "/projects";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

afterEach(async () => {
  await flushIndexer();
});

/** A PNG-signed buffer of exactly `size` bytes with a position-dependent body. */
function largePng(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
  bytes.set(PNG_SIGNATURE, 0);
  return bytes;
}

describe("native attachment transport at the 100 MB cap", () => {
  it("adds and reads back an attachment of exactly MAX_MEDIA_FILE_BYTES", async () => {
    const nativeFs = createFakeCapacitorFilesystem();
    const adapter = capacitorFsAdapter(nativeFs);
    const projectId = generateUUID();
    const root = `${PROJECTS_DIR}/${projectId}`;
    await adapter.mkdir(root, { recursive: true });
    await adapter.writeFile(
      `${root}/project.json`,
      JSON.stringify({ id: projectId, name: "p" }),
    );
    const deps = { fs: nativeFs, projectsDir: PROJECTS_DIR };
    const sourceId = (
      await createNativeResourcesTransport(deps).create(projectId, {
        type: "source",
        name: "Large",
        text: { plainText: "words" },
      })
    ).resource.id;
    const transport = createNativeAttachmentsTransport(deps);

    const bytes = largePng(MAX_MEDIA_FILE_BYTES);
    expect(bytes.byteLength).toBe(100 * 1024 * 1024);
    const file = new File([bytes as BlobPart], "large.png", {
      type: "image/png",
    });

    const started = performance.now();
    const entry = await transport.addAttachment(projectId, sourceId, file);
    const addMs = performance.now() - started;
    expect(entry.size).toBe(MAX_MEDIA_FILE_BYTES);

    const listed = await transport.listAttachments(projectId, sourceId);
    expect(listed.map((a) => a.id)).toEqual([entry.id]);

    const readStarted = performance.now();
    const stored = await runInStorageContext(
      { tenantRoot: PROJECTS_DIR, adapter },
      () => readFileBuffer(`${root}/resources/${sourceId}/${entry.fileName}`),
    );
    const readMs = performance.now() - readStarted;
    expect(stored.byteLength).toBe(MAX_MEDIA_FILE_BYTES);
    expect(Buffer.compare(Buffer.from(stored), Buffer.from(bytes))).toBe(0);

    console.log(
      `[FR-31 (d)] native transport, fake Capacitor fs, ${entry.size} bytes: ` +
        `add ${addMs.toFixed(0)} ms, read ${readMs.toFixed(0)} ms`,
    );
  }, 120_000);
});
