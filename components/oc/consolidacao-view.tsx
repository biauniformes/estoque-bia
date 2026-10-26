"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Printer, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { excluirOrdemAction, marcarOrdensAction } from "@/app/actions/oc";
import { SECOES, secaoDe } from "@/lib/secoes";
import { cn, formatNumber } from "@/lib/utils";
import type { OcOrdemView } from "@/services/oc";

type Filtro = "pendente" | "separada" | "todas";
type Linha = { codigo: string; produto: string; estoque: number; qtd: number; ocs: Set<string>; incerto: boolean };

const fmtData = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function ConsolidacaoView({ ordens, canWrite }: { ordens: OcOrdemView[]; canWrite: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = React.useState<Filtro>("pendente");
  const [sel, setSel] = React.useState<Set<string>>(() => new Set(ordens.filter((o) => o.status === "pendente").map((o) => o.id)));
  const [pending, setPending] = React.useState(false);
  const [apagar, setApagar] = React.useState<OcOrdemView | null>(null);

  // se chegaram OCs novas (importação), seleciona as pendentes novas também
  const conhecidas = React.useRef(new Set(ordens.map((o) => o.id)));
  React.useEffect(() => {
    const novas = ordens.filter((o) => !conhecidas.current.has(o.id));
    if (novas.length === 0) return;
    novas.forEach((o) => conhecidas.current.add(o.id));
    setSel((prev) => {
      const next = new Set(prev);
      novas.filter((o) => o.status === "pendente").forEach((o) => next.add(o.id));
      return next;
    });
  }, [ordens]);

  const visiveis = ordens.filter((o) => filtro === "todas" || o.status === filtro);
  const selecionadas = ordens.filter((o) => sel.has(o.id));

  const { linhas, pendencias, pecas } = React.useMemo(() => {
    const porCodigo = new Map<string, Linha>();
    const pend = new Map<string, { cod: string; tam: string; desc: string; qtd: number; motivo: string; ocs: Set<string> }>();
    let total = 0;
    for (const o of selecionadas) {
      for (const i of o.itens) {
        total += i.qtd;
        if (i.res.status === "ok" || i.res.status === "nao_confirmado") {
          const l = porCodigo.get(i.res.codigo) ?? { codigo: i.res.codigo, produto: i.res.produto, estoque: i.res.estoque, qtd: 0, ocs: new Set<string>(), incerto: false };
          l.qtd += i.qtd;
          l.ocs.add(o.numero);
          if (i.res.status === "nao_confirmado") l.incerto = true;
          porCodigo.set(i.res.codigo, l);
        } else {
          const motivo =
            i.res.status === "sem_modelo" ? "produto sem ligação" : i.res.status === "sem_tamanho" ? "tamanho sem conversão" : `código ${i.res.codigo} não existe no catálogo`;
          const k = `${i.cod}|${i.tam}`;
          const p = pend.get(k) ?? { cod: i.cod, tam: i.tam, desc: i.desc, qtd: 0, motivo, ocs: new Set<string>() };
          p.qtd += i.qtd;
          p.ocs.add(o.numero);
          pend.set(k, p);
        }
      }
    }
    return { linhas: [...porCodigo.values()], pendencias: [...pend.values()].sort((a, b) => b.qtd - a.qtd), pecas: total };
  }, [selecionadas]);

  const grupos = SECOES.map((s) => ({ secao: s, itens: linhas.filter((l) => secaoDe(l.produto) === s.value).sort((a, b) => a.codigo.localeCompare(b.codigo)) })).filter((g) => g.itens.length > 0);
  const totalSeparar = linhas.reduce((s, l) => s + l.qtd, 0);
  const totalFalta = linhas.reduce((s, l) => s + Math.max(0, l.qtd - l.estoque), 0);

  function alternar(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function marcar(status: "pendente" | "separada") {
    const ids = selecionadas.map((o) => o.id);
    if (ids.length === 0 || pending) return;
    setPending(true);
    const res = await marcarOrdensAction({ ids, status });
    setPending(false);
    if (res.ok) {
      toast.success(status === "separada" ? "OCs marcadas como separadas." : "OCs reabertas.");
      if (status === "separada") setSel(new Set());
      router.refresh();
    } else toast.error(res.error);
  }

  async function excluir() {
    if (!apagar) return;
    setPending(true);
    const res = await excluirOrdemAction(apagar.id);
    setPending(false);
    setApagar(null);
    if (res.ok) {
      toast.success("OC excluída.");
      setSel((prev) => {
        const next = new Set(prev);
        next.delete(apagar.id);
        return next;
      });
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-6">
      <style>{`@media print { aside, header, .no-print { display: none !important; } main { padding: 0 !important; } .print-only { display: block !important; } }`}</style>

      <Card className="no-print p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Ordens de compra</h2>
          <div className="flex flex-wrap gap-2">
            {(["pendente", "separada", "todas"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={cn("min-h-11 rounded-xl border-2 px-4 text-sm font-bold", filtro === f ? "border-black bg-black text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand hover:bg-orange-50")}
              >
                {f === "pendente" ? "Pendentes" : f === "separada" ? "Separadas" : "Todas"} ({ordens.filter((o) => f === "todas" || o.status === f).length})
              </button>
            ))}
          </div>
        </div>

        {visiveis.length === 0 ? (
          <p className="py-8 text-center text-slate-500">{ordens.length === 0 ? "Nenhuma OC importada ainda. Envie os PDFs acima." : "Nenhuma OC neste filtro."}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <button type="button" className="font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700" onClick={() => setSel((p) => new Set([...p, ...visiveis.map((o) => o.id)]))}>
                Marcar todas da lista
              </button>
              <button type="button" className="font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700" onClick={() => setSel((p) => new Set([...p].filter((id) => !visiveis.some((o) => o.id === id))))}>
                Desmarcar todas da lista
              </button>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {visiveis.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2">
                  <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={sel.has(o.id)} onChange={() => alternar(o.id)} className="h-6 w-6 shrink-0 accent-orange-500" />
                    <span className="min-w-0">
                      <span className="font-extrabold">OC {o.numero}</span>
                      <span className="ml-2 text-sm text-slate-600">{o.empresa.replace(/^ORBENK\s*/i, "Orbenk ")}</span>
                      <span className="block text-sm text-slate-500">
                        entrega {fmtData(o.entrega)} · {formatNumber(o.itens.length)} itens · {formatNumber(o.pecas)} peças
                        {o.status === "separada" && <span className="ml-2 font-bold text-emerald-700">separada</span>}
                      </span>
                    </span>
                  </label>
                  {canWrite && (
                    <button type="button" onClick={() => setApagar(o)} aria-label={`Excluir OC ${o.numero}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {pendencias.length > 0 && (
        <Card className="border-2 border-amber-400 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-amber-900">
              <AlertTriangle className="h-5 w-5" aria-hidden /> {formatNumber(pendencias.reduce((s, p) => s + p.qtd, 0))} peças sem ligação com os nossos códigos
            </h2>
            {canWrite && (
              <Button asChild size="sm" className="no-print">
                <Link href="/consolidacao/ligacoes">Ligar agora</Link>
              </Button>
            )}
          </div>
          <ul className="mt-3 divide-y divide-amber-200 text-sm">
            {pendencias.map((p) => (
              <li key={`${p.cod}|${p.tam}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1.5">
                <span className="min-w-0">
                  <span className="font-mono font-bold">{p.cod}</span> <span className="font-bold">{p.tam}</span> · {p.desc}
                  <span className="block text-amber-800">{p.motivo} · OC {[...p.ocs].join(", ")}</span>
                </span>
                <span className="font-extrabold tabular-nums">{formatNumber(p.qtd)} un.</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Lista para separar</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {formatNumber(selecionadas.length)} {selecionadas.length === 1 ? "OC" : "OCs"} · {formatNumber(linhas.length)} itens diferentes · <strong>{formatNumber(totalSeparar)}</strong> peças a separar
              {pecas !== totalSeparar && <span className="text-amber-700"> (de {formatNumber(pecas)} nas OCs)</span>}
            </p>
            {totalFalta > 0 && <p className="mt-0.5 text-sm font-bold text-rose-700">Faltam {formatNumber(totalFalta)} peças no estoque para atender tudo.</p>}
            {selecionadas.length > 0 && <p className="print-only mt-1 hidden text-sm">OCs: {selecionadas.map((o) => o.numero).join(", ")}</p>}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => window.print()} disabled={linhas.length === 0}>
              <Printer className="h-5 w-5" aria-hidden /> Imprimir
            </Button>
            {canWrite && selecionadas.some((o) => o.status === "pendente") && (
              <Button type="button" size="lg" loading={pending} onClick={() => marcar("separada")}>
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Marcar como separadas
              </Button>
            )}
            {canWrite && selecionadas.some((o) => o.status === "separada") && (
              <Button type="button" variant="outline" size="lg" loading={pending} onClick={() => marcar("pendente")}>
                <Undo2 className="h-5 w-5" aria-hidden /> Reabrir
              </Button>
            )}
          </div>
        </div>

        {linhas.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Marque uma ou mais OCs acima para ver o que precisa ser separado.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {grupos.map(({ secao, itens }) => (
              <section key={secao.value}>
                <h3 className="border-b-2 border-slate-900 pb-1 text-sm font-extrabold uppercase tracking-wide text-slate-800">
                  {secao.label} <span className="font-semibold text-slate-500">· {formatNumber(itens.reduce((s, l) => s + l.qtd, 0))} un.</span>
                </h3>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500">
                      <th className="w-8 py-1.5 pr-1" aria-label="Separado" />
                      <th className="py-1.5 pr-2 font-bold">Peça</th>
                      <th className="px-2 py-1.5 text-right font-bold">Separar</th>
                      <th className="px-2 py-1.5 text-right font-bold">Estoque</th>
                      <th className="py-1.5 pl-2 text-right font-bold">Falta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itens.map((l) => {
                      const falta = Math.max(0, l.qtd - l.estoque);
                      return (
                        <tr key={l.codigo} className={cn(falta > 0 && "bg-rose-50")}>
                          <td className="w-8 py-2 pr-1 align-middle">
                            <span className="block h-5 w-5 rounded border-2 border-slate-700 bg-white" aria-hidden />
                          </td>
                          <td className="py-2 pr-2">
                            <span className="font-semibold">{l.produto}</span>
                            <span className="block font-mono text-xs text-slate-500">
                              {l.codigo}
                              {l.incerto && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans font-bold text-amber-800">ligação a confirmar</span>}
                              <span className="ml-2 font-sans">OC {[...l.ocs].join(", ")}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right text-xl font-extrabold tabular-nums">{formatNumber(l.qtd)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">{formatNumber(l.estoque)}</td>
                          <td className={cn("py-2 pl-2 text-right font-extrabold tabular-nums", falta > 0 ? "text-rose-700" : "text-slate-300")}>{falta > 0 ? formatNumber(falta) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!apagar}
        onOpenChange={(o) => !o && setApagar(null)}
        title={`Excluir a OC ${apagar?.numero ?? ""}?`}
        description="A OC e os itens dela saem da lista. Isso não altera o estoque."
        confirmLabel="EXCLUIR"
        variant="danger"
        loading={pending}
        onConfirm={excluir}
      />
    </div>
  );
}
