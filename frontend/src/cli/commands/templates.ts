// Last Updated: 2026-03-11

/**
 * @module templates
 *
 * Registers the `templates` sub-command group on the Commander program.
 *
 * Templates are reusable resource scaffolds stored as JSON files under
 * `<projectRoot>/meta/templates/`.  Each template captures a resource's
 * initial type, content, and metadata so that new resources can be created
 * consistently without manual setup.
 *
 * ### Sub-commands
 *
 * | Command | Description |
 * |---------|-------------|
 * | `templates save <projectRoot> <templateId> <name>` | Persist a new empty template to disk |
 * | `templates create <projectRoot> <templateId> [name]` | Create a resource from an existing template |
 * | `templates duplicate <projectRoot> <resourceId>` | Duplicate an existing resource as a new resource |
 * | `templates list <projectRoot>` | Print all templates found in the project |
 *
 * ### Underlying model
 *
 * All filesystem I/O is delegated to the functions exported by
 * `../../lib/models/resource-templates`, keeping this file focused purely on
 * CLI plumbing.
 *
 * ### Examples
 * ```sh
 * # Save a blank template called "Scene" with id "scene"
 * getwrite templates save ./my-project scene "Scene"
 *
 * # Create a new resource from the "scene" template
 * getwrite templates create ./my-project scene "Opening Scene"
 *
 * # Duplicate an existing resource
 * getwrite templates duplicate ./my-project abc123
 *
 * # List all templates in the project
 * getwrite templates list ./my-project
 * ```
 */
import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import {
    saveResourceTemplate,
    loadResourceTemplate,
    createResourceFromTemplate,
    duplicateResource,
} from "../../lib/models/resource-templates";

/**
 * Registers the `templates` sub-command group on the provided Commander
 * `program`.
 *
 * Attaches four child commands covering the full template lifecycle:
 * `save`, `create`, `duplicate`, and `list`.
 *
 * @param program - The root Commander `Command` instance to attach the
 *   sub-command group to.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerTemplates } from "./commands/templates";
 *
 * const program = new Command();
 * registerTemplates(program);
 * program.parse(process.argv);
 * ```
 */
export function registerTemplates(program: Command) {
    const tpl = program
        .command("templates")
        .description("Manage resource templates");

    /**
     * `templates save <projectRoot> <templateId> <name>`
     *
     * Writes a new empty text template to
     * `<projectRoot>/meta/templates/<templateId>.json`.
     *
     * The template is created with `type: "text"` and empty `plainText`.
     * Use this as a starting point before editing the template file directly.
     */
    tpl.command("save <projectRoot> <templateId> <name>")
        .description("Save an empty template with id and name")
        .action(
            async (
                projectRoot: string,
                templateId: string,
                name: string,
            ): Promise<void> => {
                try {
                    const template = {
                        id: templateId,
                        name,
                        type: "text",
                        plainText: "",
                    } as const;
                    await saveResourceTemplate(projectRoot, template as any);
                    console.log(`Saved template ${templateId}`);
                } catch (err) {
                    console.error("Error:", (err as Error).message);
                    process.exit(2);
                }
            },
        );

    /**
     * `templates create <projectRoot> <templateId> [name]`
     *
     * Instantiates a new resource from the template identified by
     * `templateId`, optionally overriding its default name.  Prints the ID
     * of the newly created resource on success.
     */
    tpl.command("create <projectRoot> <templateId> [name]")
        .description("Create a resource from a template")
        .action(
            async (
                projectRoot: string,
                templateId: string,
                name?: string,
            ): Promise<void> => {
                try {
                    const created = await createResourceFromTemplate(
                        projectRoot,
                        templateId,
                        { name },
                    );
                    // createResourceFromTemplate returns an AnyResource when not
                    // in dry-run mode; the dry-run branch returns a plannedWrites
                    // object instead.  Guard to ensure we have a real resource.
                    if ("id" in created) {
                        console.log(`Created resource ${created.id}`);
                    } else {
                        console.log("Created resource (dry-run preview only)");
                    }
                } catch (err) {
                    console.error("Error:", (err as Error).message);
                    process.exit(2);
                }
            },
        );

    /**
     * `templates duplicate <projectRoot> <resourceId>`
     *
     * Creates a copy of the resource identified by `resourceId` within the
     * same project.  Prints the new resource's ID on success.
     */
    tpl.command("duplicate <projectRoot> <resourceId>")
        .description("Duplicate an existing resource")
        .action(
            async (projectRoot: string, resourceId: string): Promise<void> => {
                try {
                    const res = await duplicateResource(
                        projectRoot,
                        resourceId,
                    );
                    console.log(`Duplicated resource -> ${res.newId}`);
                } catch (err) {
                    console.error("Error:", (err as Error).message);
                    process.exit(2);
                }
            },
        );

    /**
     * `templates list <projectRoot>`
     *
     * Reads all `.json` files from `<projectRoot>/meta/templates/` and
     * prints a tab-separated summary line (`id\tname\ttype`) for each.
     *
     * Exits with code `2` if the directory is missing or unreadable.
     */
    tpl.command("list <projectRoot>")
        .description("List templates in a project")
        .action(async (projectRoot: string): Promise<void> => {
            const dir = path.join(projectRoot, "meta", "templates");
            try {
                const entries = await fs.readdir(dir);
                for (const e of entries) {
                    if (e.endsWith(".json")) {
                        const raw = await fs.readFile(
                            path.join(dir, e),
                            "utf8",
                        );
                        const parsed = JSON.parse(raw);
                        console.log(
                            parsed.id + "\t" + parsed.name + "\t" + parsed.type,
                        );
                    }
                }
            } catch (err) {
                console.error(
                    "No templates found or cannot read templates directory.",
                );
                process.exit(2);
            }
        });
}

export default registerTemplates;
