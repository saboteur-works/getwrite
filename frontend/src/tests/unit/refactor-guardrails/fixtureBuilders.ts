/**
 * @module test/refactor-guardrails/fixtureBuilders
 *
 * Shared deterministic fixture builders for refactor guardrail tests.
 *
 * These builders intentionally create schema-compatible model shapes with
 * stable identifiers and timestamps so future regression tests can compare
 * before/after behavior without re-implementing boilerplate fixtures in each
 * file.
 */
import type {
    ProjectTypeSpec,
    ProjectTypeSpecFolder,
    ProjectTypeSpecResource,
} from "../../../lib/models/project-creator";
import type {
    Folder,
    Revision,
    TextResource,
    UUID,
} from "../../../lib/models/types";

/** Base timestamp used for deterministic fixture generation. */
const FIXTURE_BASE_TIME_MS = Date.parse("2026-03-20T00:00:00.000Z");

/** Monotonic counter used to derive fixture ids, names, and timestamps. */
let fixtureSequence = 0;

/**
 * Overrides supported by {@link createRefactorFixtureBundle}.
 */
export interface RefactorFixtureBundleOverrides {
    /** Partial folder override applied to the generated folder fixture. */
    folder?: Partial<Folder>;
    /** Partial resource override applied to the generated text resource. */
    resource?: Partial<TextResource>;
    /** Partial revision override applied to the generated revision. */
    revision?: Partial<Revision>;
    /** Partial project-type override applied to the generated project-type spec. */
    projectType?: Partial<ProjectTypeSpec>;
}

/**
 * Shared return shape used by higher-level refactor guardrail tests.
 */
export interface RefactorFixtureBundle {
    /** Folder fixture that can seed tree and workspace-related tests. */
    folder: Folder;
    /** Text resource fixture aligned with the folder fixture. */
    resource: TextResource;
    /** Canonical revision fixture aligned with the text resource. */
    revision: Revision;
    /** Project-type fixture preserving the default Workspace seed structure. */
    projectType: ProjectTypeSpec;
}

/**
 * Reset the deterministic fixture counter.
 *
 * Use this in `beforeEach` blocks when tests need reproducible fixture values
 * across assertions.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   resetRefactorFixtureBuilders();
 * });
 * ```
 */
export function resetRefactorFixtureBuilders(): void {
    fixtureSequence = 0;
}

/**
 * Create a folder fixture suitable for resource-tree, project-type, and
 * workspace guardrail tests.
 *
 * @param overrides - Optional field overrides for the generated folder.
 * @returns A folder fixture with deterministic ids and timestamps.
 *
 * @example
 * ```ts
 * const folder = createFolderFixture({ name: "Workspace", special: true });
 * ```
 */
export function createFolderFixture(overrides: Partial<Folder> = {}): Folder {
    const seed = nextFixtureSeed();

    return {
        id: overrides.id ?? seed.id,
        slug: overrides.slug ?? `folder-${seed.index}`,
        name: overrides.name ?? `Folder ${seed.index}`,
        type: "folder",
        parentId: overrides.parentId ?? null,
        folderId: overrides.folderId ?? null,
        orderIndex: overrides.orderIndex ?? seed.index - 1,
        notes: overrides.notes,
        statuses: overrides.statuses,
        sizeBytes: overrides.sizeBytes,
        metadata: overrides.metadata,
        special: overrides.special ?? false,
        createdAt: overrides.createdAt ?? seed.timestamp,
        updatedAt: overrides.updatedAt ?? seed.timestamp,
    };
}

/**
 * Create a text-resource fixture for model, adapter, and UI seam tests.
 *
 * @param overrides - Optional field overrides for the generated resource.
 * @returns A text resource fixture with consistent identity and content fields.
 *
 * @example
 * ```ts
 * const resource = createTextResourceFixture({ folderId: "folder-id" });
 * ```
 */
export function createTextResourceFixture(
    overrides: Partial<TextResource> = {},
): TextResource {
    const seed = nextFixtureSeed();

    return {
        id: overrides.id ?? seed.id,
        slug: overrides.slug ?? `resource-${seed.index}`,
        name: overrides.name ?? `Resource ${seed.index}`,
        type: "text",
        folderId: overrides.folderId ?? null,
        sizeBytes: overrides.sizeBytes ?? 0,
        notes: overrides.notes,
        orderIndex: overrides.orderIndex ?? seed.index - 1,
        statuses: overrides.statuses,
        metadata: overrides.metadata,
        createdAt: overrides.createdAt ?? seed.timestamp,
        updatedAt: overrides.updatedAt ?? seed.timestamp,
        plainText:
            overrides.plainText ??
            `Fixture resource ${seed.index} body content.`,
        tiptap: overrides.tiptap,
        wordCount: overrides.wordCount ?? 5,
        charCount: overrides.charCount ?? 32,
        paragraphCount: overrides.paragraphCount ?? 1,
    };
}

/**
 * Create a revision fixture aligned with resource-identity and canonical
 * revision guardrail tests.
 *
 * @param overrides - Optional field overrides for the generated revision.
 * @returns A canonical revision fixture with deterministic file path metadata.
 *
 * @example
 * ```ts
 * const revision = createRevisionFixture({ resourceId: resource.id });
 * ```
 */
