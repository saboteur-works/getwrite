# HelpPage Seam

**Finding**: DF-009 · Rank 10 · Risk: Low · Invariant Impact: none
**Target**: `frontend/components/help/HelpPage.tsx` (532 lines)
**Drift Types**: size, responsibility, duplication

## Overview

`HelpPage` combines static help content (copy, tab definitions), presentational primitives (section cards, tab UI), and modal-shell behavior in a single 532-line file. The primary maintenance risk is that documentation intent and UI presentation are tightly coupled — updating copy requires reading rendering code, and updating rendering requires navigating large inline content blocks. Repeated section-card patterns create three independent update sites where one should exist. This is a Low-risk seam with no invariant-sensitive paths; extraction is a maintainability win with minimal refactor risk.

## Seam Splits

| Seam Boundary          | Responsibility                                                                              | Proposed New Unit                          | Dependency Direction                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Help content data      | Structured tab definitions, section headings, copy text, external link entries              | `help-content.ts` (or `help-content.json`) | No React dependency; pure data module                                      |
| Section card component | Renders one help section with heading, body, and optional link; reusable                    | `HelpSectionCard`                          | Depends on `help-content.ts` types; no modal state                         |
| Slim shell             | Modal or page wrapper; loads content from data module; renders tabs using `HelpSectionCard` | `HelpPage` (trimmed)                       | Imports `help-content.ts` and `HelpSectionCard`; owns only modal lifecycle |

## Dependency Order

1. **Fully independent.** This seam has no dependency on slices, model utilities, or other seams.
2. **`help-content.ts` first.** Define the data shape before building the rendering components that consume it.
3. **`HelpSectionCard` second.** Requires the content type shape but not the full data module.
4. **Slim `HelpPage` last.** Imports both; removes inline copy and repeated card patterns.

## Blast Radius

| Affected Area                                                   | Coupling Type         | Migration Risk                                             |
| --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------- |
| Whatever triggers the help modal (keyboard shortcut, help icon) | Component import only | Low — slim shell keeps the same component name and exports |
| No Redux state affected                                         | None                  | None                                                       |
| No API routes affected                                          | None                  | None                                                       |

## Public-Behavior Guardrails

| Guardrail                                                          | Invariant Link | Failure Signal                                              |
| ------------------------------------------------------------------ | -------------- | ----------------------------------------------------------- |
| Help content must render identically after data extraction         | none           | Users see different text, missing sections, or broken links |
| Tab structure and navigation behavior must not change              | none           | Tab switching fails or displays wrong content               |
| Modal open/close behavior and keyboard dismissal must be preserved | none           | Help modal cannot be closed with Escape or clicking outside |

## Non-Goals

- Do not change the documentation content itself.
- Do not add help search, filtering, or dynamic content loading.
- Do not redesign how the help modal is triggered from the application shell.
- Do not add new help sections or tabs during this extraction.
- Do not migrate content to a CMS or external source.

## Style-Alignment Mappings

| Rule   | Applies To                                                        | Action Required                                                                                                   |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SR-009 | `help-content.ts` (if it references asset paths or external URLs) | Use named constants for any path or URL; do not inline string literals in rendering code                          |
| SR-010 | `help-content.ts` and `HelpSectionCard`                           | Keep each unit single-purpose; do not add modal state to the content module                                       |
| SR-025 | `HelpSectionCard`                                                 | Export the `HelpSectionCardProps` interface alongside the component                                               |
| SR-027 | Slim `HelpPage` shell if it renders as a blocking modal           | Apply full ARIA dialog contract: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` with matching heading ID |
| SR-028 | Slim `HelpPage`                                                   | Guard conditional render with early `return null`; do not use `isOpen && <HelpPage />` at the call site           |
| SR-030 | `HelpSectionCard` and slim `HelpPage`                             | Use token-backed class names; remove any raw Tailwind utilities on host elements                                  |
| AP-018 | Slim `HelpPage` modal shell                                       | Do not omit `aria-modal` or a keyboard focus trap if the page renders as an overlay                               |
