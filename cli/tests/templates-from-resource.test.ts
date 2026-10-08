import { test, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/templates";
import { saveResourceTemplate, createResourceFromTemplate } from "@gw/core";

// CLI coverage for the templates subcommands that were previously exercised
// from the frontend resource-templates unit test (save-from-resource,
// parametrize, create --dry-run). These belong with the CLI now that it is its
// own package; the model helpers remain tested in frontend.

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-cli-tpl-"));
  try {
    await fn(tmp);
  } finally {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.rm(tmp, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }
}

test("CLI save-from-resource captures a resource as a template", async () => {
  await withTmp(async (tmp) => {
    // Seed a resource by creating one from a throwaway template.
    await saveResourceTemplate(tmp, {
      id: "seed-tpl",
      name: "Seed",
      type: "text",
      plainText: "Seed body",
      userMetadata: { status: "draft" },
      resourceSubtype: "scene",
    } as any);
    const created = (await createResourceFromTemplate(tmp, "seed-tpl", {
      name: "A Resource",
    })) as any;
    expect(created.id).toBeTruthy();

    const tplId = "from-cli";
    const code = await main([
      "node",
      "templates.ts",
      "save-from-resource",
      tmp,
      created.id,
      tplId,
      "--name",
      "From CLI",
    ]);
    expect(code).toBe(0);

    const raw = await fs.readFile(
      path.join(tmp, "meta", "templates", `${tplId}.json`),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe(tplId);
    expect(parsed.name).toBe("From CLI");
    // Feature 73 (FR-16/FR-17): explicit key set, body from the app layout,
    // subtype as a top-level key, no placement or identity fields.
    expect(Object.keys(parsed).sort()).toEqual([
      "id",
      "name",
      "plainText",
      "resourceSubtype",
      "type",
      "userMetadata",
    ]);
    expect(parsed.type).toBe("text");
    expect(parsed.plainText).toBe("Seed body");
    expect(parsed.resourceSubtype).toBe("scene");
    expect(parsed.userMetadata).toEqual({ status: "draft" });
  });
});

test("CLI save-from-resource rejects a resource with no readable body and writes no template", async () => {
  await withTmp(async (tmp) => {
    await saveResourceTemplate(tmp, {
      id: "seed-tpl",
      name: "Seed",
      type: "text",
      plainText: "Seed body",
    } as any);
    const created = (await createResourceFromTemplate(tmp, "seed-tpl", {
      name: "A Resource",
    })) as any;
    const base = path.join(tmp, "resources", created.id);
    await fs.rm(path.join(base, "content.txt"));
    await fs.rm(path.join(base, "content.tiptap.json"));

    const errors: string[] = [];
    const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => {
      errors.push(a.join(" "));
    });
    let code: number;
    try {
      code = await main([
        "node",
        "templates.ts",
        "save-from-resource",
        tmp,
        created.id,
        "from-cli-nobody",
      ]);
    } finally {
      errSpy.mockRestore();
    }
    expect(code).toBe(2);
    expect(errors.join("\n")).toContain(created.id);
    await expect(
      fs.stat(path.join(tmp, "meta", "templates", "from-cli-nobody.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

test("CLI parametrize replaces a placeholder in a template", async () => {
  await withTmp(async (tmp) => {
    const tplId = "tpl-param-cli";
    await saveResourceTemplate(tmp, {
      id: tplId,
      name: "Chapter One",
      type: "text",
      plainText: "Chapter One\n\nContent here",
    } as any);

    const code = await main([
      "node",
      "templates.ts",
      "parametrize",
      tmp,
      tplId,
      "--placeholder",
      "{{TITLE}}",
    ]);
    expect(code).toBe(0);

    const raw = await fs.readFile(
      path.join(tmp, "meta", "templates", `${tplId}.json`),
      "utf8",
    );
    expect(JSON.parse(raw).name).toBe("{{TITLE}}");
  });
});

test("CLI create --dry-run does not write resources", async () => {
  await withTmp(async (tmp) => {
    const tplId = "tpl-vars";
    await saveResourceTemplate(tmp, {
      id: tplId,
      name: "My {{TITLE}}",
      type: "text",
      plainText: "{{TITLE}}\n\nBody",
    } as any);

    const code = await main([
      "node",
      "templates.ts",
      "create",
      tmp,
      tplId,
      "--vars",
      JSON.stringify({ TITLE: "CLI" }),
      "--dry-run",
    ]);
    expect(code).toBe(0);

    const resourcesDir = path.join(tmp, "resources");
    const entries = await fs.readdir(resourcesDir).catch(() => [] as string[]);
    expect(entries).toEqual([]);
  });
});
