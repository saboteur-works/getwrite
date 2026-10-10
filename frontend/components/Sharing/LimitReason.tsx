/**
 * Visible explanation for a control disabled by a paired-device limit
 * (Feature 77, FR-24). Plain text in the DOM that the control points at with
 * `aria-describedby`; never red, never an alert.
 */
export default function LimitReason({
  id,
  children,
}: {
  id: string;
  children: string;
}): JSX.Element {
  return (
    <p id={id} className="text-gw-nano text-gw-secondary" data-testid={id}>
      {children}
    </p>
  );
}
