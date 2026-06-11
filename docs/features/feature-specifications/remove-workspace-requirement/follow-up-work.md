# Follow-up Work: Remove Workspace Requirement

Deferred items discovered while implementing the spec. Each entry notes why it
was deferred and any context for a future pass.

---

## 2026-06-11 — Project Types manager has no validation feedback after guardrail removal

**Context:** Task 4 removed the "Workspace guardrail warning" banner from
`frontend/components/project-types/ProjectTypesManagerPage.tsx`. That banner was
rendered from `validateDraft(selectedItem.definition)` and, despite its title,
surfaced *all* schema errors (e.g. invalid `id` pattern, empty `folders`), not
just the Workspace requirement.

**Why deferred:** FR7 explicitly requires removing the Workspace guardrail
warning, and the spec is scoped to removing the Workspace requirement — not to
designing a replacement validation-feedback UI. The manager page currently has
no explicit "Save"/commit action, so nothing depended on the banner to gate a
write.

**Follow-up:** If/when the manager gains an explicit save/commit action,
re-introduce schema-validation feedback (using `validateDraft`, which still
exists and still reports schema errors) as a generic "Invalid project type"
surface — not tied to any required folder name.
