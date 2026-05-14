---
description: Write an Architecture Decision Record
---

Write an Architecture Decision Record for the following decision.

Decision: {{DECISION}}

Context:
{{CONTEXT}}

Options considered:
{{OPTIONS}}

Write the ADR in this format:

# ADR-NNN: {{DECISION_TITLE}}

**Date:** {{DATE}}
**Status:** Accepted

## Context

What is the situation or problem that necessitated this decision? Include
relevant constraints, requirements, and the state of the system at the
time of the decision. Do not describe the decision itself here — only the
circumstances that made it necessary.

## Options considered

For each option provided, write a subsection:

### Option N: [option name]

[One paragraph describing the option]
**Pros:** [bullet list]
**Cons:** [bullet list]

## Decision

State the decision made in one sentence. Then explain the reasoning:
why this option over the others? What factors were most important?

## Consequences

### Positive

[Bullet list of beneficial outcomes of this decision]

### Negative

[Bullet list of costs, trade-offs, or risks accepted by this decision.
Be honest — every decision has costs. An ADR with no negative consequences
is incomplete.]

### Neutral

[Bullet list of things that change but are neither clearly good nor bad]

## Revisit conditions

Under what circumstances should this decision be revisited? What would
have to be true for a different choice to become correct?

Rules:

- Be specific and concrete. "Better performance" is not useful.
  "Reduces p99 latency on the export endpoint from ~2s to ~200ms" is.
- The Negative consequences section must be non-empty. Every decision
  has costs.
- Write in past tense for Context (what was true), present tense for
  Consequences (what is now true as a result).
- Do not use jargon without defining it.
