import * as React from "react";
import { cn } from "@/shared/lib/cn";

/**
 * A plain, accessible native <select>, styled to match the rest of the kit.
 * Radix's Select (the usual shadcn/ui pick) is a reasonable upgrade once a
 * design needs it — a native element is the simpler, fully-accessible
 * choice for the plain option lists Phase 0 needs (currency, role).
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      // Matches Input: 44px target, and 16px text so iOS doesn't zoom.
      "flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
