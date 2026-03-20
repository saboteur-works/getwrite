# Data Model: Frontend Drift Analysis and Coherence Baseline

## Entities

### Drift Finding

- Purpose: Represents a frontend area where structure, responsibility, cohesion, or consistency has materially drifted from the desired codebase shape.
- Key fields:
    - `id`: Stable identifier for the finding within this feature.
    - `domain`: The major frontend domain the finding belongs to.
    - `targetArea`: File, module, component, or logical subsystem being analyzed.
    - `driftTypes`: One or more classification labels describing the nature of the drift.
    - `riskLevel`: Relative urgency (`High`, `Medium`, `Low`).
    - `invariantImpact`: Whether the finding touches protected behavior.
    - `evidenceSummary`: Human-readable summary of why the finding exists.
    - `recommendedDirection`: Behavior-preserving refactor direction.

### Domain Coverage

- Purpose: Records whether each in-scope frontend domain was analyzed and whether material drift was found.
- Key fields:
    - `domain`: Named frontend domain.
    - `coverageStatus`: `finding-recorded` or `no-material-drift`.
    - `linkedFindings`: Zero or more `Drift Finding` references.
    - `notes`: Supporting explanation for reviewers.

### Style Rule

- Purpose: Captures a preferred coding or structural pattern derived from exemplar repository code.
- Key fields:
    - `id`: Stable identifier for the rule.
    - `category`: Type safety, module responsibility, state management, error handling, React component shape, or styling.
    - `rule`: The positive pattern to preserve.
    - `antiPattern`: A discouraged pattern the rule helps avoid.
    - `sourceExamples`: One or more exemplar file or symbol references.

### Refactor Seam

- Purpose: Describes a minimally invasive way to split or reorganize a drifted area while preserving behavior.
- Key fields:
    - `targetArea`: The hotspot being decomposed.
    - `proposedOutputs`: The conceptual files, modules, or responsibilities that would result.
    - `dependencyOrder`: Prerequisites or sequencing constraints.
    - `blastRadius`: The likely area of impact if later implemented.
    - `behaviorGuardrail`: Statement of public behavior that must remain unchanged.
    - `styleAlignment`: Relevant `Style Rule` references.

### Execution Blueprint Item

- Purpose: Represents a prioritized unit of future refactor work derived from one or more `Refactor Seam` entries.
- Key fields:
    - `priority`: Relative ordering in the blueprint.
    - `title`: Human-readable work item.
    - `dependsOn`: Other blueprint items that must come first.
    - `parallelizable`: Whether work can proceed concurrently.
    - `nonGoals`: Explicit exclusions for the item.
    - `verificationRefs`: Related `Verification Gate` references.

### Verification Gate

- Purpose: Defines how reviewers determine whether a future refactor step is complete and safe.
- Key fields:
    - `id`: Stable gate identifier.
    - `targetArea`: Seam or blueprint item the gate applies to.
    - `testTargets`: Automated test targets or suites to run.
    - `manualChecks`: UI or behavior checks to perform.
    - `invariantChecks`: Product invariants that must be preserved.
    - `artifactChecks`: Required completeness or documentation checks.

## Relationships

- A `Domain Coverage` entry may reference zero or more `Drift Finding` entries.
- A `Drift Finding` may produce one or more `Refactor Seam` entries.
- A `Style Rule` may align with many `Refactor Seam` entries.
- One `Execution Blueprint Item` may aggregate one or more `Refactor Seam` entries.
- Each `Execution Blueprint Item` should reference one or more `Verification Gate` entries.

## State Notes

- Findings start as observations and become planning inputs once risk and invariant impact are assigned.
- Style rules are only valid if they trace back to exemplar repository code.
- Blueprint items are only ready for task generation once dependencies, non-goals, and verification references are defined.
