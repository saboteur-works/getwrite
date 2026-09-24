import { type ReactNode, useId } from "react";

export interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Sidebar control wrapper that renders a `text-gw-micro font-medium font-mono` label
 * above the provided control slot.
 *
 * The text used to be a `<label>` sibling with no `htmlFor` — an element that
 * labelled nothing, which axe reports as a control with no label. It is a
 * heading for the whole slot rather than for one control (several consumers
 * put a chip list, a hint paragraph and an input in here), so the wrapper is
 * a `group` named by it.
 *
 * Wrapping the children in the `<label>` instead does NOT work and was tried:
 * a `<button>` is a labelable element, so in a slot whose first child is a
 * chip button the label binds to that button and renames it (measured: a chip
 * named "Alice" became "Characters Bob"). A consumer that needs one control
 * named by this text should still give that control its own `aria-label`.
 */
export default function LabeledField({
  label,
  children,
  className = "",
}: LabeledFieldProps): JSX.Element {
  const labelId = useId();
  return (
    <div className={className} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-gw-micro font-medium font-mono">
        {label}
      </span>
      {children}
    </div>
  );
}
