# ADR-001: Redux Toolkit as Client-Side State Layer

**Date:** 2026-05-13
**Status:** Accepted

## Context

Redux is reliable, widely supported, and makes state changes easy to trace and debug. It centralizes state, avoiding prop drilling and making data access straightforward.

## Decision

Redux Toolkit will be used as the client-side state management layer.

## Options Considered

1. **React Context** — Simpler, but increases rerenders and doesn’t scale as well for complex, data-driven apps.
2. **Redux Toolkit** — Chosen for its traceability, debugging, and centralization, despite more boilerplate.

## Consequences

- State changes are explicit and traceable.
- Debugging is easier with Redux DevTools and middleware.
- Centralized state avoids prop drilling and improves maintainability.
- Slightly more boilerplate and a larger bundle footprint, but these are outweighed by the benefits for a data-driven application.
