"use client";

import * as React from "react";
import { cn } from "../utils";

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "role"
> {
  /** Whether the switch is on. The switch is controlled: pair with `onChange`. */
  checked: boolean;
}

/**
 * An on/off switch for settings: a native checkbox with `role="switch"`,
 * kept in the accessibility tree and keyboard order (Space toggles it), drawn
 * over by a track and a sliding thumb. Label it as any input: a
 * `<label htmlFor>`, `aria-label` or `aria-labelledby`. The ref reaches the
 * input, so it can be focused.
 *
 * On is a filled track in the primary text colour; off is an outlined track
 * whose outline and thumb use the secondary text colour, which has text-level
 * contrast. Red is reserved for position markers and never used here.
 * Use a plain checkbox for selection (picking items), not for settings.
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, className, disabled, ...props },
  ref,
) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center",
        disabled && "opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        {...props}
      />
      <span
        aria-hidden="true"
        data-switch-track=""
        className={cn(
          "pointer-events-none flex h-[18px] w-8 items-center rounded-full border px-[2px] transition-colors duration-150",
          "peer-focus-visible:ring-1 peer-focus-visible:ring-gw-secondary peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-gw-bg",
          checked
            ? "border-gw-primary bg-gw-primary"
            : "border-gw-secondary bg-transparent",
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full transition-transform duration-150",
            checked
              ? "translate-x-[14px] bg-gw-chrome"
              : "translate-x-0 bg-gw-secondary",
          )}
        />
      </span>
    </span>
  );
});

Switch.displayName = "Switch";

export default Switch;
