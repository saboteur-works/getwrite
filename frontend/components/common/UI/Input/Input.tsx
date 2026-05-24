"use client";

import * as React from "react";
import { cn } from "../utils";
import EditContextMenu from "../ContextMenu/EditContextMenu";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <EditContextMenu>
      <input
        ref={ref}
        type={type}
        className={cn(
          "border border-gw-border bg-gw-chrome2 px-3 py-2 text-gw-label text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </EditContextMenu>
  );
});

Input.displayName = "Input";

export default Input;
