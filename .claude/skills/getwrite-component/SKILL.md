---
name: getwrite-component
description: >
    Create React components for the GetWrite project that conform to the project's
    brand tokens, typography rules, and Storybook documentation standards. Use this
    skill whenever the user asks to create, add, or build any piece of UI for
    GetWrite — components, buttons, modals, panels, badges, inputs, tags, or any
    named visual element. Trigger on phrases like "create a component", "add a
    [Name] component", "build a [Name] UI", "make a [Name] button/modal/badge",
    "I need a component for...", or any request that results in a new .tsx file in
    frontend/components/. Also use when an existing component needs a new visual
    variant or Storybook story.
license: MIT
compatibility: >
    Requires Node 22.16.0 and pnpm. Run from frontend/ directory.
    Typecheck: pnpm typecheck. Storybook: pnpm storybook (port 6006).
metadata:
    author: saboteur-labs
    version: "1.0"
    context-budget: medium
    interfaces: ide, cli
---

# getwrite-component

You are creating a React component for the GetWrite writing workspace. GetWrite has strict brand and styling rules that encode deliberate product decisions — follow them exactly, not approximately.

---

## Step 1: Read the token reference

Before writing any code, read `frontend/styles/getwrite-theme.css`. The bottom ~80 lines (after the `@theme` block) contain a "Quick reference for AI assistants" with every Tailwind class name for every design token. Read this before touching any className string — using the wrong class name is a silent styling bug.

---

## Step 2: Clarify what you're building

Identify from context or ask:

- **Component name** — PascalCase, describes what it is (not what it does)
- **Feature area** — which directory under `frontend/components/` it belongs to (`common/`, `Layout/`, `Editor/`, `Tree/`, `Sidebar/`, `WorkArea/`, `notifications/`, `preferences/`, `help/`)
- **Props** — data and callbacks the component receives
- **Visual states** — default, hover, active, disabled, selected, destructive (cover what applies)
- **Interactive?** — uses state, effects, or event handlers → needs `"use client"`

If the request is ambiguous on any of these, ask before writing code.

---

## Step 3: Write the component

**File:** `frontend/components/<feature>/ComponentName.tsx`

### TypeScript requirements

```tsx
"use client"; // only if interactive

import React from "react";

export interface ComponentNameProps {
    // typed, named interface — no inline object types, no `any`
}

export default function ComponentName({
    ...
}: ComponentNameProps): JSX.Element {
    // ...
}
```

- Export a named `interface ComponentNameProps` at the top — always
- Return type must be explicit: `JSX.Element` or `JSX.Element | null`
- No `any`. No `@ts-ignore`. No type assertions unless strictly unavoidable
- `"use client"` goes on line 1 if the component uses hooks, state, or DOM event handlers

### Styling rules — these are non-negotiable

**Use `gw-` Tailwind tokens for everything color-related.** Never use raw hex values or Tailwind built-in color utilities (no `blue-*`, `gray-*`, `green-*`, `red-500`, etc.):

| Purpose | Token class |
|---|---|
| App background | `bg-gw-bg` |
| Panel / sidebar | `bg-gw-chrome` |
| Nested card / input | `bg-gw-chrome2` |
| Writing surface (dark) | `bg-gw-editor` |
| Writing surface (light) | `bg-gw-paper` |
| Primary UI text | `text-gw-primary` |
| Muted labels, metadata | `text-gw-secondary` |
| Near-invisible (folders) | `text-gw-dim` |
| Signal red | `text-gw-red` |
| Default border | `border-gw-border` |
| Active / canonical border | `border-gw-red-border` |

Dark/light mode is handled automatically by CSS variable overrides — do not write `dark:` prefixed utilities.

**Red is a position marker, not an action indicator.** Use `text-gw-red` / `border-gw-red-border` only for:
- Active file left border in resource tree
- Active tab underline
- Canonical revision badge (border + text, never fill)
- Editor chapter headings (inside the editor surface only)
- Active/selected metadata tags

