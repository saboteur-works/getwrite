# Research: Frontend Drift Analysis and Coherence Baseline

## Decision: First-pass scope stays frontend-only

- Decision: Limit the analysis pass to the `frontend/` surface and the authority documents that constrain frontend behavior.
- Rationale: The prompt and specification both define this feature as a frontend coherence baseline; widening scope now would dilute findings and delay actionable sequencing.
- Alternatives considered: Whole-repository drift analysis now — rejected because it would mix unrelated architectural concerns into a frontend-first initiative and reduce clarity for the first execution blueprint.

## Decision: Use repository-local planning artifacts as the system of record

- Decision: Record outputs as durable artifacts under `specs/004-frontend-drift-coherence/`.
- Rationale: Repository-local artifacts support local-first review, version control, offline use, and clear handoff into later task and implementation phases.
- Alternatives considered: Ephemeral chat-only summaries — rejected because they are harder to review, compare, and use as acceptance criteria for later work.

## Decision: Classify drift by structure and invariant impact

- Decision: Evaluate drift using a fixed classification model: size drift, responsibility drift, architectural-boundary drift, duplication drift, and standards drift, each paired with an invariant-impact assessment.
- Rationale: Large modules alone do not define refactor urgency; the plan must distinguish simple bulk from true structural risk and must highlight behavior-sensitive areas.
- Alternatives considered: File-size ranking only — rejected because it over-prioritizes bulk and under-represents behavior-sensitive drift.

## Decision: Derive target style from exemplar code already in the repository

- Decision: Use existing high-quality frontend modules and components as the source of truth for desired code style and module boundaries.
- Rationale: The user explicitly wants style preservation, and the repository already contains patterns worth standardizing around.
- Alternatives considered: Apply generic ecosystem best practices without repository grounding — rejected because that could replace one form of drift with another and weaken consistency with existing code.

## Decision: Preserve product and design-system constraints as hard gates

- Decision: Treat Workspace behavior, revision/canonical integrity, resource identity, compile non-mutation, and token-first styling as non-negotiable constraints in analysis and sequencing.
- Rationale: The app spec and tome preferences establish these as authoritative expectations, and recommending refactors that weaken them would invalidate the purpose of the exercise.
- Alternatives considered: Allow structural simplification to override product invariants — rejected because it would create behavioral regressions under the guise of cleanup.

## Decision: Verification combines artifact completeness now with targeted test gates later

- Decision: The plan phase validates completeness and coherence of planning artifacts now, while future implementation verification will rely on repo-standard targeted tests and manual checks tied to each refactor seam.
- Rationale: This feature does not change runtime code directly, but its outputs must still define concrete done-criteria for the later refactor work.
- Alternatives considered: Delay all verification design until implementation starts — rejected because it would leave the blueprint incomplete and weaken future review consistency.
