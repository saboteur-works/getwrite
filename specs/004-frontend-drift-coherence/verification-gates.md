# Verification Gates

This artifact captures per-hotspot verification gates, including test targets, manual checks, invariant checks, and artifact checks for spec 004.

## Verification Criteria Structure

| Gate ID | Hotspot      | Automated Test Targets  | Manual Checks                            | Invariant Checks     | Artifact Checks              | Exit Criteria               |
| ------- | ------------ | ----------------------- | ---------------------------------------- | -------------------- | ---------------------------- | --------------------------- |
| VG-###  | hotspot-name | command or suite target | accessibility/responsiveness/flow checks | invariant assertions | document completeness checks | objective completion signal |

## Manual Check Baseline

- Accessibility: keyboard navigation, focus visibility, semantic labels, screen-reader naming for changed controls.
- Responsiveness: desktop and narrow viewport behavior remains usable without clipping/regression.
- Core flow behavior: unchanged outcomes for the seam's user-facing paths.

## Invariant Check Baseline

- Workspace protection remains unchanged.
- Revision/canonical guarantees remain unchanged.
- Resource identity and association behavior remain unchanged.
- Compile behavior remains export-only and ordering-safe.
- Token-first styling remains intact.
