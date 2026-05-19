"use client";

import * as React from "react";
import { cn } from "../utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, type = "text", ...props },
    ref,
) {
    return (
        <input
            ref={ref}
            type={type}
            className={cn(
                "rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
});

Input.displayName = "Input";

export default Input;
