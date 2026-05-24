"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> & {
  /**
   * DOM node to portal into. Pass the nearest dialog content when nesting
   * inside a modal Dialog so react-remove-scroll permits scrolling. Defaults
   * to document.body.
   */
  container?: React.ComponentPropsWithoutRef<
    typeof PopoverPrimitive.Portal
  >["container"];
};

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent(
  { className, align = "center", sideOffset = 4, container, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverClose, PopoverContent };
