Migration path: Replace deprecated `Project` / `Resource` types

This document lists all files that still import the deprecated UI types from `frontend/lib/types.ts` and provides an exhaustive, per-file set of steps to migrate them to the canonical models in `frontend/src/lib/models/types.ts` (or to adapt placeholder data where appropriate).

Summary of deprecated symbols

- `Project` (deprecated): defined in `frontend/lib/types.ts` and includes an embedded `resources: Resource[]` array. Use `Project` from `frontend/src/lib/models/types.ts` (canonical) instead.
- `Resource` (deprecated): defined in `frontend/lib/types.ts`. The canonical models use `ResourceBase` / `TextResource` / `AnyResource` and separate `Folder` models.

High-level migration notes

- Replace imports from `../../lib/types` with types from `../../src/lib/models/types` (relative paths may vary by file).
- Map fields and enums between the deprecated and canonical shapes (see mapping table below).
- The canonical `Project` no longer embeds `resources`; update components to accept resources separately or use the project's adapter utilities (example: `buildProjectView`) to produce folder/resource views.
- Update placeholder generators (e.g., `frontend/lib/placeholders.ts`) to return canonical models or provide an adapter layer used by storybook/test fixtures.

Type mapping (quick reference)

- Resource.title -> TextResource.name
- Resource.parentId -> Folder.folderId equivalent -> canonical resources use `folderId` (rename usages)
- Resource.projectId -> canonical `Project.id` (resources do not carry `projectId` by default — pass project id where needed)
- Resource.type values: mapping from deprecated -> canonical
    - "document" | "scene" | "note" -> `text`
    - "folder" -> modelled as `Folder` in canonical types (not a resource type)
    - image/audio not represented in deprecated enum — verify usages
- Resource.content -> For text resources use `plainText` or `tiptap` on `TextResource`
- Resource.metadata (deprecated structured object) -> `metadata?: Record<string, MetadataValue>` on canonical resources; migrate fields into `metadata` keys or `notes`/`statuses` according to component needs.

Files that import deprecated types (exhaustive scan)

- frontend/components/Layout/AppShell.tsx
- frontend/components/common/CompilePreviewModal.tsx
- frontend/components/WorkArea/OrganizerCard.tsx
- frontend/components/WorkArea/OrganizerView.tsx
- frontend/components/WorkArea/ViewSwitcher.tsx
- frontend/components/WorkArea/TimelineView.tsx
- frontend/components/WorkArea/DataView.tsx
- frontend/components/Sidebar/MetadataSidebar.tsx
- frontend/components/Layout/SearchBar.tsx
- frontend/components/Tree/CreateResourceModal.tsx
- frontend/components/Tree/ResourceTree.tsx
- frontend/components/Start/CreateProjectModal.tsx
- frontend/components/Start/ManageProjectMenu.tsx
- frontend/components/Start/StartPage.tsx
- frontend/app/page.tsx
- frontend/lib/placeholders.ts
- frontend/stories/CompilePreviewModal.stories.tsx
- frontend/stories/Layout/SearchBar.stories.tsx
- frontend/stories/AppShell.stories.tsx

Per-file migration steps

General steps that apply to most files

1. Replace import lines that reference the deprecated types. Example:
    - from: `import type { Project, Resource } from "../../lib/types";`
    - to: `import type { Project as CanonicalProject, AnyResource, TextResource, ResourceBase } from "../../src/lib/models/types";`
2. Determine the specific canonical resource type your component operates on:
    - If the component only renders textual content, use `TextResource`.
    - If it only needs base fields (id/name/createdAt/metadata), use `ResourceBase` or a local `UIResource` mapping.
3. Update property accesses in the file to the canonical field names (see mapping table): `.title` -> `.name`, `.parentId` -> `.folderId`, `.content` -> `plainText`/`tiptap`, etc.
4. If a component expects `Project.resources`, stop using that array; instead either:
    - Accept a `resources?: AnyResource[]` prop (preferred), or
    - Use an adapter: convert the canonical `Project` + `Folder` model into the tree structure your UI expects (or call `buildProjectView` where available).
5. Update placeholder generation and story fixtures to produce canonical shapes (or add thin adapters in test/story code to convert old placeholders to the canonical format).

File-specific guidance