Red is NOT for: buttons, CTAs, hover states, alerts, warnings, icons, progress indicators, decorative elements. If you're about to use red for any of these, stop and use `text-gw-secondary` → `text-gw-primary` hover instead.

**Typography:**
- All UI chrome defaults to `font-sans` (IBM Plex Sans) — no need to specify unless overriding
- Labels, timestamps, tab names, keyboard shortcuts, revision names, metadata values: `font-mono` (IBM Plex Mono)
- Editor body text (and only editor body text): `font-serif` (IBM Plex Serif) — never in navigation, sidebars, modals, metadata panels, or any chrome

**Button patterns — GetWrite has no red-fill buttons:**

```
Primary outlined:
  border border-gw-primary text-gw-primary bg-transparent rounded-[5px]
  font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2
  hover:bg-gw-chrome2 transition-colors duration-150

Secondary / ghost:
  border border-gw-border text-gw-secondary bg-transparent rounded-[5px]
  font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2
  hover:border-gw-border-md hover:text-gw-primary transition-colors duration-150

Destructive (outlined, never filled):
  border border-gw-red-border text-gw-red bg-transparent rounded-[5px]
  font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2
  hover:bg-gw-chrome2 transition-colors duration-150
```

**No drop shadows** — elevation is expressed through surface color hierarchy (`bg-gw-chrome` → `bg-gw-chrome2`), not shadows.

**No gradients** — no `bg-gradient-*`, `from-*`, `to-*` utilities. Surfaces are flat.

**Transitions:** `transition-colors duration-150` for color/border/opacity shifts. Motion should be functional and unobtrusive.

**Spacing:** 4px base unit. Use Tailwind's `p-1` (4px) through `p-16` (64px) — these map cleanly. Editor horizontal padding: `px-10` (40px), editor top: `py-8` (32px).

---

## Step 4: Write the Storybook story

**File:** `frontend/stories/<Category>/ComponentName.stories.tsx`

The `<Category>` is the PascalCase version of the feature area: `Common`, `Layout`, `Editor`, `Tree`, `Sidebar`, `WorkArea`, `Notifications`, `Preferences`, `Help`.

### Required structure

```tsx
import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ComponentName from "../../components/<feature>/ComponentName";

const meta: Meta<typeof ComponentName> = {
    title: "<Category>/ComponentName",
    component: ComponentName,
};

export default meta;

type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {
    args: {
        // all required props go here
    },
};
```

**Rules:**
- Always import from `@storybook/nextjs-vite` — never `@storybook/react`
- Every named story export on a component (not page) story **must** have `args` — this is required, not optional
- Cover the key visual states: at minimum `Default`, plus named variants for significant states (e.g., `Danger`, `Disabled`, `Active`, `Selected`, `Loading`)
- For components with callbacks, add an `Interactive` story that uses `render` with `React.useState` to show real state transitions
- Use `render: (args) => <ComponentName {...args} />` only when you need wrapper markup; otherwise let the default render handle it

---

## Step 5: Typecheck

From `frontend/`:
```bash
pnpm typecheck
```

Fix every error before finishing. Do not leave type errors, suppress them with `@ts-ignore`, or use `as any` workarounds.

---

## Final checklist

- [ ] Props interface is named `ComponentNameProps` and exported
- [ ] No `any`, no `@ts-ignore`, no untyped parameters
- [ ] `"use client"` present if and only if the component uses hooks/events
- [ ] All colors use `gw-` token classes — no raw hex, no Tailwind built-in colors
- [ ] Red (`text-gw-red`, `border-gw-red-border`) used only for position/canonical state
- [ ] `font-serif` does not appear outside an editor surface context
- [ ] No drop shadows, no gradients
- [ ] Story imports from `@storybook/nextjs-vite`
- [ ] Every story export has `args`
- [ ] `pnpm typecheck` passes with no errors
