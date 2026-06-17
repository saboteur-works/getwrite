# Conventions reference

This file is loaded by the `implement-feature` skill on demand when the
agent needs project-specific naming, file structure, or code style conventions.

Fill this in with the actual conventions from your project. Pull from your
existing style guide, linter config comments, or code review feedback.
Conventions that contradict common defaults are the most valuable to document
here — the agent already knows standard practices.

---

## Naming

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- Variables: `camelCase`; `UPPER_CASE` for constants; `PascalCase` for values
  that hold a component or factory.
- Functions: `camelCase`, or `PascalCase` for component/factory functions.
- Types, interfaces, enums, classes, type params: `PascalCase`. Interfaces
  must **not** use an `I` prefix (`Foo`, never `IFoo`).

**Booleans must read as predicates (enforced, type-aware).** A boolean
**variable** must start with one of `is | has | should | can | did | will`
(e.g. `isOpen`, `shouldIncludeHeaders`, `hasLeaves`). This is enforced by
`@typescript-eslint/naming-convention` with a `types: ["boolean"]` selector,
so it needs type information — it is active for typed source and disabled for
scripts / `.storybook`. A plain name like `includeHeaders` or `checked` is a
lint **error**.

**The boolean rule targets `variable`, not properties.** Object-literal and
interface/type **member** names are exempt — `interface CompileOptions {
includeHeaders: boolean }` is fine, and so is a `{ includeHeaders }` field.
This matters when renaming a local that is also used as an object shorthand:
rename the variable (`shouldIncludeHeaders`) but keep the property name, i.e.
convert `{ includeHeaders }` to `{ includeHeaders: shouldIncludeHeaders }`.
Renaming the property itself would change a typed shape.

---

## File and directory structure

The repo-root `CLAUDE.md` is authoritative for workspace layout, the
`frontend/` structure, and the model-layer "Code Map" — read it rather than
relying on a copy here. In brief: pnpm workspace with `frontend/`, `electron/`,
`cli/`; the filesystem-backed data layer lives in `frontend/src/lib/models/`;
Redux store in `frontend/src/store/`; App Router pages + API routes in
`frontend/app/`; components in `frontend/components/`; tests in
`frontend/tests/` (Vitest) and `frontend/e2e/` (Playwright vs. Storybook).

---

## Code style

- `docs/standards/typescript-implementation.md` is authoritative: no `any`,
  explicit types, pure functions, single responsibility. `no-explicit-any` is
  currently a **warning** (extensive pre-existing usage being paid down), not
  an error — but do not add new `any`.
- **lodash must use path imports** — `import debounce from "lodash/debounce"`,
  not `import { debounce } from "lodash"`. Enforced via `no-restricted-imports`
  to avoid pulling the whole package into the bundle.
- Comments explain *why*, not *what*. Do not delete comments on working code
  when refactoring; reducing comment count is never a goal.
- Prettier formats on commit via lint-staged, so don't hand-fight formatting.
- Note: the repo-wide `pnpm lint` currently has pre-existing baseline errors in
  many files. When you touch a file, leave **that file** lint-clean (fix any
  clarity-level baseline issues in it, e.g. the boolean-naming renames above);
  don't take on unrelated files.

---

## Import order and aliasing

No `@/`-style path alias is in use — modules import each other with relative
paths (e.g. an API route reaches the model layer via
`../../../../src/lib/export/section-loader`). Match the relative-path style of
the file you are editing. See the lodash path-import rule under Code style.

---

## Git and commit conventions

- Conventional Commits with a scope: `feat(...)`, `fix(...)`, `refactor(...)`,
  `docs(...)`, `chore(...)` — e.g. `refactor(compile-export): unify route
  section-loading`.
- A `lint-staged` pre-commit hook runs Prettier (and only matches `*.{ts,tsx}`),
  so commits touching only docs/markdown skip it.
- Branches: `<type>/<short-description>`, e.g. `refactor/brevity-and-clarity`.
- End commit messages with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
