# Software Testing Standard

This document applies when running or writing tests.

---

## 1. Environment

- Run `nvm use 22.16.0` before any test command
- Working directory must be the repo root for all test commands

---

## 2. Commands

| Mode | Command |
|---|---|
| Watch (development) | `pnpm test` |
| CI / single pass | `pnpm test:ci` |
| Targeted by file | `pnpm test:ci <filename-without-extension>` |
| E2E | `pnpm test:e2e` |

- E2E tests require Storybook running on port 6006; start with `pnpm storybook` before running `pnpm test:e2e`

---

## 3. Test File Locations

- Unit / integration: `tests/`, `src/tests/unit/`
- E2E: `e2e/`

---

## 4. Scope

- Unit tests: models, schemas, utilities
- Component tests: UI components in isolation
- E2E tests: full user flows against Storybook
