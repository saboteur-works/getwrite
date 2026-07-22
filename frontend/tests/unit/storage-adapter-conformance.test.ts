import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runStorageAdapterConformance } from "./storage-adapter-conformance";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { objectStoreAdapter } from "../../src/lib/models/objectStoreAdapter";
import {
  createMemoryObjectStore,
  createFsObjectStore,
} from "../../src/lib/models/object-store";

// The default filesystem adapter's behavior is the reference the object-store
// backend must match. We assert the object store against the same suite so the
// seam is provably transparent to the model layer, across three backends.

runStorageAdapterConformance("in-memory fs tree (memoryAdapter)", async () => ({
  adapter: createMemoryAdapter(),
}));

runStorageAdapterConformance("object store over in-memory store", async () => ({
  adapter: objectStoreAdapter(createMemoryObjectStore()),
}));

runStorageAdapterConformance("object store over filesystem store", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-conf-"));
  return {
    adapter: objectStoreAdapter(createFsObjectStore(root)),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
});
