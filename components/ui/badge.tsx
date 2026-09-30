import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold", {
  variants: {
    tone: {
      neutral: "border-slate-300 bg-slate-100 text-slate-800",
      success: "border-emerald-300 bg-emerald-50 text-emerald-800",
      warning: "border-amber-400 bg-amber-50 text-amber-900",
      danger: "border-red-300 bg-red-50 text-red-800",
      info: "border-sky-300 bg-sky-50 text-sky-800",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
