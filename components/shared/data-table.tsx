import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./states";

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  hideBelow?: "md" | "lg";
};

const hide = { md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/** Tabela simples e legível (Server Component friendly). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nenhum registro encontrado" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b-2 border-slate-200 bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(
                  "px-4 py-3 font-bold",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.hideBelow && hide[c.hideBelow],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn(
                    "px-4 py-3.5 align-middle",
                    c.align === "right" && "text-right tabular-nums",
                    c.align === "center" && "text-center",
                    c.hideBelow && hide[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
