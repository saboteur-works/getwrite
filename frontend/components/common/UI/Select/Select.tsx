"use client";

import * as React from "react";
import { cn } from "../utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    function Select({ className, children, ...props }, ref) {
        return (
            <select
                ref={ref}
                className={cn(
                    "rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
                {...props}
            >
                {children}
            </select>
        );
    },
);

Select.displayName = "Select";

export default Select;
