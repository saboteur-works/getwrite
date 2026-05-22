"use client";

import * as React from "react";
import { cn } from "../utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    function Textarea({ className, ...props }, ref) {
        return (
            <textarea
                ref={ref}
                className={cn(
                    "border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]",
                    className,
                )}
                {...props}
            />
        );
    },
);

Textarea.displayName = "Textarea";

export default Textarea;