- frontend/components/Layout/AppShell.tsx
    1. Replace `import type { Resource, ViewName } from "../../lib/types";` with `import type { AnyResource, TextResource, ResourceBase, ViewName as ViewNameType } from "../../src/lib/models/types";` (or only import the precise types you need).
    2. `AppShell` currently already consumes the canonical `Project` via `src/lib/models/types` in some locations — ensure all `resources` that are passed into `AppShell` are canonical. If upstream leaves placeholder `Resource[]` (deprecated shape), convert them at the boundary (create a small `migratePlaceholderResource()` util that maps deprecated fields to `TextResource`).
    3. Update all `.title` usages to `.name` (e.g., building `preview` strings), and `.parentId` to `.folderId` where tree manipulation occurs.
    4. ResourceType usage (create modal payload) should align to `TextResource.type === "text"` — update code that forwards `ResourceType` strings (or map values when creating resources).

- frontend/components/common/CompilePreviewModal.tsx
    1. Replace `Resource` import with `AnyResource` or `TextResource` depending on usage.
    2. If the modal expects `content` on the resource, read `plainText` or `tiptap` from `TextResource`.
    3. Update `projectId`-based assumptions: pass canonical `project.id` separately when needed.

- frontend/components/WorkArea/OrganizerCard.tsx
    1. Switch import to `AnyResource`/`TextResource`.
    2. Rename `title` -> `name` in rendering markup and ARIA labels.

- frontend/components/WorkArea/OrganizerView.tsx
    1. Import canonical resource types and update the `resources: Resource[]` prop to `resources: AnyResource[]` (or `TextResource[]` if only text).
    2. Ensure the child `OrganizerCard` accepts the same canonical type.

- frontend/components/WorkArea/ViewSwitcher.tsx
    1. `ViewName` is still a small union; confirm whether `ViewName` lives in `lib/types` or `src/lib/models/types`. If `ViewName` is not in canonical types, keep a local `ViewName` definition or migrate to the shared view-name type if provided.

    Note: `ViewName` has been added to the canonical models. Import it from `frontend/src/lib/models/types` as `ViewName` to use the shared definition.

- frontend/components/WorkArea/TimelineView.tsx
    1. Replace `Project, Resource` import with `Project as CanonicalProject, AnyResource`.
    2. `TimelineView` historically accepted `project?: Project` with embedded `resources`; canonical `Project` does not include `resources`. Change the API to either accept `resources?: AnyResource[]` or accept a `projectView` produced by `buildProjectView`.
    3. Update any date parsing to use `resource.createdAt` (same property name) and reconcile `.title` -> `.name` where labels are shown.

- frontend/components/WorkArea/DataView.tsx
    1. Similar to `TimelineView`: stop relying on `Project.resources`. Accept `resources?: AnyResource[]` or load resources from a provided adapter.
    2. Replace imports and update type annotations accordingly.

- frontend/components/Sidebar/MetadataSidebar.tsx
    1. Replace `Resource` import with `ResourceBase`/`TextResource`. Update accessors to `resource?.notes` or `resource?.metadata?.notes` depending on canonical field choices.
    2. Convert metadata fields (`status`, `characters`, `locations`, `items`, `pov`, `notes`) into the canonical `metadata` shape; decide on key names and update the controls to read/write into `resource.metadata["notes"]` or into the top-level `notes`/`statuses` fields on `ResourceBase` if appropriate.

- frontend/components/Layout/SearchBar.tsx
    1. Import canonical resource types and rename `.title` -> `.name` in search snippets.

- frontend/components/Tree/CreateResourceModal.tsx
    1. Replace `ResourceType, Resource` import with canonical types and/or a UI `ResourceType` union that maps to canonical `ResourceType` values.
    2. Where the modal creates a new resource, map the deprecated `ResourceType` strings to canonical `TextResource` type and populate fields such as `name`, `createdAt`, and `metadata`.

- frontend/components/Tree/ResourceTree.tsx
    1. Use `Folder` and `AnyResource` canonical types; update tree-building code to use `folderId` instead of `parentId` (or adapt the data prior to rendering).

- frontend/components/Start/CreateProjectModal.tsx
    1. Replace imports for `Project` with canonical `Project` from `src/lib/models/types` if the modal only emits creation payloads (no full `Project` object). Keep the emitted payload shape minimal and have the calling code create a canonical `Project` instance.

