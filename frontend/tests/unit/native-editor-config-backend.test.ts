// ADR-021 Phase 2 (Task 4): proves the native editor-config transport reuses
// the shared editor config core (`lib/models/editor-config-core.ts`) over a
// `capacitorFsAdapter`, with no HTTP at all — the editor-config analogue of
// `native-project-backend.test.ts`.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { createProject } from "../../src/lib/models/project";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEditorConfigTransport } from "../../src/store/transport/native-editor-config-backend";

const PROJECTS_DIR = "/projects";

async function makeProject(
  fs: ReturnType<typeof createFakeCapacitorFilesystem>,
): Promise<string> {
  const proj = createProject({ name: "Native Editor Config Project" });
  const adapter = capacitorFsAdapter(fs);
  const projectRoot = path.join(PROJECTS_DIR, proj.id);
  await adapter.mkdir(projectRoot, { recursive: true });
  await adapter.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify(proj, null, 2),
  );
  return proj.id;
}

/**
 * Fails the test if `fetch` is called — proves the native path never hits
 * HTTP, mirroring `native-project-backend.test.ts`'s guard.
 */
function guardAgainstFetch(): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("fetch must not be called in-process");
  }) as unknown as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("native editor-config transport — in-process backend reuses the shared editor config core", () => {
  it("saves heading settings and body settings with no HTTP", async () => {
    const fetchMock = guardAgainstFetch();
    const fs = createFakeCapacitorFilesystem();
    const projectId = await makeProject(fs);

    const transport = createNativeEditorConfigTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    const headingsResult = await transport.saveHeadings(projectId, {
      h1: { fontSize: "42px" },
    });
    expect(headingsResult.editorConfig?.headings?.h1?.fontSize).toBe("42px");

    const bodyResult = await transport.saveBody(projectId, {
      fontSize: "18px",
    });
    expect(bodyResult.editorConfig?.body?.fontSize).toBe("18px");
    // A body-only save omits the `headings` key, so the headings saved
    // earlier in this test are expected to survive it.
    expect(bodyResult.editorConfig?.headings?.h1?.fontSize).toBe("42px");

    fetchMock.restore();
  });

  it("saveHeadings rejects with an error message for an invalid projectId", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEditorConfigTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.saveHeadings("not-a-uuid", { h1: { fontSize: "42px" } }),
    ).rejects.toThrow(/Invalid projectId/);
  });

  it("saveBody rejects with an error message for an invalid projectId", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEditorConfigTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.saveBody("not-a-uuid", { fontSize: "18px" }),
    ).rejects.toThrow(/Invalid projectId/);
  });

  it.each(["1.7", "1", "0.5", "normal", "150%", "1.8em", "28px", "abc"])(
    "saveBody inherits the core's floor: rejects lineHeight %j and writes nothing",
    async (lineHeight) => {
      const fs = createFakeCapacitorFilesystem();
      const projectId = await makeProject(fs);
      const adapter = capacitorFsAdapter(fs);
      const file = path.join(PROJECTS_DIR, projectId, "project.json");
      const before = await adapter.readFile(file, "utf-8");
      const transport = createNativeEditorConfigTransport({
        fs,
        projectsDir: PROJECTS_DIR,
      });

      await expect(
        transport.saveBody(projectId, { lineHeight }),
      ).rejects.toThrow("Line height must be a number of at least 1.8.");
      expect(await adapter.readFile(file, "utf-8")).toBe(before);
    },
  );

  it.each(["", "1.8", "2"])(
    "saveBody accepts lineHeight %j",
    async (lineHeight) => {
      const fs = createFakeCapacitorFilesystem();
      const projectId = await makeProject(fs);
      const transport = createNativeEditorConfigTransport({
        fs,
        projectsDir: PROJECTS_DIR,
      });
      await expect(
        transport.saveBody(projectId, { lineHeight }),
      ).resolves.toBeDefined();
    },
  );
});
