"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

/**
 * Foundation smoke primitive — verifies that `cva` + `cn()` + Tailwind v4
 * brand tokens (`gw-*`) compose correctly under the shadcn-style pattern
 * adopted in `decisions.md` Decision 2.
 *
 * Not a production primitive. Will be deleted at the start of Task 4 once
 * the canonical `Button` lands.
 */
const smokeButtonVariants = cva(
    "inline-flex items-center justify-center rounded-md font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border disabled:opacity-50 disabled:pointer-events-none",
    {
        variants: {
            variant: {
                default:
                    "border border-gw-border bg-gw-chrome2 text-gw-primary hover:bg-gw-chrome",
                outline:
                    "border border-gw-border bg-transparent text-gw-secondary hover:bg-gw-chrome2",
            },
            size: {
                sm: "px-3 py-1.5",
                md: "px-4 py-2",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "md",
        },
    },
);

export interface SmokeButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof smokeButtonVariants> {}

export default function SmokeButton({
    className,
    variant,
    size,
    type = "button",
    ...props
}: SmokeButtonProps): JSX.Element {
    return (
        <button
            type={type}
            className={cn(smokeButtonVariants({ variant, size }), className)}
            {...props}
        />
    );
}

export { smokeButtonVariants };
