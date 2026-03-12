---
name: knowledge-tome
description: "Persistent project-memory skill for capturing app codebase intent, goals, decisions, and lessons into structured tome pages in /experiments-nopush. Use when users share specs/design docs, ask to remember/learn/add to tome, provide missing context during implementation, or request durable project knowledge."
metadata:
    author: saboteur-labs
    version: 1.0
    last_updated: 2026-03-11
---

# Knowledge Tome

A skill for durable, token-efficient project memory. It stores high-value context as markdown "pages" in `/experiments-nopush` so future agents can recover intent quickly.

## Canonical Tome Location

- Store pages in: `/experiments-nopush`
- File naming rule: `tome-###-topic-slug.md`
- `###` is a zero-padded incremental number (`001`, `002`, ...)
- If no prior tome pages exist, start at `001`

## Invocation Triggers

Use this skill when any of the following are true:

1. User provides a specification/design/intent document and wants it retained.
2. User prompt starts with (or clearly means):
    - "Add this to the tome..."
    - "Learn this lesson..."
    - "Remember this..."
    - "Don't forget..."
3. Implementation lacks context needed for correct decisions.
4. At the end of a completed task, ask optional, meaningful memory-building questions (must not interrupt core implementation work).

## Invariants (Must Never Be Violated)

1. Any question block must begin exactly with: `Knowledge Tome Asks:`
2. Any proposal/new-page presentation must begin exactly with: `Knowledge Tome presents the following proposal:`
3. If information is unclear, ask clarifying questions before writing a tome page.
4. Use strict-gate behavior: do not write a page until critical ambiguities are resolved.
5. Ask at most 10 clarifying questions in a single clarification round.

## Clarification Protocol

### Step 1: Detect ambiguity

Treat ambiguity as critical if it affects:

- architecture direction
- dependency or package choices
- public API shape
- data model semantics
- acceptance criteria, goals, or constraints
- user preference that changes implementation behavior

### Step 2: Ask high-value questions

- Start with `Knowledge Tome Asks:`
- Prefer concise, targeted, non-overlapping questions
- Ask only what changes outcomes
- Maximum 10 questions per round
- If answers are still unclear, ask follow-up questions (again max 10)

### Step 3: Propose what will be written

Before writing any page, present plan with:

- target filename
- why this memory matters
- compact section outline

This proposal block must begin with: `Knowledge Tome presents the following proposal:`

### Step 4: Decide and write

When enough clarity exists, explicitly state decision to proceed and write a page using `templates/tome-page-template.md`.

## Page Authoring Rules (Token-Efficient)

1. Keep every section dense and information-rich.
2. Prefer bullets over long prose.
3. Encode stable facts, decisions, and rationale; avoid noisy transcript detail.
4. Record assumptions explicitly.
5. Record unresolved questions explicitly.
6. Include user-editable sections for notes, concerns, and corrections.
7. Keep wording human-readable and AI-parseable.

## End-of-Task Optional Learning

After completing unrelated tasks, optionally ask 1-3 meaningful questions that improve future output quality. These questions must:

- be explicitly optional
- not block delivery of current task results
- focus on project intent, preferences, or architecture principles

## Tome Page Workflow

1. Identify candidate knowledge.
2. Clarify unknowns (`Knowledge Tome Asks:`).
3. Present write proposal (`Knowledge Tome presents the following proposal:`).
4. Resolve critical ambiguity.
5. Write page in `/experiments-nopush` using the template.
6. Confirm page path and one-line memory summary.

## References

- Template: `templates/tome-page-template.md`
- Guide: `references/knowledge-tome-guide.md`
