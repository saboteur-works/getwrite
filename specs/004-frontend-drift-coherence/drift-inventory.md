# Drift Inventory

This artifact captures frontend drift findings, risk ranking, invariant impact, and domain coverage for spec 004.

## Drift Taxonomy

Use one or more drift types per finding.

| Drift Type             | Definition                                                       | Typical Signal                                                              |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| size                   | A file/module has grown beyond easy review and change safety.    | High line count, broad API surface, difficult navigation.                   |
| responsibility         | A unit mixes multiple responsibilities that should be separated. | Data orchestration, rendering, and side effects combined in one unit.       |
| architectural-boundary | Layer boundaries are crossed or blurred.                         | UI components directly owning domain/state concerns meant for other layers. |
| duplication            | Similar logic or behavior is repeated across files.              | Copy/pasted handlers, schema logic, or menu/action definitions.             |
| standards              | Repository standards are inconsistently applied.                 | Type-safety erosion, token bypasses, mixed error-handling patterns.         |

## Risk Rubric

Risk level must be assigned to every finding.

| Risk   | Criteria                                                                           | Expected Action                                                       |
| ------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| High   | Invariant impact is not none OR cross-domain blast radius is present.              | Prioritize first in execution blueprint and attach strict guardrails. |
| Medium | Localized structural drift with moderate maintenance cost and no invariant impact. | Schedule after High findings; define seam and verification scope.     |
| Low    | Cosmetic/isolated drift with low behavioral or coordination risk.                  | Track for opportunistic cleanup; avoid blocking critical sequence.    |

## Invariant-Impact Legend

Use these values for consistent impact tagging.

| Invariant Impact    | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| workspace           | Could alter protected Workspace position/behavior semantics.                  |
| revisions+canonical | Could alter revision linearity or canonical revision guarantees.              |
| resource-identity   | Could break identity-stable associations across move/rename flows.            |
| compile             | Could alter compile ordering or export-only non-mutation behavior.            |
| token-system        | Could bypass token-first styling or introduce inconsistent visual primitives. |
| none                | No direct invariant impact identified.                                        |

## Findings Register

| ID  | Domain | Target Area | Drift Types | Risk | Invariant Impact | Evidence Summary | Recommended Direction |
| --- | ------ | ----------- | ----------- | ---- | ---------------- | ---------------- | --------------------- |
| TBD | TBD    | TBD         | TBD         | TBD  | TBD              | TBD              | TBD                   |

## Domain Coverage

Every in-scope domain must be marked as either finding-recorded or no-material-drift.

| Domain                  | Coverage Status | Linked Finding IDs | Notes |
| ----------------------- | --------------- | ------------------ | ----- |
| app shell               | pending         | -                  | -     |
| work area/editor        | pending         | -                  | -     |
| resource tree           | pending         | -                  | -     |
| modal flows             | pending         | -                  | -     |
| sidebar metadata        | pending         | -                  | -     |
| model utilities         | pending         | -                  | -     |
| Redux slices            | pending         | -                  | -     |
| project types manager   | pending         | -                  | -     |
| help surface            | pending         | -                  | -     |
| editor menu duplication | pending         | -                  | -     |
