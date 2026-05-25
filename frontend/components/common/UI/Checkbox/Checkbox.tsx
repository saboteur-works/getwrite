"use client";

import * as React from "react";
import { cn } from "../utils";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn("cursor-pointer", className)}
        {...props}
      />
    );
  },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
