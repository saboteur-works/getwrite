# Data Model: Refactor Frontend App Trouble Spots

**Feature**: [specs/005-refactor-app-trouble-spots/spec.md](spec.md)  
**Plan**: [specs/005-refactor-app-trouble-spots/plan.md](plan.md)  
**Research**: [specs/005-refactor-app-trouble-spots/research.md](research.md)

## Overview

This artifact model defines the structure for representing refactoring work: hotspots, decomposition seams, behavior guardrails, and verification gates. It is the output of Phase 1 design and the input to Phase 2 task generation.

## Core Entities

### Hotspot

A frontend domain identified in spec 004 analysis as drifted and in scope for refactoring.

```
Hotspot {
  id: string                                 // e.g., "DF-001", "DF-006"
  name: string                               // e.g., "AppShell", "resource-templates"
  driftTypes: string[]                       // e.g., ["size", "responsibility", "architectural-boundary"]
  riskLevel: "High" | "Medium" | "Low"      // from execution blueprint
  invariantRisk: "revisions+canonical" | "resource-identity" | "workspace" | "none"
  currentSize: string                        // e.g., "1486 lines", "import-only"
  targetLocation: string                     // TypeScript file path
  parallelTrack: "A" | "B" | "C" | "D" | "E" | "deferred"
  status: "not-started" | "in-progress" | "completed"
}
```

### Seam

A decomposition boundary within a hotspot that extracts a focused responsibility into a new unit(s).

```
Seam {
  hotspotId: string
  name: string                               // e.g., "ShellLayoutController", "ShellModalCoordinator"
  responsibility: string                     // Single-sentence description
  proposedNewUnit: string                    // File path or module name to create
  dependsOn: string[]                        // Other Seam ids or hotspots
  blastRadius: BlastRadiusItem[]            // Affected downstream areas
  publicBehaviorGuardrails: Guardrail[]     // Behavior that must be preserved
  nonGoals: string[]                         // Explicitly excluded from this seam
  styleAlignmentMappings: StyleRuleId[]     // Keep-rules from style contract
}

BlastRadiusItem {
  affectedArea: string                       // e.g., "EditView.tsx", "resourcesSlice.ts"
  couplingType: string                       // e.g., "callback props", "selector data shape"
  migrationRisk: "High" | "Medium" | "Low"
}
```

### GuardRail

An explicit requirement that a refactored seam must preserve behavior, data shape, or timing.

```
Guardrail {
  id: string                                 // e.g., "BR-AppShell-001"
  seam: string                               // Seam id
  description: string                        // What must be true
  invariantLink: string                      // Which product invariant does it protect
  failureSignal: string                      // Observable evidence of violation
  verificationMethod: "unit-test" | "type-check" | "playwright" | "manual-review"
  testName?: string                          // e.g., "should preserve save-on-blur timing"
}
```

### VerificationGate

A definition of "done" for a refactored hotspot or seam.

```
VerificationGate {
  id: string                                 // e.g., "VG-005-EditView"
  hotspotOrSeam: string                      // Hotspot or Seam id
  category: "compilation" | "unit-test" | "ui-test" | "guardrails" | "style"
  criterion: string                          // Testable success condition
  operator: string                           // How to verify (e.g., "run pnpm test:ci", "open PR and review")
  expectedResult: string                     // What passing looks like
}
```

### ExecutionItem

Work unit for task generation (relates to Phase 2).

```
ExecutionItem {
  id: string                                 // Task number, e.g., "T020"
  hotspot: string                            // Which hotspot
  seam: string                               // Which seam (if applicable)
  title: string                              // e.g., "Extract ShellLayoutController from AppShell"
  description: string                        // User-readable task description
  dependsOn: string[]                        // Task ids that must complete first
  parallelTrack: string                      // "A", "B", etc.
  estimateSize: "small" | "medium" | "large"
  verificationGates: VerificationGateId[]   // Gates that must pass
  acceptanceCriteria: string[]               // Gherkin or bullet-point scenarios
}
```

