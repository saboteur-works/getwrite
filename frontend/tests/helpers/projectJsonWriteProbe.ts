/**
 * Feature 92: observes how a setter writes `project.json` on an in-memory
 * adapter. `fsyncs` lists the temp files fsynced before their rename (the
 * durable write); `lockKeysAtWrite` is the number of per-file lock keys held
 * each time a `project.json` temp file is written.
 */
import { fileLockKeyCountForTests } from "../../src/lib/models/file-lock";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";

export interface ProjectJsonWriteProbe {
  adapter: StorageAdapter;
  fsyncs: string[];
  lockKeysAtWrite: number[];
}

export function createProjectJsonWriteProbe(): ProjectJsonWriteProbe {
  const base = createMemoryAdapter();
  const fsyncs: string[] = [];
  const lockKeysAtWrite: number[] = [];
  const adapter: StorageAdapter = {
    ...base,
    writeFile: async (p, data, opts) => {
      if (p.includes("project.json")) {
        lockKeysAtWrite.push(fileLockKeyCountForTests());
      }
      return base.writeFile(p, data, opts);
    },
    fsyncFile: async (p) => {
      fsyncs.push(p);
    },
  };
  return { adapter, fsyncs, lockKeysAtWrite };
}
