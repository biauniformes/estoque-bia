"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Printer, Trash2, Undo2 } from "lucide-react";
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

  const { linhas, pendencias } = React.useMemo(() => {
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

  const painel = "group rounded-2xl border-2 bg-white open:shadow-sm";
  const painelTitulo = "flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden";

  return (
    <div className="space-y-4">
      <style>{`@media print { aside, header, .no-print { display: none !important; } main { padding: 0 !important; } .print-only { display: block !important; } }`}</style>

      {/* barra de ações: sempre à vista, para imprimir sem rolar a página */}
      <div className="no-print sticky top-0 z-20 -mx-1 rounded-2xl border-2 border-slate-900 bg-white p-3 shadow-md sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {selecionadas.length === 0 ? (
              <p className="font-bold text-slate-600">Nenhuma OC marcada</p>
            ) : (
              <>
                <p className="text-lg font-extrabold leading-tight">
                  {formatNumber(totalSeparar)} <span className="text-sm font-bold text-slate-600">peças a separar</span>
                </p>
                <p className="text-sm text-slate-600">
                  {formatNumber(selecionadas.length)} {selecionadas.length === 1 ? "OC" : "OCs"} · {formatNumber(linhas.length)} itens diferentes
                  {totalFalta > 0 && <span className="font-bold text-rose-700"> · faltam {formatNumber(totalFalta)} no estoque</span>}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" onClick={() => window.print()} disabled={linhas.length === 0}>
              <Printer className="h-5 w-5" aria-hidden /> Imprimir
            </Button>
            {canWrite && selecionadas.some((o) => o.status === "pendente") && (
              <Button type="button" variant="outline" size="lg" loading={pending} onClick={() => marcar("separada")}>
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
      </div>

      {/* painéis recolhíveis: o que não é a lista fica fechado */}
      <details className={cn(painel, "no-print border-slate-200")}>
        <summary className={painelTitulo}>
          <span className="font-extrabold">
            Ordens de compra{" "}
            <span className="ml-1 text-sm font-semibold text-slate-600">
              {formatNumber(selecionadas.length)} marcadas de {formatNumber(ordens.length)}
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t-2 border-slate-100 px-5 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            {visiveis.length > 0 && (
              <div className="flex gap-3 text-sm">
                <button type="button" className="font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700" onClick={() => setSel((p) => new Set([...p, ...visiveis.map((o) => o.id)]))}>
                  Marcar todas
                </button>
                <button type="button" className="font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700" onClick={() => setSel((p) => new Set([...p].filter((id) => !visiveis.some((o) => o.id === id))))}>
                  Desmarcar todas
                </button>
              </div>
            )}
          </div>

          {visiveis.length === 0 ? (
            <p className="py-6 text-center text-slate-500">{ordens.length === 0 ? "Nenhuma OC importada ainda. Envie os PDFs em “Importar OCs”." : "Nenhuma OC neste filtro."}</p>
          ) : (
            <ul className="mt-2 grid max-h-96 gap-x-6 overflow-y-auto sm:grid-cols-2">
              {visiveis.map((o) => (
                <li key={o.id} className="flex items-center gap-2 border-b border-slate-100 py-1">
                  <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={sel.has(o.id)} onChange={() => alternar(o.id)} className="h-6 w-6 shrink-0 accent-orange-500" />
                    <span className="min-w-0">
                      <span className="font-extrabold">OC {o.numero}</span>
                      <span className="ml-2 text-sm text-slate-600">{o.empresa.replace(/^ORBENK\s*/i, "Orbenk ")}</span>
                      <span className="block truncate text-sm text-slate-500">
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
          )}
        </div>
      </details>

      {pendencias.length > 0 && (
        <details className={cn(painel, "no-print border-amber-400 bg-amber-50")}>
          <summary className={painelTitulo}>
            <span className="flex items-center gap-2 font-extrabold text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> {formatNumber(pendencias.reduce((s, p) => s + p.qtd, 0))} peças sem ligação com os nossos códigos
              <span className="text-sm font-semibold">({formatNumber(pendencias.length)} itens — ficam fora da lista)</span>
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 text-amber-900 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t-2 border-amber-200 px-5 pb-4 pt-3">
            {canWrite && (
              <Button asChild size="sm">
                <Link href="/consolidacao/ligacoes">Ligar agora</Link>
              </Button>
            )}
            <ul className="mt-2 max-h-96 divide-y divide-amber-200 overflow-y-auto text-sm">
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
          </div>
        </details>
      )}

      {/* cabeçalho que só aparece no papel */}
      <div className="print-only hidden">
        <h1 className="text-xl font-extrabold">Consolidação de OC — lista para separar</h1>
        <p className="text-sm">
          {formatNumber(selecionadas.length)} {selecionadas.length === 1 ? "OC" : "OCs"} ({selecionadas.map((o) => o.numero).join(", ")}) · {formatNumber(linhas.length)} itens · <strong>{formatNumber(totalSeparar)}</strong> peças a separar
          {totalFalta > 0 && <> · faltam {formatNumber(totalFalta)} no estoque</>}
        </p>
        {pendencias.length > 0 && <p className="text-sm font-bold">Atenção: {formatNumber(pendencias.reduce((s, p) => s + p.qtd, 0))} peças sem ligação não constam desta lista.</p>}
      </div>

      {linhas.length === 0 ? (
        <Card className="p-5">
          <p className="py-8 text-center text-slate-500">{ordens.length === 0 ? "Importe os PDFs das OCs para começar." : "Marque uma ou mais OCs em “Ordens de compra” para ver o que precisa ser separado."}</p>
        </Card>
      ) : (
        <>
          {grupos.length > 1 && (
            <nav className="no-print flex flex-wrap gap-2" aria-label="Ir para a seção">
              {grupos.map(({ secao, itens }) => (
                <a
                  key={secao.value}
                  href={`#secao-${secao.value}`}
                  className="min-h-11 rounded-full border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-brand hover:bg-orange-50"
                >
                  {secao.label} <span className="font-semibold text-slate-500">{formatNumber(itens.reduce((s, l) => s + l.qtd, 0))}</span>
                </a>
              ))}
            </nav>
          )}
          <Card className="p-5">
            <div className="space-y-6">
              {grupos.map(({ secao, itens }) => (
                <section key={secao.value} id={`secao-${secao.value}`} className="scroll-mt-28">
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
                          <tr key={l.codigo} className={cn("break-inside-avoid", falta > 0 && "bg-rose-50")}>
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
          </Card>
        </>
      )}

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
