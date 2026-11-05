"use client";

import { useState } from "react";
import { Input } from "./ui";
import { Label } from "./ui";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNumero, parseNumeroBR } from "@/lib/exequibilidade/format";

interface NumberFieldProps {
  value: number;
  onChange: (n: number) => void;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

/** Campo numérico em pt-BR: aceita vírgula, ponto e "R$"; formata ao sair. */
export function NumberField({
  value,
  onChange,
  decimals = 2,
  prefix,
  suffix,
  className,
  id,
  disabled,
  ...rest
}: NumberFieldProps) {
  const [texto, setTexto] = useState<string | null>(null);
  const exibido = texto ?? formatNumero(value, decimals);
  return (
    <div className={cn("relative", className)}>
      {prefix && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        aria-label={rest["aria-label"]}
        value={exibido}
        className={cn(
          "h-11 text-right tabular-nums",
          prefix && "pl-8",
          suffix && "pr-7",
        )}
        onFocus={(e) => {
          setTexto(value === 0 ? "" : String(value).replace(".", ","));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(parseNumeroBR(e.target.value) ?? 0);
        }}
        onBlur={() => setTexto(null)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Campo({
  rotulo,
  dica,
  htmlFor,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {rotulo}
      </Label>
      {children}
      {dica && <p className="text-[11px] leading-snug text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function TextoField({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      className="h-11"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  opcoes,
  className,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  opcoes: { value: T; label: string }[];
  className?: string;
  id?: string;
}) {
  return (
    <Select
      id={id}
      value={value}
      className={cn("h-11 w-full", className)}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
