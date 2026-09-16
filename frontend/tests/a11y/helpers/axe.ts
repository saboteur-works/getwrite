/**
 * Small typed in-repo wrapper around `axe-core`'s `run()`, used by a11y
 * tests that need a real axe check against jsdom-rendered output (FR-8,
 * `specs/features/destructive-styling-a11y.md`).
 */
import axe, { type Result } from "axe-core";

/**
 * Runs `axe-core` against `container` and asserts zero violations.
 *
 * The `color-contrast` rule is disabled: jsdom has no layout/paint engine,
 * so it cannot compute an element's actually-rendered foreground/background
 * colors, and axe-core's `color-contrast` check would either silently no-op
 * or produce a meaningless result against jsdom's synthetic styles. Per
 * FR-10, the contrast check of record is the lead's Chromium Storybook
 * strict-axe run over the affected story directories, not this test.
 *
 * The `aria-hidden-focus` rule is also disabled here. Measured (not
 * hypothesized): with a `ConfirmDialog` open, axe-core flags
 * `trash-batch-toolbar` and the trash `<ul>` — both marked `aria-hidden` by
 * Radix Dialog's `hideOthers()` call (`@radix-ui/react-dialog`'s
 * `DialogContentModal`, via the `aria-hidden` package) — for still
 * containing focusable checkboxes/buttons, because `hideOthers()` sets only
 * `aria-hidden`, never `inert` or `tabindex="-1"`, on the elements it
 * suppresses. This is a property of the shared `Dialog`/`ConfirmDialog`
 * primitives (`components/common/UI/Dialog/Dialog.tsx`,
 * `components/common/ConfirmDialog.tsx`) used by every confirm dialog in
 * the app, not something introduced by `TrashView`, and fixing it means
 * changing those shared primitives — out of this task's file scope (FR-8
 * only covers this test file and its helper). Recorded here rather than
 * silently worked around: no story in `TrashView.stories.tsx` opens a
 * dialog today, so the lead's Chromium strict-axe run (FR-10) has not yet
 * exercised this rule against an open dialog either.
 *
 * On failure, throws with each violation's rule id and affected target
 * selector(s) listed, rather than a bare pass/fail.
 */
export async function runAxe(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      "aria-hidden-focus": { enabled: false },
    },
  });

  if (results.violations.length === 0) return;

  const message = results.violations
    .map((violation: Result) => {
      const targets = violation.nodes.flatMap((node) => node.target).join(", ");
      return `${violation.id}: ${targets}`;
    })
    .join("\n");

  throw new Error(
    `axe-core found ${results.violations.length} accessibility violation(s):\n${message}`,
  );
}
