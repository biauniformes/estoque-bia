import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

export function Pagination({
  page,
  total,
  pathname,
  params,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  pathname: string;
  params: Record<string, string>;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const btn = "flex h-11 items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-4 font-semibold hover:bg-slate-100";
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      <p className="text-sm text-slate-500">
        {formatNumber(total)} {total === 1 ? "registro" : "registros"} · página {page} de {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={btn}>
            Próxima <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function parsePage(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : 1;
}
