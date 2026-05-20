# Storybook Foundation Enhancement

## Overview

The Foundations section of Storybook documents the app's primitive building blocks, but currently only covers interactive components (Button, Card, Input, etc.). Design tokens — colors, typography, spacing, borders, and motion — are defined in `saboteur-base.css` and `getwrite-theme.css` but have no Storybook representation. A developer choosing a font size, spacing value, or border radius has no reference to browse. The existing Colors story is incomplete: it has a duplicated section label, omits light-mode tokens, shows no hex values, and misses diff and toast colors. This feature adds stories for every established design token category and corrects the Colors story so that Foundations becomes a complete, self-contained style reference.

## Goals

- Every CSS design token defined in `saboteur-base.css` and `getwrite-theme.css` has a corresponding Storybook story in Foundations.
- The Colors story shows each token's CSS variable name, hex value, and role, grouped by category (chrome, editor, text, border, functional, toast).
- Developers can visually browse all typography levels (font family × size × weight × tracking × leading) in a single story.
- The spacing and border stories render scaled visual examples so token values can be compared at a glance without reading source code.
- The Colors story shows dark-mode and light-mode hex values for every semantic token simultaneously, so theme parity is verifiable without toggling the toolbar.

## Non-goals

- Adding new design tokens — this feature only documents tokens that already exist.
- Creating interactive controls (e.g., a token picker or live theme editor).
- Changing how existing component stories reference tokens.

## User stories

- As a developer, I want to browse all color tokens with their hex values and descriptions so that I can choose the right token without reading CSS source files.
- As a developer, I want to see every typography scale level rendered in context so that I can match UI text to the correct token.
- As a developer, I want to view spacing and border tokens as scaled visual blocks so that I can confirm the right step before writing a class.
- As a designer reviewing the system, I want to verify that light-mode and dark-mode color tokens are both represented so that I can confirm theme parity without running the app.

## Functional requirements

1. The Colors story **must** fix the duplicate "Chrome Editor Surface Tokens" section label so both sections have distinct, accurate names.
2. The Colors story **must** display each token's CSS variable name alongside hardcoded dark-mode and light-mode hex values for every semantic token, so both values are visible regardless of the active toolbar mode; swatches **must** be at least 40×40px.
3. The Colors story **must** include all tokens from `getwrite-theme.css`: chrome surfaces (dark + light variants), text, border, functional (saved/saving), toast, and diff colors. It **must not** rely solely on `var()` resolution to communicate light-mode values — the light-mode hex for each overridden token must be shown explicitly (sourced from `getwrite-utilities.css`).
4. A new Typography story **must** render each `--font-size-gw-*` level (hero → nano) using its matching font family, weight, and tracking as used in the app. The `hero` level **must** apply the `clamp(60px, 9vw, 88px)` token directly (no fixed override) and **must** display a formula annotation beneath the specimen showing the min, preferred, and max values.
5. The Typography story **must** show all four font families (`display`, `sans`, `mono`, `serif`) with their intended use cases.
6. The Typography story **must** display the full `--tracking-*` scale and full `--leading-*` scale as labeled specimen rows.
7. A new Spacing story **must** render each `--spacing-*` step from `saboteur-base.css` as a filled bar whose width equals the spacing value, with the token name and pixel value labeled.
8. A new Borders story **must** show all `--radius-*` and `--border-width-*` tokens as visual examples with token name and pixel value labeled.
9. A new Layout Tokens story **must** list all `--width-gw-*`, `--height-gw-*`, and `--padding-gw-*` tokens with their values and described roles.
10. A new Motion story **should** render each `--transition-*` token as a live interactive hover example demonstrating the easing and duration.
11. All new stories **must** use the title prefix `Foundations/` so they appear in the correct Storybook section.

## Open questions

None identified.

## Out of scope (deferred)

- A searchable or filterable token browser.
- Automated token extraction from CSS files (stories are written by hand referencing the CSS source of truth).
- Documenting the `--timeline-*` token set beyond what already appears in the Colors story.
