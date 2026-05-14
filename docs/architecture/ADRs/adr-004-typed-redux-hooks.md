# ADR-004: Typed Redux Hooks

**Date:** 2026-05-13
**Status:** Accepted

## Context

Typed hooks help ensure consistency in development and a better IDE experience. Developers don’t have to guess variable types, and type safety is enforced throughout the codebase.

## Decision

Typed Redux hooks (`useAppDispatch`, `useAppSelector`) are re-exported and used in all components instead of raw `dispatch`/`selector`.

## Options Considered

1. **Typed hooks (chosen)** — Ensures type safety and developer experience.
2. **No typed hooks** — Would require manual type assertions and increase the risk of runtime errors.

## Consequences

- Consistent, type-safe state access across the codebase.
- Improved developer experience and fewer bugs.
- No significant downsides aside from slightly more up-front setup.
