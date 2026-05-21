---
name: write-feature-spec
description: Produces a structured feature specification from a rough idea or brief description. The output is a markdown document suitable for review, task breakdown, and as context for an implementation skill or prompt.
argument-hint: feature name, additional context or description
---

Write a feature spec for the following:

Feature: $0

Additional context: $1

Produce a markdown spec document with these sections:

## Overview

One paragraph. What is this feature and what problem does it solve?
Do not describe how it works yet — only what and why.

## Goals

Bullet list. What should be true when this feature is complete?
Frame as outcomes, not tasks. Maximum 5 goals.

## Non-goals

Bullet list. What is explicitly out of scope for this feature?
Include at least one item — if nothing is out of scope, the feature
is probably under-specified.

## User stories

List of user stories in the format:
"As a [user type], I want to [action] so that [outcome]."
Include only the stories directly addressed by this feature.

## Functional requirements

Numbered list of specific, testable requirements.
Each requirement must be independently verifiable.
Use "must", "should", or "may" to indicate priority (RFC 2119).

## Open questions

Bullet list of unresolved questions that must be answered before or
during implementation. If none, write "None identified."

## Out of scope (deferred)

Bullet list of related features or improvements that are intentionally
deferred to a future iteration.

---

Rules for the entire document:

- Be specific and concrete. Avoid vague language like "improve",
  "enhance", or "better". Prefer "reduce latency by 200ms" over
  "improve performance".
- Do not describe implementation details or technology choices unless
  they are constraints given in the feature description.
- Keep the document under 500 words. If more is needed, the scope is
  likely too large — note this at the top.

## Resolve Open Questions

If there are any open questions in the spec, present the user with 3-5 options for how to resolve each one, along with pros and cons for each option. Wait until the user selects an option before proceeding further. The user can opt to skip any question if they are unsure or want to defer the decision.

If there are no open questions, or after all questions have been resolved, proceed to the next step.

## Save the spec

If the open questions have received answers, write the document to @docs/features/feature-specifications/[feature-name]/[feature-name]-spec.md, where `feature-name` is a kebab-case version of the feature name.

## Follow Up

After you have saved the spec, ask the user if they would like to break it into implementation tasks or if they need to make any edits to the spec. If they want to break it into tasks, invoke the `break-into-tasks` skill with the feature name as an argument. If they want to edit the spec, allow them to provide additional input and update the document accordingly.
