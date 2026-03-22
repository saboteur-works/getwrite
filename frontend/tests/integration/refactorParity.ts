/**
 * @module test/integration/refactorParity
 *
 * Shared parity assertions for behavior-preserving refactor tests.
 *
 * The helpers in this module keep parity checks readable and consistent across
 * UI-oriented seams by centralizing strict equality assertions, ordered-id
 * comparisons, and UI stabilization waits.
 */
import { waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * Generic parity assertion input.
 */
export interface ParityExpectation<T> {
    /** Human-readable label included in assertion messages. */
    label: string;
    /** Observed value after the refactor or current interaction. */
    actual: T;
    /** Baseline value that must remain unchanged. */
    expected: T;
}

/**
 * Options for waiting on asynchronous UI parity conditions.
 */
export interface WaitForParityOptions {
    /** Maximum time to wait before failing the parity assertion. */
    timeoutMs?: number;
    /** Polling interval passed through to Testing Library. */
    intervalMs?: number;
}

/**
 * Assert that two values remain strictly identical for parity purposes.
 *
 * @param expectation - Labeled baseline and observed values.
 *
 * @example
 * ```ts
 * expectParity({
 *   label: "selector output",
 *   actual: afterRefactor,
 *   expected: beforeRefactor,
 * });
 * ```
 */
export function expectParity<T>(expectation: ParityExpectation<T>): void {
    expect(expectation.actual, expectation.label).toStrictEqual(
        expectation.expected,
    );
}

/**
 * Assert parity for ordered identity lists while accepting either raw ids or
 * objects that expose an `id` property.
 *
 * @param label - Human-readable assertion label.
 * @param actual - Observed ordered ids or id-bearing objects.
 * @param expected - Baseline ordered ids or id-bearing objects.
 *
 * @example
 * ```ts
 * expectOrderedIdParity("resource order", currentResources, baselineResources);
 * ```
 */
export function expectOrderedIdParity(
    label: string,
    actual: ReadonlyArray<string | { id: string }>,
    expected: ReadonlyArray<string | { id: string }>,
): void {
    expectParity({
        label,
        actual: actual.map(readParityId),
        expected: expected.map(readParityId),
    });
}

/**
 * Wait for a UI parity assertion to become true.
 *
 * @param assertion - Assertion callback that becomes stable once parity is restored.
 * @param options - Optional wait timeout and polling controls.
 * @returns Resolves once the assertion passes.
 *
 * @example
 * ```ts
 * await waitForParity(() => {
 *   expect(screen.getByText("Saved")).toBeVisible();
 * });
 * ```
 */
export async function waitForParity(
    assertion: () => void,
    options: WaitForParityOptions = {},
): Promise<void> {
    await waitFor(assertion, {
        timeout: options.timeoutMs ?? 1000,
        interval: options.intervalMs ?? 25,
    });
}

/**
 * Flush a small number of queued UI ticks for tests that need predictable
 * sequencing around autosave, debounce, or async event propagation.
 *
 * @param cycles - Number of zero-delay timer cycles to flush.
 * @returns Resolves after the requested number of cycles completes.
 *
 * @example
 * ```ts
 * await flushUiTicks();
 * ```
 */
export async function flushUiTicks(cycles = 2): Promise<void> {
    for (let index = 0; index < cycles; index += 1) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}

/**
 * Read the parity id from either a raw id string or an object with an `id`.
 *
 * @param value - Value to normalize.
 * @returns Normalized id string for ordered parity comparisons.
 */
function readParityId(value: string | { id: string }): string {
    return typeof value === "string" ? value : value.id;
}
