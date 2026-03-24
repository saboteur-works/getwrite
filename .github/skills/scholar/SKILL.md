---
name: scholar
description: "Review assistant that inspects knowledge pages in /experiments-nopush (knowledge-tome). Used whenever planning, implementing a feature, refactoring, or making a decision that may be affected by prior project knowledge."
metadata:
    author: saboteur-labs
    version: 1.1
    last_updated: 2026-03-23
---

# Scholar

An agent helper skill that MUST be invoked before planning when prior project knowledge may affect decisions. `scholar` reads the canonical tome pages stored by the `knowledge-tome` skill in `/experiments-nopush` and produces a concise `Scholar Summary` that identifies which pages apply and why. If no pages apply, the summary must explicitly report that nothing applied.

## Canonical Tome Location

- Read pages from: `/experiments-nopush`
- Only consider files that match the tome naming rule: `tome-###-*.md`

## Invocation Triggers

Invoke `scholar` in exactly these three cases:

1. Starting work on a named feature or component that could have a corresponding tome page.
2. Choosing between competing implementation approaches where a prior decision could exist.
3. Modifying code that is explicitly named in a previous exchange or in a known tome page.

**Do not invoke** for:

1. Bug fixes in working code
2. Adding tests to existing behavior
3. Renaming
4. Formatting
5. Routine maintenance
6. Purely additive work with no pattern choices

## Required Output Format

Every invocation must produce a `Scholar Summary` section before any planning output. The `Scholar Summary` must be a bullet list of applied pages or a single-line statement that nothing applied.

Format rules:

- Begin the block with the exact heading: `Scholar Summary:`
- If one or more pages apply, list each as a bullet with three parts:
    - **File:** path relative to repo (e.g. `/experiments-nopush/tome-002-...md`)
    - **Why it applies:** one short sentence explaining applicability
    - **Effect on plan:** one short sentence stating how it changes or constrains the next action

- Example (when pages apply):

    Scholar Summary:
    - /experiments-nopush/tome-002-app-spec-v1-product-intent.md — Why it applies: clarifies product intent for feature X. Effect on plan: prefer API A over B and add config flag.
    - /experiments-nopush/tome-005-style-guidelines.md — Why it applies: lists token-first UI preference. Effect on plan: use compact component layout.

- Example (when no pages apply):

    Scholar Summary: No tome pages applied.

## Protocol (How to use)

### Phase 1 — Cheap scan (always)

1. List all files in `/experiments-nopush` matching `tome-###-*.md`.
2. Read only filenames and the one-line summary field of each page — do not load full content yet.
3. If no filenames match the current task topic: output `Scholar Summary: No tome pages applied.` and stop. Do not read any file content.

### Phase 2 — Selective load (only when Phase 1 finds matches)

4. Load full content only for pages whose filename or summary matches the current task by topic.
5. Hard cap: load at most 3 pages. If more than 3 match, list the extras by filename in the Scholar Summary without loading their content.
6. For each loaded page, extract a one-sentence rationale and a one-sentence effect on the plan.
7. Produce the `Scholar Summary:` block.
8. Only after the `Scholar Summary` is produced may the agent proceed to planning.

## Clarification and Safety

- If the agent cannot determine applicability due to ambiguity in the task or in tome pages, the agent must ask at most 5 targeted clarifying questions before writing the summary.
- Do not modify or create tome pages; `scholar` is read-only with respect to `/experiments-nopush`.

## Examples and Edge Cases

- If a tome page records a decision that directly contradicts the user's immediate instruction, report the conflict in the `Scholar Summary` and ask a clarifying question before planning.
- If a tome page is large, include only the minimal excerpt or one-line summary needed to justify applicability.

## Rationale

Providing a short, machine-parseable summary of relevant historical knowledge ensures plans respect prior intent, reduce rework, and maintain continuity across agent sessions.
