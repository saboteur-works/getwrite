// Standalone smoke check (task_ffe51e33): proves createFakeCapacitorFilesystem()'s
// `rename` actually moves a file across different subtrees nested under a
// common `.trash` root, mirroring the shapes of rename calls trash.ts makes
// when soft-deleting a resource (e.g. moving `resources/<id>/content.txt`
// into `.trash/resources/<resourceId>-content.txt`). Exercises
// capacitorFsAdapter + createFakeCapacitorFilesystem directly — trash.ts and
// any HTTP route are deliberately out of scope for this test.
import { describe, expect, it } from "vitest";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

describe("createFakeCapacitorFilesystem rename — cross-.trash-subtree smoke check", () => {
  it("moves a file from one subtree to a sibling subtree both nested under a common .trash root", async () => {
    const adapter = capacitorFsAdapter(createFakeCapacitorFilesystem());

    const projectRoot = "some-root";
    const resourceId = "res-123";
    // Mirrors trash.ts's softDeleteResource shape (line 331): a file under
    // `resources/<id>/` moved into `.trash/resources/<resourceId>-<name>`.
    const src = `${projectRoot}/resources/${resourceId}/content.txt`;
    const dest = `${projectRoot}/.trash/resources/${resourceId}-content.txt`;

    await adapter.writeFile(src, "trashed content");

    // trash.ts always mkdirs the destination directory before renaming into
    // it (e.g. trashResourcesDir), so mirror that here rather than relying on
    // rename itself to create parent directories.
    await adapter.mkdir(`${projectRoot}/.trash/resources`, { recursive: true });

    await adapter.rename(src, dest);

    const destContent = await adapter.readFile(dest);
    expect(destContent).toBe("trashed content");

    await expect(adapter.readFile(src)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("moves a file across a deeper cross-subtree shape (tmp staging dir to a sibling trash subtree)", async () => {
    const adapter = capacitorFsAdapter(createFakeCapacitorFilesystem());

    const projectRoot = "some-root";
    const resourceId = "res-456";
    // A deeper nesting shape: source under `.trash/tmp/<id>/`, destination
    // under a sibling `.trash/resources/` subtree — both under the same
    // `.trash` root, mirroring the kind of cross-directory move trash.ts
    // performs when relocating trashed content between its own subtrees.
    const src = `${projectRoot}/.trash/tmp/${resourceId}/content.txt`;
    const dest = `${projectRoot}/.trash/resources/${resourceId}-content.txt`;

    await adapter.writeFile(src, "staged content");
    await adapter.mkdir(`${projectRoot}/.trash/resources`, { recursive: true });

    await adapter.rename(src, dest);

    const destContent = await adapter.readFile(dest);
    expect(destContent).toBe("staged content");

    await expect(adapter.readFile(src)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
