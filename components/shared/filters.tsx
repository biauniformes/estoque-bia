"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type FilterField =
  | { name: string; label: string; type: "search"; placeholder?: string }
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; allLabel?: string };

/**
 * Barra de filtros que grava tudo na URL (?q=..&tipo=..). O servidor lê a URL e
 * filtra NO BANCO. Busca com debounce; selects/datas aplicam na hora.
 */
export function Filters({ fields }: { fields: FilterField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = React.useTransition();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = React.useRef<HTMLDivElement>(null);

  const push = React.useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [router, pathname, sp],
  );

  const hasFilters = fields.some((f) => sp.get(f.name));

  return (
    <div ref={box} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {fields.map((f) => (
        <div key={f.name} className={f.type === "search" ? "sm:col-span-2" : undefined}>
          <label htmlFor={`f-${f.name}`} className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
            {f.label}
          </label>
          {f.type === "search" && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                id={`f-${f.name}`}
                type="search"
                defaultValue={sp.get(f.name) ?? ""}
                placeholder={f.placeholder ?? "Buscar…"}
                className="pl-11"
                onChange={(e) => {
                  const v = e.target.value;
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => push(f.name, v.trim()), 350);
                }}
              />
            </div>
          )}
          {f.type === "date" && (
            <Input id={`f-${f.name}`} type="date" defaultValue={sp.get(f.name) ?? ""} onChange={(e) => push(f.name, e.target.value)} />
          )}
          {f.type === "select" && (
            <Select id={`f-${f.name}`} defaultValue={sp.get(f.name) ?? ""} onChange={(e) => push(f.name, e.target.value)}>
              <option value="">{f.allLabel ?? "Todos"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      ))}
      {hasFilters && (
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              box.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => (el.value = ""));
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X className="h-4 w-4" aria-hidden /> Limpar
          </Button>
        </div>
      )}
    </div>
  );
}