## Refactoring Artifact Structure

The Phase 1 design produces a structured JSON/YAML representation (or markdown tables) of all hotspots, seams, guardrails, and gates:

```
005-refactor-artifacts/
├── hotspots.md                   // Table of all 9 hotspots with key attributes
├── seams/
│   ├── resource-templates.md     // Detailed seam design for resource-templates hotspot
│   ├── revisionsSlice.md
│   ├── projectsSlice.md
│   ├── EditView.md
│   ├── ResourceTree.md
│   ├── ProjectTypesManagerPage.md
│   ├── AppShell.md
│   ├── MenuBar.md
│   └── HelpPage.md
├── guardrails.md                 // Consolidated table of all behavior guardrails
├── verification-gates.md         // Consolidated table of all verification gates
└── execution-summary.md          // Execution tracks (A–E) with dependency graph
```

## Hotspot Definitions

[To be filled in Phase 1 after authority validation]

| Hotspot                 | Drift Finding | Risk   | Invariant           | Track | Target File                                                     | Seams                         |
| ----------------------- | ------------- | ------ | ------------------- | ----- | --------------------------------------------------------------- | ----------------------------- |
| resource-templates      | DF-006        | High   | resource-identity   | A     | `frontend/src/lib/models/resource.ts`                           | n/a (util extraction)         |
| revisionsSlice          | DF-007        | High   | revisions+canonical | A     | `frontend/src/store/revisionsSlice.ts`                          | Canonical guards              |
| projectsSlice           | DF-007        | High   | resource-identity   | B     | `frontend/src/store/projectsSlice.ts`                           | Normalization split           |
| EditView                | DF-002        | High   | revisions+canonical | A     | `frontend/components/WorkArea/EditView.tsx`                     | Autosave + revision I/O       |
| ResourceTree            | DF-003        | High   | resource-identity   | B     | `frontend/components/Sidebar/ResourceTree.tsx`                  | Tree adapter + drag-drop      |
| ProjectTypesManagerPage | DF-008        | High   | workspace           | C     | `frontend/components/project-types/ProjectTypesManagerPage.tsx` | Form + template service       |
| AppShell                | DF-001        | High   | none (indirect)     | A     | `frontend/components/Layout/AppShell.tsx`                       | Shell orchestrators (4 units) |
| MenuBar                 | DF-010        | Medium | none                | D     | `frontend/components/Editor/MenuBar/MenuBar.tsx`                | Command schema + config       |
| HelpPage                | DF-009        | Low    | none                | E     | `frontend/components/*/HelpPage.tsx` (location TBD)             | Content + modal lifecycle     |

## Seam Template

For each hotspot, Phase 1 design produces a detailed seam breakdown:

### Example: AppShell Seam Breakdown

**Hotspot**: AppShell (DF-001)  
**Current Size**: 1486 lines  
**Key Responsibility Clusters**:

1. Layout resizing (panel state, resize handles, transitions)
2. Global settings (appearance preferences, settings panel UX)
3. Modal orchestration (4 distinct modal flows)
4. Project-type loading (API fetch, data propagation)
5. Slim shell (composition, context bridges, event routing)

**Proposed Extraction** (5 new units):

| Unit                     | Responsibility                                    | New File                              | Depends On            | Guardrails                                   |
| ------------------------ | ------------------------------------------------- | ------------------------------------- | --------------------- | -------------------------------------------- |
| `ShellLayoutController`  | Panel dimensions, resize behavior                 | `AppShell/ShellLayoutController.tsx`  | None                  | Layout dimensions match original exactly     |
| `ShellSettingsMenu`      | Settings panel, preferences persistence           | `AppShell/ShellSettingsMenu.tsx`      | Store for preferences | Settings persist identically                 |
| `ShellModalCoordinator`  | Modal trigger + lifecycle for 4 flows             | `AppShell/ShellModalCoordinator.tsx`  | Modal components      | All 4 modals open at same trigger points     |
| `ShellProjectTypeLoader` | Fetch `/api/project-types`, propagate to children | `AppShell/ShellProjectTypeLoader.tsx` | projectsSlice         | Data shape matches API response exactly      |
| `AppShell` (trimmed)     | Compose 4 orchestrators, provide context bridges  | `AppShell.tsx`                        | All units above       | Save coordination reaches EditView unchanged |

