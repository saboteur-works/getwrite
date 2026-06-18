import { type ReactNode } from "react";

export interface LabeledFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Sidebar control wrapper that renders a `text-gw-micro font-medium font-mono` label
 * above the provided control slot.
 */
export default function LabeledField({
  label,
  children,
  className = "",
}: LabeledFieldProps): JSX.Element {
  return (
    <div className={className}>
      <label className="text-gw-micro font-medium font-mono">{label}</label>
      {children}
    </div>
  );
}
