"use client";

/**
 * Camada de compatibilidade: os painéis de exequibilidade usam estes nomes, mas
 * por baixo ficam os componentes do próprio sistema de estoque (identidade Bia).
 */
import * as React from "react";
import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "@/components/ui/button";
import { Badge as BaseBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export { Input, Label, Textarea } from "@/components/ui/input";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "xs" | "icon";

export function Button({
  variant = "default",
  size = "default",
  className,
  ...props
}: Omit<BaseButtonProps, "variant" | "size"> & { variant?: Variant; size?: Size }) {
  const v = variant === "secondary" ? "outline" : variant === "destructive" ? "danger" : variant;
  const s = size === "xs" ? "sm" : size;
  return (
    <BaseButton
      variant={v}
      size={s}
      className={cn(size === "icon" && "h-10 w-10", className)}
      {...props}
    />
  );
}

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "destructive" | "outline" }) {
  const tone = variant === "destructive" ? "danger" : "neutral";
  return (
    <BaseBadge
      tone={tone}
      className={cn(variant === "default" && "border-black bg-black text-white", className)}
      {...props}
    />
  );
}

export function Alert({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }) {
  return (
    <div
      role="alert"
      className={cn(
        "relative grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-xl border-2 p-4 text-sm [&>svg]:mt-0.5 [&>svg]:h-5 [&>svg]:w-5",
        variant === "destructive"
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-slate-300 bg-white text-slate-800",
        className,
      )}
      {...props}
    />
  );
}
export const AlertTitle = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("col-start-2 font-bold", className)} {...p} />
);
export const AlertDescription = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("col-start-2 mt-1", className)} {...p} />
);

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
);
export const TableHeader = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className="bg-slate-100 [&_tr]:border-b" {...p} />
);
export const TableBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="[&_tr:last-child]:border-0" {...p} />
);
export const TableFooter = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tfoot className="border-t bg-slate-50 font-medium" {...p} />
);
export const TableRow = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b transition-colors", className)} {...p} />
);
export const TableHead = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-11 px-3 text-left align-middle text-xs font-bold uppercase tracking-wide text-slate-600", className)} {...p} />
);
export const TableCell = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("p-2 align-middle", className)} {...p} />
);