export function createRevisionFixture(
    overrides: Partial<Revision> = {},
): Revision {
    const seed = nextFixtureSeed();
    const resourceId =
        overrides.resourceId ?? createFixtureUuid(seed.index + 1000);

    return {
        id: overrides.id ?? seed.id,
        resourceId,
        versionNumber: overrides.versionNumber ?? 1,
        createdAt: overrides.createdAt ?? seed.timestamp,
        savedAt: overrides.savedAt ?? seed.timestamp,
        author: overrides.author ?? "refactor-guardrails",
        filePath:
            overrides.filePath ??
            `/tmp/getwrite-fixtures/${resourceId}/revision-${seed.index}.json`,
        isCanonical: overrides.isCanonical ?? true,
        metadata: overrides.metadata,
    };
}

/**
 * Create a project-type spec fixture that preserves the Workspace seed expected
 * by refactor guardrail tests.
 *
 * @param overrides - Optional field overrides for the generated spec.
 * @returns A project-type spec with a protected Workspace folder and one text resource.
 *
 * @example
 * ```ts
 * const spec = createProjectTypeSpecFixture({ name: "Novel" });
 * ```
 */
export function createProjectTypeSpecFixture(
    overrides: Partial<ProjectTypeSpec> = {},
): ProjectTypeSpec {
    const seed = nextFixtureSeed();
    const folders = overrides.folders ?? createDefaultProjectTypeFolders();
    const defaultResources =
        overrides.defaultResources ?? createDefaultProjectTypeResources();

    return {
        id: overrides.id ?? `project-type-${seed.index}`,
        name: overrides.name ?? `Project Type ${seed.index}`,
        description:
            overrides.description ??
            "Deterministic project-type fixture for refactor guardrail tests.",
        folders,
        defaultResources,
    };
}

/**
 * Create a cohesive fixture bundle for future guardrail tests that need aligned
 * folder, resource, revision, and project-type inputs.
 *
 * @param overrides - Optional per-entity field overrides.
 * @returns A related set of fixtures sharing stable ids and workspace-safe defaults.
 *
 * @example
 * ```ts
 * const bundle = createRefactorFixtureBundle({
 *   folder: { name: "Workspace", special: true },
 * });
 * expect(bundle.revision.resourceId).toBe(bundle.resource.id);
 * ```
 */
export function createRefactorFixtureBundle(
    overrides: RefactorFixtureBundleOverrides = {},
): RefactorFixtureBundle {
    const folder = createFolderFixture({
        name: "Workspace",
        special: true,
        ...overrides.folder,
    });
    const resource = createTextResourceFixture({
        folderId: folder.id,
        ...overrides.resource,
    });
    const revision = createRevisionFixture({
        resourceId: resource.id,
        ...overrides.revision,
    });
    const projectType = createProjectTypeSpecFixture({
        folders:
            overrides.projectType?.folders ??
            createDefaultProjectTypeFolders(folder.name),
        defaultResources:
            overrides.projectType?.defaultResources ??
            createDefaultProjectTypeResources(folder.name, resource.name),
        ...overrides.projectType,
    });

    return {
        folder,
        resource,
        revision,
        projectType,
    };
}

/**
 * Create the default folder list for project-type fixtures.
 *
 * @param workspaceName - Optional Workspace folder display name.
 * @returns Folder specs preserving the required Workspace-first structure.
 */
function createDefaultProjectTypeFolders(
    workspaceName = "Workspace",
): ProjectTypeSpecFolder[] {
    return [
        { name: workspaceName, special: true },
        { name: "Characters" },
        { name: "Locations" },
    ];
}

/**
 * Create the default resource list for project-type fixtures.
 *
 * @param workspaceName - Optional folder name used by the default resource.
 * @param resourceName - Optional resource display name.
 * @returns Resource specs that align with the default folder structure.
 */
function createDefaultProjectTypeResources(
    workspaceName = "Workspace",
    resourceName = "Chapter 1",
): ProjectTypeSpecResource[] {
    return [
        {
            folder: workspaceName,
            name: resourceName,
            type: "text",
            template: "This is fixture content for refactor guardrail tests.",
        },
    ];
}

/**
 * Generate the next deterministic seed.
 *
 * @returns Seed values reused by the fixture builders.
 */
function nextFixtureSeed(): { id: UUID; index: number; timestamp: string } {
    fixtureSequence += 1;

    return {
        id: createFixtureUuid(fixtureSequence),
        index: fixtureSequence,
        timestamp: new Date(
            FIXTURE_BASE_TIME_MS + fixtureSequence * 60_000,
        ).toISOString(),
    };
}

/**
 * Create a deterministic UUID-like string for test fixtures.
 *
 * @param index - Sequence number to encode.
 * @returns A stable UUID-shaped string.
 */
function createFixtureUuid(index: number): UUID {
    const suffix = index.toString(16).padStart(12, "0").slice(-12);
    return `00000000-0000-4000-8000-${suffix}`;
}
