---
name: break-into-tasks
description: Breaks a feature specification into an implementation task list. The output is a markdown document suitable for review, task tracking, and as context for an implementation skill or prompt.
argument-hint: feature spec
---

Break the following feature spec into an implementation task list.

Spec:
$1 OR [the content of the file at @docs/features/feature-specifications/[feature-name]/[feature-name]-spec.md, where `feature-name` is a kebab-case version of the feature name]

Granularity: story points (1/2/3/5/8)

Rules for each task:

1. Each task must be executable in a single focused session — one concern,
   one area of the codebase, one logical unit of work.
2. Each task must have a clear done condition: a specific, verifiable state
   that is unambiguously true or false.
3. Tasks must be ordered by dependency — a task that depends on another
   comes after it.
4. Do not create tasks for things outside the spec's functional requirements.
   Non-goals stay non-goals.

Output format — one entry per task:

### Task N: [short title]

**What:** [one sentence — what this task produces]
**Files:** [files to create or modify, or "TBD if unknown"]
**Done when:** [specific, verifiable condition]
**Depends on:** [task numbers this task requires, or "none"]
**Estimate:** [story points (1/2/3/5/8) — your estimate for this task]
**Notes:** [assumptions, risks, or implementation hints. Omit if none.]
**Done:** [checkbox to track completion]

After the task list, add:

## Summary

- Total tasks: N
- Total estimated effort: [sum]
- Critical path: [the sequence of dependent tasks that determines minimum
  elapsed time, e.g. "Tasks 1 → 3 → 5 → 6"]
- Risks: [any tasks with high uncertainty or dependency risk]

---

When complete, write the document to @docs/features/feature-specifications/[feature-name]/tasks.md, where `feature-name` is a kebab-case version of the feature name.

## Follow Up

After the task list has been saved, ask the user if they would like to:

- Proceed with implementation, if story points are 8 or less and no high-risk tasks. If so, invoke the `implement-feature` skill with the task list as context.
- Review and adjust estimates or dependencies, if there are any concerns about the task breakdown. If so, allow the user to specify changes and then update the task list and summary accordingly.
