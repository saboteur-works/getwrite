/**
 * @module frontend/lib/models/resource-templates
 *
 * Utilities for managing resource templates within a project.
 *
 * Responsibilities:
 * - Persist and load resource templates under `meta/templates/`.
 * - Create resources from templates (dry-run and real creation).
 * - Duplicate existing resources (clone metadata and files).
 * - Export/import simple template packages (.zip wrapper).
 * - Maintain a compact change log per template.
 *
 * This module prefers explicit, filesystem-backed operations and documents
 * thrown errors for filesystem failures. When possible callers should run
 * template creation operations in a temporary project root during tests.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { generateUUID } from "./uuid";
import {
    createTextResource,
    createImageResource,
    createAudioResource,
} from "./resource-factory";
import { writeSidecar, readSidecar } from "./sidecar";
import { withMetaLock } from "./meta-locks";
import {
    inspectTemplate,
    validateTemplate,
    type TemplateValidationResult,
} from "./template-service";
import type {
    UUID,
    TextResource,
    ImageResource,
    AudioResource,
    AnyResource,
    ResourceType,
    MetadataValue,
} from "./types";

const TEMPLATES_DIR = (projectRoot: string) =>
    path.join(projectRoot, "meta", "templates");
const RESOURCES_DIR = (projectRoot: string) =>
    path.join(projectRoot, "resources");

/**
 * A saved resource template.
 *
 * Templates capture a minimal resource shape that can be instantiated via
 * `createResourceFromTemplate`. They intentionally avoid embedding volatile
 * fields such as `createdAt` or concrete filesystem ids.
 *
 * @property id - stable identifier for the template
 * @property name - human-friendly name (may include placeholders like {{TITLE}})
 * @property type - runtime `ResourceType` ("text" | "image" | "audio")
 * @property folderId - optional folder target; may be `null` to use default
 * @property metadata - optional metadata object used when instantiating resources
 * @property plainText - optional text blob used for text templates
 */
export interface ResourceTemplate {
    id: string;
    name: string;
    type: ResourceType;
    folderId?: UUID | null;
    metadata?: Record<string, MetadataValue>;
    plainText?: string; // for text templates
}

type TemplateCreatePreview = {
    plannedWrites: Array<{ path: string; content: string | null }>;
    resourcePreview: AnyResource;
};

type TemplateCreateResult =
    | TextResource
    | ImageResource
    | AudioResource
    | TemplateCreatePreview;

function getCreatedResourceId(result: TemplateCreateResult): string | null {
    if ("id" in result) {
        return result.id;
    }

    if ("resourcePreview" in result && result.resourcePreview.id) {
        return result.resourcePreview.id;
    }

    return null;
}

/**
 * Ensure a directory exists (creates parent directories recursively).
 *
 * @param dir - directory path to ensure exists
 */
async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

/** Persist a resource template under project meta/templates. */
/**
 * Persist a `ResourceTemplate` to disk under `meta/templates/<id>.json`.
 *
 * This operation obtains the project meta lock to serialize concurrent
 * updates and will append a compact change entry for auditing.
 *
 * @param projectRoot - absolute path to the project root
 * @param template - template object to persist
 * @throws {Error} filesystem errors when writing files
 * @example
 * await saveResourceTemplate('/tmp/proj', { id: 'tpl1', name: 'Chapter', type: 'text' });
 */
export async function saveResourceTemplate(
    projectRoot: string,
    template: ResourceTemplate,
): Promise<void> {
    const dir = TEMPLATES_DIR(projectRoot);
    await ensureDir(dir);
    const file = path.join(dir, `${template.id}.json`);
    await withMetaLock(projectRoot, async () => {
        // read previous content if exists for change tracking
        let prevRaw: string | null = null;
        try {
            prevRaw = await fs.readFile(file, "utf8");
        } catch (_) {
            prevRaw = null;
        }
        await fs.writeFile(file, JSON.stringify(template, null, 2), "utf8");
        // record a compact change entry
        try {
            const prev = prevRaw ? JSON.parse(prevRaw) : null;
            await recordTemplateChange(
                projectRoot,
                template.id,
                prev,
                template,
            );
        } catch (_) {
            // non-fatal: don't block save on change recording errors
        }
    });
}

