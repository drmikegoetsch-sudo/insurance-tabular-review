import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "sm" | "icon";

const variantClass: Record<Variant, string> = {
  default: "bg-gray-900 text-white hover:bg-gray-800",
  outline: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
  ghost: "text-gray-700 hover:bg-gray-100",
};

const sizeClass: Record<Size, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Minimal shadcn-style button so the demo has no design-system dependency. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
});
