---
name: estimate-complexity
description: Assesses the complexity and risk of a given work item. The output is a structured markdown document suitable for review, task tracking, and as context for an implementation skill or prompt.
argument-hint: work description, codebase context, estimation scale
---

Assess the complexity and risk of the following work.

Work description:
$1

Estimation scale: $2

Codebase context:
$3

Produce a structured assessment:

## Complexity estimate

**Estimate:** [your estimate on the $2 scale]
**Confidence:** [high / medium / low]

**Reasoning:**
[2–4 sentences explaining the key factors driving the estimate. Be specific
about what makes this work more or less complex.]

## Risk factors

For each risk, rate it: [high / medium / low] likelihood × impact.

| Risk               | Likelihood | Impact | Notes                                    |
| ------------------ | ---------- | ------ | ---------------------------------------- |
| [risk description] | H/M/L      | H/M/L  | [what would trigger it, how to mitigate] |

Identify at least:

- One technical risk (implementation unknowns, dependency behaviour, etc.)
- One scope risk (what could expand the work beyond the estimate)

If no meaningful risks exist, explain why.

## Assumptions

[Bullet list of assumptions made in producing the estimate. These are the
conditions that must be true for the estimate to hold. If any assumption
is wrong, the estimate changes.]

## Decomposition recommendation

Should this work be broken into smaller tasks before starting?

- **No** — scope is clear, risks are manageable, proceed as one task
- **Yes** — describe the recommended split in 2–3 bullet points

## Flags

[Any specific concerns that should be raised with a human before
proceeding. Write "None" if the work can proceed without escalation.]