- frontend/components/Start/ManageProjectMenu.tsx
    1. Replace `Resource` import and update `resources?: Resource[]` prop to `resources?: AnyResource[]`.
    2. Update the packaging flow (`onPackage`) to accept canonical resource ids and use canonical project id rather than expecting `project.resources` embedded content.

- frontend/components/Start/StartPage.tsx
    1. `StartPage` currently uses `sampleProjects()` from `frontend/lib/placeholders.ts`. Update `sampleProjects` to return canonical `Project[]` (without embedded `resources`) or return a paired structure `{ project: Project; resources: AnyResource[] }`.
    2. Update `StartPage` props and the parent `app/page.tsx` to handle the new shape (pass resources separately or adapt to the canonical project model).

- frontend/app/page.tsx
    1. Replace `import type { Project, Resource } from "../lib/types";` with canonical imports.
    2. Update state shapes: if you keep `projects` as placeholder projects, they must be canonical `Project` shapes (no embedded resources) or you must maintain a `resourcesByProject` map.
    3. When creating/updating resources via `createResource`, migrate the helper to produce canonical `AnyResource` objects, or convert before setting UI state.

- frontend/lib/placeholders.ts
    1. This file is a source of deprecated shapes. Either:
        - Rewrite this file to produce canonical `Project` and `AnyResource` values (preferred), or
        - Add a new adapter `migratePlaceholderProject(old: Project): { project: CanonicalProject; resources: AnyResource[] }` and use that adapter in storybook/pages until placeholders are fully migrated.
    2. Update `createResource`, `createProject`, and `sampleProjects` signatures and return types.

- frontend/stories/\*.stories.tsx (CompilePreviewModal.stories.tsx, Layout/SearchBar.stories.tsx, AppShell.stories.tsx)
    1. Update story fixtures to use canonical types. If the stories rely on `frontend/lib/placeholders`, migrate those utilities first or wrap the returned data with an adapter function used by stories only.

Testing and validation

1. After migrating types in a file, run TypeScript type-check and the frontend tests (Vitest + Storybook build) locally to catch conversions where fields were renamed.
2. Prefer small iterative commits: migrate one component and its stories/placeholders, verify build/tests, then proceed to the next.

Suggested rollout strategy (safe, low-risk)

1. Add adapter helpers in `frontend/src/lib/adapters/placeholderAdapter.ts` with functions:
    - `migrateResource(old: DeprecatedResource): AnyResource`
    - `migrateProject(old: DeprecatedProject): { project: CanonicalProject; resources: AnyResource[] }`
      Keep these helpers small and well-tested.
2. Update `frontend/lib/placeholders.ts` to call these adapters (or rewrite it to return canonical shapes directly).
3. Gradually replace imports in components to canonical types and remove the adapter once everything is migrated.

## Second-pass findings

I ran a second-pass scan for any remaining references (imports, type annotations, parameters, variables, and story/test fixtures) to the deprecated UI types. The scan confirmed the original exhaustive set and also surfaced additional indirect references that should be included in the migration work:

- Additional component/helpers to check:
    - frontend/components/Tree/ResourceContextMenu.tsx
    - frontend/components/common/ConfirmDialog.tsx
    - frontend/components/common/ExportPreviewModal.tsx
    - frontend/src/store/projectsSlice.ts (and any selectors/serializers that assume embedded `resources`)
    - frontend/tests/\*\* (unit tests referencing `Resource`/`Project` fixtures)
    - frontend/e2e/\*\* (playwright flows that reference `title`/`parentId` fields)
    - Any Storybook stories or fixtures not under `frontend/lib/placeholders.ts` (ad hoc fixtures inside stories)

Additionally, the scan found numerous inline usages where code references the deprecated field names directly (for example `resource.title`, `resource.parentId`, `resource.content`, `ResourceType` string literals like `document|scene|note`) and small unions used in UI code (`ViewName`). These will need either mapping/adaptation or a shared canonical definition.

If you want the exact file-by-file scan output I used, run this from the repo root to reproduce:

```bash
grep -Rn "from ['\"]\./\./lib/types['\"]\|import type .*Resource\|import type .*Project\|\bViewName\b" frontend || true
```

