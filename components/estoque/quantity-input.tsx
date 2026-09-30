"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Campo grande de quantidade com − / + (pensado para toque). Aceita só dígitos. */
export function QuantityInput({
  value,
  onChange,
  id = "quantidade",
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  const n = parseInt(value || "0", 10) || 0;
  const step = (d: number) => onChange(String(Math.max(0, n + d)));
  const btn =
    "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-100 active:scale-95 disabled:opacity-40";
  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => step(-1)} disabled={n <= 0} aria-label="Diminuir quantidade">
          <Minus className="h-7 w-7" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          placeholder="0"
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 7))}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            "h-16 min-w-0 flex-1 rounded-2xl border-2 bg-white text-center text-4xl font-extrabold tabular-nums text-slate-900 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
            invalid ? "border-red-500" : "border-slate-300",
          )}
        />
        <button type="button" className={btn} onClick={() => step(1)} aria-label="Aumentar quantidade">
          <Plus className="h-7 w-7" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {[5, 10, 50].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => step(d)}
            className="h-10 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
          >
            +{d}
          </button>
        ))}
      </div>
    </div>
  );
}
