import { type ReactNode, useId } from "react";

export interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Sidebar control wrapper that renders the sidebar's uppercase mono label
 * above the provided control slot. The label carries its own look, so a
 * caller passes `className` only for wrapper layout such as `mb-4`; it used to
 * pass the label's color, case and tracking too, and any control that did not
 * (the entity sections) rendered a differently styled label.
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
      <span
        id={labelId}
        className="block text-gw-micro leading-[1.65] font-medium font-mono text-brand-mid uppercase tracking-label"
      >
        {label}
      </span>
      {children}
    </div>
  );
}