Run the same grep for `resource.title` / `resource.parentId` patterns to find property-level usage:

```bash
grep -Rn "resource\.title\|resource\.parentId\|resource\.content" frontend || true
```

## Removal checklist (pre-merge)

Before removing `frontend/lib/types.ts` and other deprecated code, complete the following checklist to avoid breakage and make the removal reviewable and reversible:

1. Migrate and type-check
    - Convert all imports from `frontend/lib/types` to canonical types or adapter-returned shapes.
    - Replace usages of deprecated fields (`title`, `parentId`, `content`, etc.) with canonical field names (`name`, `folderId`, `plainText`/`tiptap`).
    - Update function and prop signatures that accept `Project`/`Resource` to accept `Project & resources?: AnyResource[]` or split `project` + `resources` parameters.
    - Run a full TypeScript check in `frontend`:

```bash
cd frontend
pnpm install --frozen-lockfile --silent
pnpm exec tsc --noEmit
```

2. Update tests and stories
    - Update all Vitest tests and Storybook stories to use canonical fixtures or to call the adapter helpers that produce canonical shapes.
    - Run tests and Storybook build:

```bash
pnpm exec vitest run
pnpm exec storybook build
```

3. Centralize/adapter placeholders
    - Ensure `frontend/lib/placeholders.ts` either returns canonical shapes or clearly delegates to `src/lib/adapters/placeholderAdapter.ts`.
    - Update stories to import placeholders from the canonical/adapter-exporting module.

4. Verify there are no remaining references
    - Re-run the grep checks above and confirm zero matches for imports from `frontend/lib/types` and zero usage of deprecated field names in source/tests/stories.

5. Remove deprecated artifacts (single commit)
    - Create a focused commit that removes:
        - `frontend/lib/types.ts`
        - (optionally) `frontend/lib/placeholders.ts` if replaced or migrated — otherwise update it to only use canonical shapes and keep it.
    - Remove any re-exports or barrel files that previously surfaced the deprecated types.
    - Run `pnpm exec tsc --noEmit` and `pnpm exec vitest run` again to validate the deletion.

6. Documentation and PR notes
    - Update `specs/003-add-project-types/migration-path.md` (this file) to document the removal commit and the grep checks used to validate removal.
    - Open a PR with the migration + removal commit(s), include links to the migration doc, and request reviewers to run the grep checks locally.

7. Optional: staged removal
    - If you prefer lower-risk, perform removal in two PRs: (A) migrate all usages to canonical types and add adapter shims; (B) remove deprecated files. Include a short window between PRs for CI to validate.

After removal, run the full test suite and CI pipelines before merging to main.

## Appendix: Remaining source references (current grep results)

The following source files (non-build artifacts) still reference the deprecated UI types or deprecated field names. Use this list to guide targeted edits and tests.

Imports from `frontend/lib/types` (source files)

- frontend/components/common/CompilePreviewModal.tsx
- frontend/components/Layout/SearchBar.tsx
- frontend/components/Start/ManageProjectMenu.tsx
- frontend/components/Tree/CreateResourceModal.tsx
- frontend/components/Tree/ResourceTree.tsx
- frontend/components/WorkArea/DataView.tsx
- frontend/components/WorkArea/OrganizerCard.tsx
- frontend/components/WorkArea/OrganizerView.tsx
- frontend/components/WorkArea/TimelineView.tsx
- frontend/components/Start/CreateProjectModal.tsx
- frontend/components/Start/StartPage.tsx
- frontend/stories/CompilePreviewModal.stories.tsx
- frontend/stories/AppShell.stories.tsx
- frontend/stories/Layout/SearchBar.stories.tsx
- frontend/tests/searchBar.test.tsx
- frontend/tests/resourceTreeContextMenu.test.tsx
- frontend/tests/createResourceModal.test.tsx
- frontend/tests/compilePreviewModal.test.tsx

Inline/dynamic type imports found (source)

- frontend/components/Layout/AppShell.tsx uses `import("../../lib/types").ResourceType` (replace with explicit canonical import)

Property-level usages to remap (examples)

