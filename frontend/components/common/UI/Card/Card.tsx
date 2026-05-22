"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const cardVariants = cva("border-[0.5px] border-gw-border", {
  variants: {
    variant: { chrome: "bg-gw-chrome", chrome2: "bg-gw-chrome2" },
    padding: { none: "", sm: "p-3", md: "p-4", lg: "p-5" },
  },
  defaultVariants: { variant: "chrome", padding: "md" },
});

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  as?: React.ElementType;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, padding, as: Component = "div", ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  );
});

Card.displayName = "Card";

export default Card;

export { cardVariants };