/**
 * Load a saved `ResourceTemplate` by id.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @returns parsed template
 * @throws {Error} when the template file is missing or invalid JSON
 */
export async function loadResourceTemplate(
    projectRoot: string,
    templateId: string,
): Promise<ResourceTemplate> {
    const file = path.join(TEMPLATES_DIR(projectRoot), `${templateId}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as ResourceTemplate;
}

/**
 * List saved templates optionally filtered by a simple query against id, name or type.
 *
 * @param projectRoot - project root path
 * @param query - optional case-insensitive substring query
 * @returns array of lightweight template descriptors
 */
export async function listResourceTemplates(
    projectRoot: string,
    query?: string,
): Promise<Array<{ id: string; name: string; type: ResourceType }>> {
    const dir = TEMPLATES_DIR(projectRoot);
    const out: Array<{ id: string; name: string; type: ResourceType }> = [];
    try {
        const entries = await fs.readdir(dir);
        for (const e of entries) {
            if (!e.endsWith(".json")) continue;
            const raw = await fs.readFile(path.join(dir, e), "utf8");
            const parsed = JSON.parse(raw) as ResourceTemplate;
            const candidate = {
                id: parsed.id,
                name: parsed.name,
                type: parsed.type,
            };
            if (!query) out.push(candidate);
            else {
                const q = query.toLowerCase();
                if (
                    candidate.id.toLowerCase().includes(q) ||
                    candidate.name.toLowerCase().includes(q) ||
                    candidate.type.toLowerCase().includes(q)
                ) {
                    out.push(candidate);
                }
            }
        }
    } catch (_) {
        // ignore missing dir
    }
    return out;
}

/**
 * Inspect a saved template and extract metadata such as placeholder variables
 * (e.g. `{{TITLE}}`) and declared metadata keys.
 *
 * Useful for building UI forms that prompt for variable values prior to
 * instantiation.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @returns inspection result including placeholders and metadata keys
 */
export async function inspectResourceTemplate(
    projectRoot: string,
    templateId: string,
): Promise<{
    id: string;
    name: string;
    type: ResourceType;
    placeholders: string[];
    metadataKeys: string[];
}> {
    const tpl = await loadResourceTemplate(projectRoot, templateId);
    return inspectTemplate(tpl);
}

/**
 * Instantiate a resource from a saved template.
 *
 * Supports `dryRun` mode which returns planned filesystem writes without
 * performing them. When performing a real creation this function writes
 * resource files and its sidecar and returns the created resource model.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param opts - optional creation parameters
 * @param opts.name - override the template name for the created resource
 * @param opts.vars - object or JSON string of placeholder variables
 * @param opts.dryRun - when true, return planned write operations instead of performing them
 * @returns created resource (or plannedWrites + preview for dryRun)
 * @throws {Error} on filesystem write failures or invalid template
 * @example
 * const res = await createResourceFromTemplate('/tmp/p', 'tpl1', { vars: { TITLE: 'Intro' } });
 */
export async function createResourceFromTemplate(
    projectRoot: string,
    templateId: string,
    opts?: {
        name?: string;
        vars?: Record<string, string> | string;
        dryRun?: boolean;
    },
): Promise<
    TextResource | ImageResource | AudioResource | TemplateCreatePreview
> {
    const tmpl = await loadResourceTemplate(projectRoot, templateId);

    const vars: Record<string, string> | undefined =
        typeof opts?.vars === "string"
            ? (JSON.parse(opts.vars) as Record<string, string>)
            : opts?.vars;

    // helper to apply vars substitution ({{VAR}}) into strings/objects
    function applyVars(v: unknown): unknown {
        if (!vars) return v;
        if (typeof v === "string") {
            let out = v as string;
            for (const k of Object.keys(vars)) {
                out = out.split(`{{${k}}}`).join(String(vars[k]));
            }
            return out;
        }
        if (Array.isArray(v)) return v.map(applyVars);
        if (v && typeof v === "object") {
            const o: Record<string, unknown> = {};
            for (const key of Object.keys(v as Record<string, unknown>)) {
                o[key] = applyVars((v as Record<string, unknown>)[key]);
            }
            return o;
        }
        return v;
    }

    const name = (opts?.name ?? tmpl.name) as string;
    const appliedName = (applyVars(name) as string) ?? name;

    await ensureDir(RESOURCES_DIR(projectRoot));

    const plannedWrites: Array<{ path: string; content: string | null }> = [];

    if (tmpl.type === "text") {
        const res = createTextResource({
            name: appliedName,
            folderId: tmpl.folderId ?? null,
            plainText: (applyVars(tmpl.plainText ?? "") as string) ?? "",
            metadata: tmpl.metadata,
        });
        const filename = `${res.slug ?? appliedName.replace(/\s+/g, "-")}-${res.id}.txt`;
        const filePath = path.join(RESOURCES_DIR(projectRoot), filename);

        const content = res.plainText ?? "";
        const sidecar = JSON.stringify(
            {
                id: res.id,
                name: res.name,
                type: res.type,
                createdAt: res.createdAt,
            },
            null,
            2,
        );

        if (opts?.dryRun) {
            plannedWrites.push({ path: filePath, content });
            plannedWrites.push({
                path: path.join(
                    projectRoot,
                    "meta",
                    `resource-${res.id}.meta.json`,
                ),
                content: sidecar,
            });
            return { plannedWrites, resourcePreview: res };
        }

        await fs.writeFile(filePath, content, "utf8");
        await writeSidecar(projectRoot, res.id, JSON.parse(sidecar));
        return res;
    }

    if (tmpl.type === "image") {
        const res = createImageResource({
            name: appliedName,
            folderId: tmpl.folderId ?? null,
            metadata: tmpl.metadata,
        });
        const filename = `${res.slug ?? appliedName.replace(/\s+/g, "-")}-${res.id}.img`;
        const filePath = path.join(RESOURCES_DIR(projectRoot), filename);
        const sidecar = JSON.stringify(
            {
                id: res.id,
                name: res.name,
                type: res.type,
                createdAt: res.createdAt,
            },
            null,
            2,
        );

        if (opts?.dryRun) {
            plannedWrites.push({ path: filePath, content: "" });
            plannedWrites.push({
                path: path.join(
                    projectRoot,
                    "meta",
                    `resource-${res.id}.meta.json`,
                ),
                content: sidecar,
            });
            return { plannedWrites, resourcePreview: res };
        }

        await fs.writeFile(filePath, "", "utf8");
        await writeSidecar(projectRoot, res.id, JSON.parse(sidecar));
        return res;
    }

    // audio
    const res = createAudioResource({
        name: appliedName,
        folderId: tmpl.folderId ?? null,
        metadata: tmpl.metadata,
    });
    const filename = `${res.slug ?? appliedName.replace(/\s+/g, "-")}-${res.id}.aud`;
    const filePath = path.join(RESOURCES_DIR(projectRoot), filename);
    const sidecar = JSON.stringify(
        {
            id: res.id,
            name: res.name,
            type: res.type,
            createdAt: res.createdAt,
        },
        null,
        2,
    );

    if (opts?.dryRun) {
        plannedWrites.push({ path: filePath, content: "" });
        plannedWrites.push({
            path: path.join(
                projectRoot,
                "meta",
                `resource-${res.id}.meta.json`,
            ),
            content: sidecar,
        });
        return { plannedWrites, resourcePreview: res };
    }

    await fs.writeFile(filePath, "", "utf8");
    await writeSidecar(projectRoot, res.id, JSON.parse(sidecar));
    return res;
}

/**
 * Duplicate an existing resource within a project.
 *
 * This clones the resource sidecar (with a new id) and duplicates the
 * underlying file or directory that stores the resource content. The
 * returned `newId` is the id of the duplicated resource's sidecar.
 *
 * @param projectRoot - project root path
 * @param resourceId - id of resource to duplicate
 * @returns object containing `newId` for the duplicated resource
 * @throws {Error} when the original resource sidecar is missing or when
 * filesystem copy operations fail
 */
export async function duplicateResource(
    projectRoot: string,
    resourceId: UUID,
): Promise<{ newId: UUID }> {
    // read sidecar to get metadata
    const meta = await readSidecar(projectRoot, resourceId);
    if (!meta) {
        throw new Error(`resource metadata for ${resourceId} not found`);
    }

    // find resource file in resources dir
    const resourcesDir = RESOURCES_DIR(projectRoot);
    let foundName: string | null = null;
    try {
        const entries = await fs.readdir(resourcesDir);
        for (const e of entries) {
            if (e.includes(resourceId)) {
                foundName = e;
                break;
            }
        }
    } catch (err) {
        // no resources dir
    }

    const newId = generateUUID();

    // clone sidecar metadata, replacing id
    const newMeta = { ...meta, id: newId } as Record<string, unknown>;
    await writeSidecar(
        projectRoot,
        newId,
        newMeta as Record<string, MetadataValue>,
    );

    if (foundName) {
        const src = path.join(resourcesDir, foundName);
        const ext = path.extname(foundName);
        const base = foundName.replace(resourceId, newId);
        const dest = path.join(resourcesDir, base);
        try {
            const st = await fs.stat(src);
            if (st.isDirectory()) {
                // Resource stored as a directory (newer layout); copy recursively
                // `fs.cp` supports recursive copy on Node >=16.7
                // Use the promises API's cp if available
                // @ts-ignore - cp exists on Node 16+
                if (typeof (fs as any).cp === "function") {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    await (fs as any).cp(src, dest, { recursive: true });
                } else {
                    // Fallback: create dest dir and copy individual entries
                    await fs.mkdir(dest, { recursive: true });
                    const entries = await fs.readdir(src);
                    for (const e of entries) {
                        await fs.copyFile(
                            path.join(src, e),
                            path.join(dest, e),
                        );
                    }
                }
            } else {
                await fs.copyFile(src, dest);
            }
        } catch (err) {
            // propagate error to caller for visibility in tests
            throw err;
        }
    }

    return { newId };
}

export default {
    saveResourceTemplate,
    loadResourceTemplate,
    createResourceFromTemplate,
    duplicateResource,
};

/**
 * Export a single template into a minimal .zip package containing the
 * template JSON as `<templateId>.json`.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param outPath - output path for the generated zip file
 */
export async function exportResourceTemplate(
    projectRoot: string,
    templateId: string,
    outPath: string,
): Promise<void> {
    const tpl = await loadResourceTemplate(projectRoot, templateId);
    const name = `${tpl.id}.json`;
    const data = Buffer.from(JSON.stringify(tpl, null, 2), "utf8");
    const zip = createZipBuffer([{ name, data }]);
    await ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, zip);
}

/**
 * Import templates from a simple package produced by `exportResourceTemplate`.
 *
 * Only `.json` entries are imported into `meta/templates/`.
 *
 * @param projectRoot - project root path
 * @param packPath - path to the zip package to import
 * @returns list of imported template ids
 */
export async function importResourceTemplates(
    projectRoot: string,
    packPath: string,
): Promise<string[]> {
    const buf = await fs.readFile(packPath);
    const entries = parseZipBuffer(buf);
    if (!entries || entries.length === 0) {
        throw new Error("Invalid or empty template package");
    }
    const dir = TEMPLATES_DIR(projectRoot);
    await ensureDir(dir);
    const imported: string[] = [];
    for (const e of entries) {
        if (!e.name.endsWith(".json")) continue;
        const tpl = JSON.parse(e.data.toString("utf8")) as ResourceTemplate;
        const file = path.join(dir, `${tpl.id}.json`);
        await withMetaLock(projectRoot, async () => {
            await fs.writeFile(file, JSON.stringify(tpl, null, 2), "utf8");
        });
        imported.push(tpl.id);
    }
    return imported;
}

/**
 * Validate a saved template against the runtime schema.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @returns validation result or list of schema errors
 */
export async function validateResourceTemplate(
    projectRoot: string,
    templateId: string,
): Promise<TemplateValidationResult> {
    const tpl = await loadResourceTemplate(projectRoot, templateId);
    return validateTemplate(tpl);
}

/**
 * Create multiple resources from a template, generating sequential names.
 *
 * Returns the list of created resource ids. Useful for bulk scaffold
 * operations from a single template.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param count - number of resources to create
 * @returns array of resource ids created
 */
export async function scaffoldResourcesFromTemplate(
    projectRoot: string,
    templateId: string,
    count: number,
): Promise<string[]> {
    if (count <= 0) return [];
    const tpl = await loadResourceTemplate(projectRoot, templateId);
    const created: string[] = [];
    for (let i = 0; i < count; i++) {
        const name = `${tpl.name} ${i + 1}`;
        const res = await createResourceFromTemplate(projectRoot, templateId, {
            name,
        });
        const createdId = getCreatedResourceId(res);
        if (createdId) created.push(createdId);
    }
    return created;
}

/**
 * Apply multiple variable sets to create many resources from a template.
 *
 * The `inputPath` may point to a JSON array file (preferred) or a simple
 * CSV file (first row headers). Returns the created resource ids.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param inputPath - path to JSON array or CSV file containing variable sets
 * @returns created resource ids
 */
export async function applyMultipleFromTemplate(
    projectRoot: string,
    templateId: string,
    inputPath: string,
): Promise<string[]> {
    const raw = await fs.readFile(inputPath, "utf8");
    let entries: Array<Record<string, string>> = [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error("JSON input must be an array");
        }

        entries = parsed.map((entry) => {
            if (!entry || typeof entry !== "object") {
                throw new Error("JSON entries must be objects");
            }

            const vars: Record<string, string> = {};
            for (const [key, value] of Object.entries(
                entry as Record<string, unknown>,
            )) {
                vars[key] = String(value ?? "");
            }
            return vars;
        });
    } catch (err) {
        // fallback to CSV
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2)
            throw new Error("CSV input requires header and rows");
        const headers = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => c.trim());
            const obj: Record<string, string> = {};
            for (let j = 0; j < headers.length; j++)
                obj[headers[j]] = cols[j] ?? "";
            entries.push(obj);
        }
    }

    const created: string[] = [];
    for (const vars of entries) {
        const res = await createResourceFromTemplate(projectRoot, templateId, {
            vars,
        });
        const createdId = getCreatedResourceId(res);
        if (createdId) created.push(createdId);
    }
    return created;
}

/**
 * Create a version snapshot for a template by writing `<templateId>.v<N>.json`.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @returns path to the created version file
 */
export async function saveTemplateVersion(
    projectRoot: string,
    templateId: string,
): Promise<string> {
    const dir = TEMPLATES_DIR(projectRoot);
    const file = path.join(dir, `${templateId}.json`);
    const raw = await fs.readFile(file, "utf8");
    // find existing versions
    const entries = await fs.readdir(dir);
    const re = new RegExp(`^${templateId}\\.v(\\d+)\\.json$`);
    let max = 0;
    for (const e of entries) {
        const m = e.match(re);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const next = max + 1;
    const verFile = path.join(dir, `${templateId}.v${next}.json`);
    await withMetaLock(projectRoot, async () => {
        await fs.writeFile(verFile, raw, "utf8");
    });
    return verFile;
}

/**
 * List available saved versions for a template ordered by version number.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @returns array of version descriptors with absolute file paths
 */
export async function listTemplateVersions(
    projectRoot: string,
    templateId: string,
): Promise<Array<{ file: string; version: number }>> {
    const dir = TEMPLATES_DIR(projectRoot);
    try {
        const entries = await fs.readdir(dir);
        const out: Array<{ file: string; version: number }> = [];
        const re = new RegExp(`^${templateId}\\.v(\\d+)\\.json$`);
        for (const e of entries) {
            const m = e.match(re);
            if (m)
                out.push({
                    file: path.join(dir, e),
                    version: parseInt(m[1], 10),
                });
        }
        out.sort((a, b) => a.version - b.version);
        return out;
    } catch (err) {
        return [];
    }
}

/**
 * Roll back a template to a previously saved version by copying the
 * version file over the main `<templateId>.json` file.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param version - numeric version to restore
 */
export async function rollbackTemplateVersion(
    projectRoot: string,
    templateId: string,
    version: number,
): Promise<void> {
    const dir = TEMPLATES_DIR(projectRoot);
    const verFile = path.join(dir, `${templateId}.v${version}.json`);
    const raw = await fs.readFile(verFile, "utf8");
    const mainFile = path.join(dir, `${templateId}.json`);
    await withMetaLock(projectRoot, async () => {
        await fs.writeFile(mainFile, raw, "utf8");
    });
}

/**
 * Record a compact change entry for a template stored as JSONL in
 * `<templateId>.changes.jsonl`. Each entry contains a timestamp, action
 * (create|edit) and list of keys changed.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param prev - previous template object or null when creating
 * @param next - next template object
 */
export async function recordTemplateChange(
    projectRoot: string,
    templateId: string,
    prev: ResourceTemplate | null,
    next: ResourceTemplate,
): Promise<void> {
    const dir = TEMPLATES_DIR(projectRoot);
    await ensureDir(dir);
    const changesFile = path.join(dir, `${templateId}.changes.jsonl`);
    const ts = new Date().toISOString();
    const changedKeys: string[] = [];
    if (!prev) changedKeys.push("created");
    else {
        const keys = new Set<string>([
            ...Object.keys(prev),
            ...Object.keys(next),
        ]);
        for (const k of keys) {
            const pv = (prev as any)[k];
            const nv = (next as any)[k];
            if (JSON.stringify(pv) !== JSON.stringify(nv)) changedKeys.push(k);
        }
    }
    const entry = { ts, action: prev ? "edit" : "create", keys: changedKeys };
    await fs.appendFile(changesFile, JSON.stringify(entry) + "\n", "utf8");
}

/**
 * Read the change log for a template and return entries optionally
 * filtered by a starting `since` date.
 *
 * @param projectRoot - project root path
 * @param templateId - template identifier
 * @param since - optional lower bound timestamp to filter entries
 * @returns list of change log entries
 */
export async function getTemplateChanges(
    projectRoot: string,
    templateId: string,
    since?: Date,
): Promise<Array<{ ts: string; action: string; keys: string[] }>> {
    const dir = TEMPLATES_DIR(projectRoot);
    const changesFile = path.join(dir, `${templateId}.changes.jsonl`);
    try {
        const raw = await fs.readFile(changesFile, "utf8");
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        const out: Array<{ ts: string; action: string; keys: string[] }> = [];
        for (const l of lines) {
            try {
                const p = JSON.parse(l);
                if (!since || new Date(p.ts) >= since) out.push(p);
            } catch (_) {
                // skip invalid line
            }
        }
        return out;
    } catch (err) {
        return [];
    }
}

// --- Minimal ZIP writer/reader for single/multiple file packages ---

function crc32(buf: Buffer): number {
    const table = CRC32_TABLE;
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
}

function createZipBuffer(
    entries: Array<{ name: string; data: Buffer }>,
): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, "utf8");
        const crc = crc32(e.data);
        const compSize = e.data.length;
        const uncompSize = e.data.length;

        const localHeader = Buffer.alloc(30);
        // local file header signature
        localHeader.writeUInt32LE(0x04034b50, 0);
        // version needed
        localHeader.writeUInt16LE(20, 4);
        // flags
        localHeader.writeUInt16LE(0, 6);
        // compression (0 = none)
        localHeader.writeUInt16LE(0, 8);
        // mod time/date
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        // crc32
        localHeader.writeUInt32LE(crc, 14);
        // comp size
        localHeader.writeUInt32LE(compSize, 18);
        // uncomp size
        localHeader.writeUInt32LE(uncompSize, 22);
        // filename len
        localHeader.writeUInt16LE(nameBuf.length, 26);
        // extra len
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBuf, e.data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(0, 4); // version made by
        centralHeader.writeUInt16LE(20, 6); // version needed
        centralHeader.writeUInt16LE(0, 8); // flags
        centralHeader.writeUInt16LE(0, 10); // compression
        centralHeader.writeUInt16LE(0, 12); // mod time
        centralHeader.writeUInt16LE(0, 14); // mod date
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compSize, 20);
        centralHeader.writeUInt32LE(uncompSize, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30); // extra
        centralHeader.writeUInt16LE(0, 32); // comment
        centralHeader.writeUInt16LE(0, 34); // disk start
        centralHeader.writeUInt16LE(0, 36); // internal attrs
        centralHeader.writeUInt32LE(0, 38); // external attrs
        centralHeader.writeUInt32LE(offset, 42); // relative offset

        centralParts.push(centralHeader, nameBuf);

        offset += localHeader.length + nameBuf.length + e.data.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const local = Buffer.concat(localParts);

    const eocdr = Buffer.alloc(22);
    eocdr.writeUInt32LE(0x06054b50, 0);
    eocdr.writeUInt16LE(0, 4); // disk
    eocdr.writeUInt16LE(0, 6); // start disk
    eocdr.writeUInt16LE(entries.length, 8); // entries this disk
    eocdr.writeUInt16LE(entries.length, 10); // total entries
    eocdr.writeUInt32LE(centralDir.length, 12); // size of central
    eocdr.writeUInt32LE(local.length, 16); // offset of start of central
    eocdr.writeUInt16LE(0, 20); // comment len

    return Buffer.concat([local, centralDir, eocdr]);
}

function parseZipBuffer(buf: Buffer): Array<{ name: string; data: Buffer }> {
    const out: Array<{ name: string; data: Buffer }> = [];
    let offset = 0;
    while (offset + 30 <= buf.length) {
        const sig = buf.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;
        const nameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const crc = buf.readUInt32LE(offset + 14);
        const compSize = buf.readUInt32LE(offset + 18);
        const uncompSize = buf.readUInt32LE(offset + 22);
        const nameStart = offset + 30;
        const name = buf.slice(nameStart, nameStart + nameLen).toString("utf8");
        const dataStart = nameStart + nameLen + extraLen;
        const data = buf.slice(dataStart, dataStart + compSize);
        out.push({ name, data });
        offset = dataStart + compSize;
    }
    return out;
}

// CRC table (generated once)
const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let r = i;
        for (let j = 0; j < 8; j++)
            r = r & 1 ? 0xedb88320 ^ (r >>> 1) : r >>> 1;
        t[i] = r >>> 0;
    }
    return Array.from(t);
})();
/**
 * Create and persist a resource template based on an existing resource in the project.
 * Captures sidecar metadata and (for text resources) the file contents as `plainText`.
 */
export async function saveResourceTemplateFromResource(
    projectRoot: string,
    resourceId: UUID,
    templateId: string,
    opts?: { name?: string },
): Promise<void> {
    const meta = await readSidecar(projectRoot, resourceId);
    if (!meta) {
        throw new Error(
            `sidecar metadata for resource ${resourceId} not found`,
        );
    }

    // determine type (prefer sidecar.type)
    const type = (meta.type as ResourceType) ?? "text";

    // locate the resource file if present
    let plainText: string | undefined = undefined;
    try {
        const entries = await fs.readdir(RESOURCES_DIR(projectRoot));
        for (const e of entries) {
            if (e.includes(resourceId)) {
                const p = path.join(RESOURCES_DIR(projectRoot), e);
                if (type === "text") {
                    try {
                        plainText = await fs.readFile(p, "utf8");
                    } catch (_) {
                        plainText = undefined;
                    }
                }
                break;
            }
        }
    } catch (_) {
        // ignore missing resources dir
    }

    // Compose template; copy metadata but avoid embedding volatile fields like id/createdAt
    const {
        id: _id,
        createdAt: _created,
        ...restMeta
    } = meta as Record<string, unknown>;

    const tpl: ResourceTemplate = {
        id: templateId,
        name: opts?.name ?? (meta.name as string) ?? templateId,
        type,
        folderId: (meta.folderId as UUID) ?? null,
        metadata: Object.keys(restMeta).length
            ? (restMeta as Record<string, MetadataValue>)
            : undefined,
        plainText: plainText,
    };

    await saveResourceTemplate(projectRoot, tpl);
}

/**
 * Replace literal occurrences of the template's name in string fields with
 * a placeholder (e.g. "{{TITLE}}") and persist the updated template.
 * Returns the list of variable names introduced (extracted from the placeholder).
 */
export async function parametrizeResourceTemplate(
    projectRoot: string,
    templateId: string,
    placeholder: string,
): Promise<string[]> {
    const tpl = await loadResourceTemplate(projectRoot, templateId);
    if (!tpl) throw new Error(`template ${templateId} not found`);

    const m = String(placeholder).match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/);
    if (!m) throw new Error("Invalid placeholder format. Use {{NAME}}");
    const varName = m[1];

    // Replace occurrences of the template name in strings recursively
    function replaceStrings(v: unknown): unknown {
        if (typeof v === "string") {
            return v.split(tpl.name).join(placeholder);
        }
        if (Array.isArray(v)) return v.map(replaceStrings);
        if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(v as Record<string, unknown>)) {
                out[k] = replaceStrings((v as Record<string, unknown>)[k]);
            }
            return out;
        }
        return v;
    }

    const newTpl: ResourceTemplate = {
        ...tpl,
        name: replaceStrings(tpl.name) as string,
        plainText: tpl.plainText
            ? (replaceStrings(tpl.plainText) as string)
            : tpl.plainText,
        metadata: tpl.metadata
            ? (replaceStrings(tpl.metadata) as Record<string, MetadataValue>)
            : tpl.metadata,
    };

    await saveResourceTemplate(projectRoot, newTpl);
    return [varName];
}

/** Render a template with provided vars to stdout or an output file. */
export async function previewResourceTemplate(
    projectRoot: string,
    templateId: string,
    opts?: { vars?: Record<string, string> | string; outPath?: string },
): Promise<string> {
    // reuse createResourceFromTemplate in dry-run mode to get a resource preview
    const res = await createResourceFromTemplate(projectRoot, templateId, {
        vars: opts?.vars as any,
        dryRun: true,
    });
    const preview = (res as any).resourcePreview;
    const plain = preview && preview.plainText ? preview.plainText : "";
    if (opts?.outPath) {
        await ensureDir(path.dirname(opts.outPath));
        await fs.writeFile(opts.outPath, plain, "utf8");
        return opts.outPath;
    }
    return plain;
}
