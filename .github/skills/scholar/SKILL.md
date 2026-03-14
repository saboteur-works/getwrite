---
name: scholar
description: "Review assistant that inspects knowledge pages in /experiments-nopush (knowledge-tome). Used  whenever the user prompts the agent in this repo."
metadata:
    author: saboteur-labs
    version: 1.0
    last_updated: 2026-03-13
---

# Scholar

An agent helper skill that MUST be invoked before planning when prior project knowledge may affect decisions. `scholar` reads the canonical tome pages stored by the `knowledge-tome` skill in `/experiments-nopush` and produces a concise `Scholar Summary` that identifies which pages apply and why. If no pages apply, the summary must explicitly report that nothing applied.

## Canonical Tome Location

- Read pages from: `/experiments-nopush`
- Only consider files that match the tome naming rule: `tome-###-*.md`

## Invocation Triggers

This skills should be invoked on every user prompt.

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

1. Enumerate all files in `/experiments-nopush` matching `tome-*.md`.
2. For each page, quickly scan headings and the one-line summary (if present) to decide whether it might affect the current task.
3. If a page may apply, extract a one-sentence rationale and a one-sentence concrete effect on the plan. Prefer short, actionable language.
4. Produce the `Scholar Summary:` block. If none matched, output `Scholar Summary: No tome pages applied.`
5. Only after the `Scholar Summary` is produced may the agent proceed to planning.

## Clarification and Safety

- If the agent cannot determine applicability due to ambiguity in the task or in tome pages, the agent must ask at most 5 targeted clarifying questions before writing the summary.
- Do not modify or create tome pages; `scholar` is read-only with respect to `/experiments-nopush`.

## Examples and Edge Cases

- If a tome page records a decision that directly contradicts the user's immediate instruction, report the conflict in the `Scholar Summary` and ask a clarifying question before planning.
- If a tome page is large, include only the minimal excerpt or one-line summary needed to justify applicability.

## Rationale

Providing a short, machine-parseable summary of relevant historical knowledge ensures plans respect prior intent, reduce rework, and maintain continuity across agent sessions.
