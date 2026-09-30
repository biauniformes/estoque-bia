import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground hover:bg-orange-400",
        dark: "bg-black text-white hover:bg-neutral-700",
        outline: "border-2 border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
        ghost: "text-slate-700 hover:bg-slate-200/70",
        entrada: "bg-brand text-brand-foreground hover:bg-orange-400",
        saida: "bg-black text-white hover:bg-neutral-700",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        sm: "h-10 px-3 text-sm",
        default: "h-12 px-5 text-base",
        lg: "h-14 px-6 text-lg",
        xl: "h-20 px-8 text-2xl",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
