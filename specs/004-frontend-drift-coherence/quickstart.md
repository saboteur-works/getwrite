# Quickstart: Frontend Drift Analysis and Coherence Baseline

## Purpose

Use this workflow to produce the frontend drift-analysis outputs defined by spec `004` without expanding into refactor implementation.

## Prerequisites

1. Work from branch `004-frontend-drift-coherence`.
2. Review the governing documents:
    - `specs/004-frontend-drift-coherence/spec.md`
    - `specs/004-frontend-drift-coherence/plan.md`
    - `specs/004-frontend-drift-coherence/research.md`
    - `docs/app-spec.md`
    - `docs/standards/testing.md`
    - `experiments-nopush/tome-002-app-spec-v1-product-intent.md`
    - `experiments-nopush/tome-004-token-first-component-styling-preference.md`

## Workflow

1. Inventory the `frontend/` codebase by domain and identify candidate hotspots with material structural drift.
2. Classify each hotspot by drift type, risk level, and invariant impact.
3. Confirm that every in-scope domain has either a finding or an explicit no-material-drift note.
4. Gather exemplar modules/components from existing frontend code and extract style rules plus anti-patterns.
5. Define behavior-preserving refactor seams for the highest-priority hotspots.
6. Convert the seams into a prioritized execution blueprint with dependencies, parallelizable tracks, non-goals, and guardrails.
7. Define verification gates for each future refactor initiative.

## Expected Outputs

- Drift inventory and domain coverage notes
- Style contract based on exemplar code
- Per-hotspot seam definitions
- Execution blueprint
- Verification gates

## Validation

1. Confirm the analysis remains frontend-only.
2. Confirm all protected invariants remain explicit guardrails.
3. Confirm every style rule is traceable to existing repository code.
4. Confirm every blueprint item has clear sequencing and verification guidance.

## Later Implementation Validation

When implementation begins in a future phase:

1. Run `nvm use 22.16.0` from the repository root.
2. Run targeted tests with `pnpm test:ci <target>` as defined by the relevant verification gates.
3. Run Playwright or manual UI checks for any user-facing seam that affects interaction flows.
