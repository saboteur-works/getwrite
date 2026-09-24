import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, getStorageAdapter } from "../../src/lib/models/io";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import { generateUUID } from "../../src/lib/models/uuid";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";

/**
 * A project whose `meta/` directory cannot be READ is not a project with no
 * resources. Presenting one as the other showed a writer an empty project and
 * reported nothing wrong — and, because the same catch swallowed
 * `ProjectLockedError`, a locked project rendered as an empty one instead of
 * prompting to unlock, defeating Feature 54's fail-closed guarantee.
 */
describe("loadProjectFromDisk — unreadable meta/", () => {
  let projectPath: string;

  beforeEach(async () => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
    projectPath = "/proj-" + generateUUID();
    await mem.mkdir(projectPath, { recursive: true });
    await mem.writeFile(
      `${projectPath}/project.json`,
      JSON.stringify({
        id: generateUUID(),
        name: "Readable Project",
        createdAt: new Date().toISOString(),
      }),
      "utf8",
    );
  });

  it("loads with no resources when meta/ is simply absent", async () => {
    const loaded = await loadProjectFromDisk(projectPath);
    expect(loaded.resources).toEqual([]);
    expect(loaded.project.name).toBe("Readable Project");
  });

  it("throws rather than reporting an empty project when meta/ cannot be read", async () => {
    const base = getStorageAdapter();
    setStorageAdapter({
      ...base,
      readdir: async (p: string, opts?: { withFileTypes?: boolean }) => {
        if (p.endsWith("/meta")) {
          throw Object.assign(new Error("EACCES: permission denied"), {
            code: "EACCES",
          });
        }
        return base.readdir(p, opts);
      },
    } as typeof base);

    await expect(loadProjectFromDisk(projectPath)).rejects.toThrow(/EACCES/);
  });

  it("propagates a locked-project error instead of degrading to empty", async () => {
    const base = getStorageAdapter();
    setStorageAdapter({
      ...base,
      readdir: async (p: string, opts?: { withFileTypes?: boolean }) => {
        if (p.endsWith("/meta")) throw new ProjectLockedError(projectPath);
        return base.readdir(p, opts);
      },
    } as typeof base);

    await expect(loadProjectFromDisk(projectPath)).rejects.toBeInstanceOf(
      ProjectLockedError,
    );
  });
});