**Verification Gates**:

- Layout resize: dimensions match before/after (unit test + Playwright)
- Modal orchestration: all 4 modals open/close via same user actions (Playwright)
- Project types: child routes receive correct data shape (type check + unit test)
- Save coordination: EditView autosave timing preserved (Playwright)

## Guardrails Catalog

[To be filled in Phase 1]

Extracted from the execution blueprint and operationalized for each seam:

| Seam                   | Guardrail                               | Invariant           | Failure Signal                   | Test Method                                         |
| ---------------------- | --------------------------------------- | ------------------- | -------------------------------- | --------------------------------------------------- |
| ShellModalCoordinator  | All four modals open at same trigger    | none                | Modal fails to open              | Playwright: click trigger, assert modal visible     |
| ShellProjectTypeLoader | Project-type list shape matches API     | workspace           | Child receives undefined entries | Type check + unit test of selector                  |
| revisionsSlice         | Only one `canonical: true` per resource | revisions+canonical | Two revisions canonical          | Unit test: `revision-canonical-guards.ts` assertion |
| EditView               | Save-on-blur flushes in same tick       | revisions+canonical | Content lost before nav          | Playwright: type → navigate, assert save completed  |
| ResourceTree           | Drag-drop preserves resource.id         | resource-identity   | Tree loses selected resource     | Unit test of persistReorder payload shape           |

## Verification Gates Catalog

[To be filled in Phase 1]

Operational criteria for declaring a refactor hotspot "done":

| Gate ID   | Hotspot  | Category    | Criterion                                 | Operator                                  |
| --------- | -------- | ----------- | ----------------------------------------- | ----------------------------------------- |
| VG-005-01 | AppShell | compilation | TypeScript errors                         | `pnpm tsc --noEmit` from root             |
| VG-005-02 | AppShell | unit-test   | AppShell sub-units cover guardrails       | `pnpm test:ci frontend/components/Layout` |
| VG-005-03 | AppShell | ui-test     | Modal orchestration Playwright tests pass | `pnpm test:e2e --grep "modal"`            |
| VG-005-04 | AppShell | guardrails  | Manual review against 6 guardrails        | Reviewer checklist: quickstart.md         |
| VG-005-05 | AppShell | style       | Token-first styling applied               | Code review: no raw Tailwind on hosts     |

## Design Decision Rationale

[To be filled in Phase 1]

- Why split AppShell into 4 units? (responsibility, blast radius, testing)
- Why extract resource-templates first? (gates all other tracks, lowest risk)
- Why is `schemas.ts` not refactored? (stable foundation, changes would cascade)
- Why keep modal components unchanged (DF-004)? (low impact on orchestration, deferred for later)

## Open Questions

[To be filled/updated during Phase 1]

- [ ] Where should HelpPage live in the component tree?
- [ ] Should MenuBar command schema be a JSON config file or TS constant?
- [ ] Should AppShell sub-units live in `AppShell/` subdirectory or alongside `AppShell.tsx`?
- [ ] Which selectors in `resourcesSlice` need to be preserved for backward compatibility?

## Phase 1 Completion Checklist

- [ ] All 9 hotspots have detailed seam decomposition plans
- [ ] All guardrails are operationalized with test methods
- [ ] All verification gates are defined with specific test/review criteria
- [ ] Execution tracks (A–E) are sequenced with clear dependency edges
- [ ] Design decisions are justified and reviewed
- [ ] No contradictions between this data model and spec/blueprint exist

**Deliverable**: This model feeds directly into Phase 2 task generation. Each task references specific seams, guardrails, and gates from this document.
