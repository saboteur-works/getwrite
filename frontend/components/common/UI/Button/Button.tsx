"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

// The `destructive` variant is aliased to the same string as `secondary`
// (FR-1/FR-2, destructive-styling-a11y): danger is conveyed by label and
// confirmation dialog only, not by a distinct red style. Sharing this
// constant keeps the two variants from silently drifting apart.
const secondaryButtonVariantClassName =
  "border border-gw-border bg-transparent text-gw-secondary hover:border-gw-border-md hover:text-gw-primary";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-label-wide transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        outline:
          "border border-gw-primary bg-transparent text-gw-primary hover:bg-gw-chrome2",
        secondary: secondaryButtonVariantClassName,
        default:
          "border border-gw-border-md bg-gw-chrome2 text-gw-primary hover:bg-gw-chrome3",
        destructive: secondaryButtonVariantClassName,
        ghost:
          "border-0 bg-transparent text-gw-secondary hover:text-gw-primary",
        icon: "border-[0.5px] border-gw-border bg-transparent text-gw-secondary hover:bg-gw-chrome2 hover:border-gw-border-md hover:text-gw-primary w-9 h-9",
      },
      size: { xs: "px-2.5 py-1 text-[9px]", sm: "px-3 py-2", md: "px-4 py-2" },
    },
    compoundVariants: [
      { variant: "ghost", className: "rounded p-1" },
      { variant: "icon", className: "p-0" },
    ],
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

Button.displayName = "Button";

export default Button;

export { buttonVariants };