- frontend/stories/WorkArea/DataView.stories.tsx: `resources: project.resources`
- frontend/app/page.tsx: multiple `selectedProject.resources` usages
- frontend/tests/timelineView.test.tsx and frontend/tests/dataView.test.tsx: test assertions referencing `project.resources`
- Many components reference `resource.title`, `resource.parentId`, `resource.content`, and `resource.metadata` — see files above for specifics.

Notes

- Ignore build artifacts (directories like `.next/`, `storybook-static/`, `dist/`) when verifying; those contain inlined source and will show up in greps.

Short-term next steps

- Add this appendix (the list above) to the PR so reviewers can validate each change.
- Produce a machine-readable list (JSON/CSV) of these source matches and attach it to the PR for automated verification.
- Implement a minimal `projectsSlice` normalization shim and `src/lib/adapters/placeholderAdapter.ts` scaffold as the low-risk first migration PR.

Once you confirm, I can either generate the machine-readable file now or scaffold the adapter+shim and run the type check/tests.

## Additional gaps discovered (final pass)

The second-pass grep surfaced a few more actionable items to include in the migration path:

- Tests and fixtures: several Vitest tests and story fixtures reference `Project.resources` and `resource.title` directly (examples: `frontend/tests/*`, `frontend/stories/Tree/ResourceTree.stories.tsx`, `frontend/stories/WorkArea/DataView.stories.tsx`). Update fixtures to use adapter-returned canonical shapes or update assertions to use canonical fields.
- Inline/dynamic type imports: some code uses `import("../../lib/types").ResourceType` or similar inline import expressions (noted in `AppShell.tsx`). These must be updated to import canonical types explicitly to avoid lingering type references.
- Store & persisted data: `frontend/src/store/projectsSlice.ts` stores `resources?: ResourceMeta[]` and selectors/tests assume `project.resources`. Add a store-shape migration plan and a persisted-state migration helper for existing user data.
- CLI / packaging / export code: check `dist-cli/`, `src/cli/`, and any packaging/export code that may serialize `Resource`/`Project` shapes and update export/import formats.
- Generated/build artifacts: compiled outputs under `.next/`, `storybook-static/` and `*.tsbuildinfo` contain inlined sources referencing the old types; these are build artifacts and should be excluded from grep checks. Add an exclusion note to the verification steps.

### What to add to the migration steps

- Add a `Store & Data Migration` section with:
    - A migration helper that converts persisted `projects` state (localStorage, indexed DB, backend snapshots) from `{ resources?: { id, metadata }[] }` to the canonical `folders/resources` shape (or document the planned persisted shape).
    - Unit tests for the migration helper and an integration smoke test that upgrades a sample project file.
    - A short-lived compatibility layer in `projectsSlice` that accepts the old `resources` array and normalizes it on read.

- Add an `Inline Imports & Type Expressions` note that instructs maintainers to replace `import("../../lib/types").X` with explicit imports from `src/lib/models/types`.

- Add an `API / CLI / Export` checklist: audit `dist-cli/`, `src/cli/`, any `api` routes, and packaging/export code for serialization of deprecated shapes and add migration scripts where necessary.

- Add a `Generated Artifacts` note: exclude `.next/`, `storybook-static/`, and other build outputs from grep checks, then re-run the verification grep against source files only.

### Grep commands to run (exclude build artifacts)

```bash
# find imports from the deprecated file (ignore build artifacts)
grep -Rn --exclude-dir={.next,dist,storybook-static,node_modules} "from ['\"]\([^'\"]\)*/lib/types['\"]" frontend || true

# find inline/dynamic type imports
grep -Rn --exclude-dir={.next,dist,storybook-static,node_modules} "import(.*lib/types" frontend || true

# find field-level usages that must be remapped
grep -Rn --exclude-dir={.next,dist,storybook-static,node_modules} "resource\.title\|resource\.parentId\|resource\.content\|project\.resources" frontend || true
```

Run these commands and attach the results to the PR for reviewer verification.

If you want, I can:

- open a PR with the `migration-path.md` (this file) and the adapter scaffolding, or
- start migrating components one-by-one (I recommend starting with `frontend/lib/placeholders.ts` and `app/page.tsx`).

---

Generated by repository scan on 2026-02-22 — exhaustive for files under `frontend/` that directly import from `frontend/lib/types.ts` at the time of scan.
