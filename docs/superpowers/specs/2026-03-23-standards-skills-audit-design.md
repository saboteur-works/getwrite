# Standards & Skills Audit — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Context

GetWrite uses a multi-agent setup: GitHub Copilot, Claude Code, and local LLMs. The project was bootstrapped with GitHub SpecKit. Standards in `docs/standards/` serve as the shared authority layer across all agents. Skills in `.github/skills/` are Copilot-specific activation wrappers.

The goal of this audit is to:
- Reduce redundancy and context load across all agents
- Tighten standards that are too thin to be actionable
- Constrain skills that conflict with project-specific guidance
- Refine shared memory invocation to reduce per-session cost

## Authority Model

- `docs/standards/` — single source of truth for *what* to do; agent-agnostic
- `.github/skills/` — thin invocation wrappers for Copilot; reference standards, do not restate them
- `STYLING.md` — authoritative design system; all UI decisions defer to it first

---

## Changes

### 1. Documentation Consolidation

**Problem:** Documentation guidance is split across three locations with overlapping content:
- `docs/standards/code-documentation.md`
- `.github/skills/code-documentation/references/javascript-typescript.md`
- `typescript-implementation.md` Section 9 ("Code Document Discipline")

**Changes:**

**`docs/standards/code-documentation.md`** — expand to become the single authority. Absorb content from the skill reference file. Must cover:
- Scope declaration (applies when creating or modifying source code files)
- `@module` JSDoc tag + description at top of every file
- All functions, types, and interfaces preceded by a docstring (purpose, `@param`, `@returns`, `@throws` where applicable)
- All type/interface properties documented, including implicit ones (`name`, `id`, etc.)
- Inline comments for non-obvious logic
- Usage example in docstrings where practical
- Last-updated timestamp format: `//Last Updated: YYYY-MM-DD` at top of file (no space after `//` — matches existing skill usage; this is the canonical form)

**`typescript-implementation.md` Section 9** — remove entirely (2 lines). The standard is now authoritative.

**`.github/skills/code-documentation/SKILL.md`** — replace body with a thin wrapper:
- Trigger declaration
- Reference to `docs/standards/code-documentation.md` as the authority
- Brief ordered workflow (understand → identify → assess → write → review) without restating rules

**`.github/skills/code-documentation/references/javascript-typescript.md`** — delete. Content absorbed into standard.

---

### 2. Testing Standard

**Problem:** `docs/standards/testing.md` is 3 lines — a node version, CWD requirement, and test command. Not actionable enough to prevent agents from guessing incorrectly.

**Changes:**

Rewrite `docs/standards/testing.md` as an agent-agnostic standard. The existing file uses Copilot-specific framing ("Copilot MUST...") and a Copilot-specific title — both must be replaced with neutral imperative language consistent with the rest of `docs/standards/`.

The rewritten file must cover:

- **Environment** — run `nvm use 22.16.0` before any test command; CWD must be repo root
- **Commands** — canonical commands:
  - Watch mode: `pnpm test`
  - CI / single pass: `pnpm test:ci`
  - Targeted by file: `pnpm test:ci <filename-without-extension>` (from repo root)
  - E2E: `pnpm test:e2e` (requires Storybook running on port 6006 first)
- **Test file locations** — unit/integration: `tests/`, `src/tests/unit/`; E2E: `e2e/`
- **Scope rules** — unit tests cover models, schemas, utilities; component tests cover UI in isolation; E2E tests require Storybook running

Style: bullet lists only, no prose, no agent-specific imperative voice. Any agent reading this must be able to run any test correctly on first attempt.

---

### 3. Frontend Design Skill — Brand Deference

**Problem:** `frontend-design/SKILL.md` instructs the agent to make unconstrained creative aesthetic choices (custom fonts, novel palettes, varied aesthetics). This conflicts with GetWrite's locked design system.

**Changes:**

Insert a brand-deference preamble at the top of the skill body (before the existing Design Thinking section). The preamble:

1. Instructs the agent to load `STYLING.md` before making any aesthetic decision
2. Declares the following as non-negotiable (sourced from `STYLING.md`):
   - **Typography:** IBM Plex Sans (UI), IBM Plex Mono (code), IBM Plex Serif (editor body only) — no substitution
   - **Color:** use existing brand tokens (`black`, `white`, `red`, `mid`, `surface` variants) — no new colors
   - **Red:** reserved for position/canonical state only — never actions, never decorative
   - **Editor line height:** 1.8+ minimum (`--leading-relaxed`)
   - **Theming:** dark/light mode via existing CSS token system only
   - **Surfaces:** flat — elevation communicated through surface color only; no drop shadows anywhere
   - **No decorative overlays:** gradient meshes, noise textures, and decorative overlays are explicitly prohibited (see `STYLING.md` Section 9)
   - **Motion:** `150ms ease` for color/border/opacity; `200ms ease` for layout transitions — no other timing values without explicit reason
3. Declares fallback: when `STYLING.md` does not cover a scenario (component layout decisions, iconography style, interaction choreography), the existing creative judgment rules from the skill body apply in full. The fallback applies only to genuine gaps — it does not override any rule stated in `STYLING.md`, including the anti-patterns in Section 9.

No changes to the existing skill body beyond the preamble insertion.

---

### 4. Scholar — Invocation Refinement

**Problem:** `scholar` invocation triggers are too broad ("any situation where prior intent could affect the outcome"), causing it to run too frequently and load too much context.

**Changes:**

**Invocation triggers** — scholar runs in exactly three cases:
1. Starting work on a named feature or component that could have a corresponding tome page
2. Choosing between competing implementation approaches where a prior decision could exist
3. Modifying code that is explicitly named in a previous exchange or known tome page

Scholar does **not** run for (six skip conditions):
1. Bug fixes in working code
2. Adding tests to existing behavior
3. Renaming
4. Formatting
5. Routine maintenance
6. Purely additive work with no pattern choices

**Cheap scan model** — the existing Protocol section (steps 1–5) in `scholar/SKILL.md` is to be **replaced** (not appended to) with the following:
1. Read only filenames and the one-line summary field of each tome page
2. Load full content only for pages that match the current task by topic
3. Hard cap: load at most 3 pages per invocation
4. If more than 3 match, list extras by filename in the Scholar Summary without loading content

**No-op fast path** — if no filenames match on scan, output `Scholar Summary: No tome pages applied.` immediately without reading file content.

**`knowledge-tome` is unchanged** — writing behavior, invariants, page format, and canonical location (`/experiments-nopush`) are untouched.

---

## No Changes

| Item | Reason |
|---|---|
| `make-skill-template` | Generic, well-structured, no GetWrite-specific conflicts |
| `knowledge-tome` skill | Writing side untouched; only scholar's reading behavior changes |
| `storybook-implementation.md` | Appropriately thin; rules are narrow and complete |
| `package-selection.md` | Comprehensive and well-structured; no issues found |
| `template-integrity.md` | Comprehensive and well-structured; no issues found |

---

## Acceptance Criteria

- [ ] `code-documentation.md` contains all documentation rules from all three previous sources
- [ ] `typescript-implementation.md` Section 9 is removed
- [ ] `code-documentation` skill SKILL.md is ≤30 lines and contains no duplicate rules
- [ ] `javascript-typescript.md` reference file is deleted
- [ ] `testing.md` covers environment, all four command variants, file locations, and scope rules
- [ ] `frontend-design` skill preamble explicitly cites `STYLING.md` and lists all non-negotiable brand constraints
- [ ] `scholar` invocation section lists exactly three trigger conditions and all six skip conditions
- [ ] `scholar` documents the cheap scan model and 3-page hard cap
