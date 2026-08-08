import * as React from "react";
import { cn } from "@/shared/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      // h-11 meets the 44px minimum touch target. `text-base` on mobile is
      // load-bearing rather than cosmetic: iOS Safari force-zooms the page
      // when a focused input's font-size is under 16px, which was throwing
      // the layout sideways on every tap.
      "flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
