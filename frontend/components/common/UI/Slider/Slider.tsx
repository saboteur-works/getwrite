"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../utils";

/**
 * Brand-styled range slider built on Radix Slider. Provides accessible
 * keyboard seeking (arrow keys) and `role="slider"` semantics out of the box.
 * Renders one thumb per value, so it supports both single-value and range use.
 *
 * The filled range uses a neutral token (not red, which is reserved for
 * position/canonical indicators per STYLING.md).
 */
const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider(
  { className, value, defaultValue, "aria-label": ariaLabel, ...props },
  ref,
) {
  const thumbCount = Array.isArray(value)
    ? value.length
    : Array.isArray(defaultValue)
      ? defaultValue.length
      : 1;

  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gw-border">
        <SliderPrimitive.Range className="absolute h-full bg-gw-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={ariaLabel}
          className="block h-3 w-3 rounded-full border border-gw-primary bg-gw-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
});

Slider.displayName = "Slider";

export default Slider;
