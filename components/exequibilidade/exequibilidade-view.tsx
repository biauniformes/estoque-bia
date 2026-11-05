"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Calculator,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Gavel,
  Paperclip,
  Percent,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalise } from "@/hooks/use-analise-exequibilidade";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { atualizarCabecalhoAction, excluirLicitacaoAction, salvarAnaliseAction } from "@/app/actions/licitacoes";
import { STATUS_LICITACAO, type Anexo, type Checklist, type StatusLicitacao } from "@/lib/exequibilidade/licitacao";
import type { Analise } from "@/lib/exequibilidade/types";
import { Select } from "@/components/ui/input";
import { AnalisePanel } from "./analise-panel";
import { AnexosPanel } from "./anexos-panel";
import { BdiPanel } from "./bdi-panel";
import { CustosPanel } from "./custos-panel";
import { HabilitacaoPanel } from "./habilitacao-panel";
import { MinutaPanel } from "./minuta-panel";
import { ParametrosPanel } from "./parametros-panel";
import { StatusBadge } from "./status-badge";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "./ui";

const ABAS = [
  { v: "parametros", rotulo: "Parâmetros", Icone: Gavel },
  { v: "custos", rotulo: "Custos", Icone: Calculator },
  { v: "bdi", rotulo: "BDI e tributos", Icone: Percent },
  { v: "analise", rotulo: "Análise", Icone: BarChart3 },
  { v: "minuta", rotulo: "Minuta de defesa", Icone: FileText },
  { v: "habilitacao", rotulo: "Habilitação", Icone: ClipboardCheck },
  { v: "anexos", rotulo: "Anexos", Icone: Paperclip },
] as const;

type Aba = (typeof ABAS)[number]["v"];

export type LicitacaoCabecalho = { id: string; titulo: string; status: StatusLicitacao; data_sessao: string | null };

export function ExequibilidadeView({
  licitacao,
  inicial,
  checklist,
  anexos,
  documentosEmpresa,
}: {
  licitacao: LicitacaoCabecalho;
  inicial: Analise;
  checklist: Checklist;
  anexos: Anexo[];
  documentosEmpresa: Anexo[];
}) {
  const router = useRouter();
  const ctx = useAnalise(inicial, async (a) => {
    const r = await salvarAnaliseAction(licitacao.id, a);
    return r.ok ? null : r.error;
  });
  const { analise: a, resultado: r } = ctx;
  const [aba, setAba] = useState<Aba>("parametros");
  const [erroImport, setErroImport] = useState(false);
  const [titulo, setTitulo] = useState(licitacao.titulo);
  const [status, setStatus] = useState<StatusLicitacao>(licitacao.status);
  const [sessao, setSessao] = useState(licitacao.data_sessao ?? "");
  const [msgCab, setMsgCab] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [pending, start] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);

  const salvarCabecalho = (patch: { titulo?: string; status?: StatusLicitacao; sessao?: string }) => {
    const t = patch.titulo ?? titulo;
    const s = patch.status ?? status;
    const d = patch.sessao ?? sessao;
    start(async () => {
      const res = await atualizarCabecalhoAction(licitacao.id, { titulo: t, status: s, dataSessao: d });
      setMsgCab(res.ok ? null : res.error);
    });
  };

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }));
    const l = document.createElement("a");
    l.href = url;
    l.download = `exequibilidade-${(a.identificacao.edital || titulo || "analise").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    l.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (f: File | undefined) => {
    if (!f) return;
    setErroImport(!ctx.importar(await f.text()));
    if (arquivo.current) arquivo.current.value = "";
  };

  const salvoTxt =
    ctx.estado === "salvando" ? "Salvando…" : ctx.estado === "pendente" ? "Alterações não salvas…" : ctx.estado === "erro" ? "Erro ao salvar" : ctx.salvoEm ? `Salvo às ${ctx.salvoEm.toLocaleTimeString("pt-BR")}` : "Salvo";

  return (
    <div>
      <div className="no-print mb-4 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <Link href="/exequibilidade"><ArrowLeft className="h-4 w-4" /> Licitações</Link>
          </Button>
          <Input
            aria-label="Nome da licitação"
            value={titulo}
            maxLength={200}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => titulo.trim().length >= 2 && titulo !== licitacao.titulo && salvarCabecalho({ titulo })}
            className="h-11 min-w-56 flex-1 text-lg font-extrabold"
          />
          <Select
            aria-label="Situação da licitação"
            value={status}
            onChange={(e) => {
              const v = e.target.value as StatusLicitacao;
              setStatus(v);
              salvarCabecalho({ status: v });
            }}
            className="h-11 w-48"
          >
            {STATUS_LICITACAO.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            Sessão
            <Input
              type="date"
              aria-label="Data da sessão"
              value={sessao}
              onChange={(e) => {
                setSessao(e.target.value);
                salvarCabecalho({ sessao: e.target.value });
              }}
              className="h-11 w-44"
            />
          </label>
        </div>
        {msgCab && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{msgCab}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" asChild>
            <Link href={`/exequibilidade/${licitacao.id}/dossie`}><Printer className="h-4 w-4" /> Dossiê para imprimir / PDF</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await ctx.salvarAgora(); // garante que o Excel saia com os últimos dados
                window.open(`/exequibilidade/${licitacao.id}/excel`, "_self");
              })
            }
          >
            <FileSpreadsheet className="h-4 w-4" /> Baixar em Excel
          </Button>
          <Button size="sm" variant="outline" onClick={ctx.carregarExemplo}>
            <FlaskConical className="h-4 w-4" /> Exemplo
          </Button>
          <Button size="sm" variant="outline" onClick={exportar}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" variant="outline" onClick={() => arquivo.current?.click()}>
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExcluindo(true)} className="ml-auto text-red-700">
            <Trash2 className="h-4 w-4" /> Excluir licitação
          </Button>
          <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
        </div>
      </div>

      {/* Resumo ao vivo: sempre visível durante a disputa */}
      <div className="no-print z-30 mb-4 rounded-2xl border-2 border-slate-200 bg-white shadow-sm md:sticky md:top-2">
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-5">
          <Metrica rotulo="Preço ofertado" valor={formatBRL(a.parametros.precoOfertado)} />
          <Metrica rotulo="% do estimado" valor={r.percentualDoEstimado !== null ? formatPct(r.percentualDoEstimado) : "—"} />
          <Metrica rotulo="Limite inexequível" valor={formatBRL(r.limiteLegal)} />
          <Metrica
            rotulo="Lucro / margem"
            valor={r.custos.custoDireto > 0 ? `${formatBRL(r.decomposicao.lucro)} · ${formatPct(r.decomposicao.margemSobrePreco, 1)}` : "—"}
            alerta={r.custos.custoDireto > 0 && r.decomposicao.lucro < 0}
          />
          <div className="col-span-2 flex items-center sm:col-span-1 sm:justify-end" aria-live="polite">
            <StatusBadge status={r.statusGeral} className="px-3 py-1 text-sm" />
          </div>
        </div>
      </div>

      <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Seções da análise">
        {ABAS.map(({ v, rotulo, Icone }) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={aba === v}
            onClick={() => setAba(v)}
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 font-bold",
              aba === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-2 ring-slate-200 hover:bg-slate-100",
            )}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === "parametros" && <ParametrosPanel ctx={ctx} />}
      {aba === "custos" && <CustosPanel ctx={ctx} />}
      {aba === "bdi" && <BdiPanel ctx={ctx} />}
      {aba === "analise" && <AnalisePanel ctx={ctx} />}
      {aba === "minuta" && <MinutaPanel ctx={ctx} />}
      {aba === "habilitacao" && (
        <HabilitacaoPanel licitacaoId={licitacao.id} inicial={checklist} anexos={anexos} documentosEmpresa={documentosEmpresa} />
      )}
      {aba === "anexos" && (
        <AnexosPanel
          licitacaoId={licitacao.id}
          anexos={anexos}
          titulo="Cotações, notas fiscais, atestados e laudos desta licitação"
          descricao="Guarde aqui a prova de cada custo da planilha. As certidões e documentos fixos da empresa ficam em Exequibilidade → Documentos da empresa."
        />
      )}

      <p
        className={cn("no-print mt-6 text-center text-xs", ctx.estado === "erro" ? "font-bold text-red-700" : "text-slate-500")}
        role="status"
      >
        {salvoTxt}
        {ctx.estado === "erro" && ctx.erro ? ` — ${ctx.erro}` : ". A análise é salva automaticamente no banco de dados."}
        {ctx.estado === "erro" && (
          <button type="button" className="ml-2 underline" onClick={() => void ctx.salvarAgora()}>
            Tentar de novo
          </button>
        )}
      </p>

      <Dialog open={excluindo} onOpenChange={setExcluindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta licitação?</DialogTitle>
            <DialogDescription>
              A análise, o checklist e todos os anexos desta licitação serão apagados e não poderão ser recuperados. Para
              apenas encerrar, use a situação “Arquivada”.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await excluirLicitacaoAction(licitacao.id);
                  if (res.ok) router.push("/exequibilidade");
                  else {
                    setMsgCab(res.error);
                    setExcluindo(false);
                  }
                })
              }
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={erroImport} onOpenChange={setErroImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivo inválido</DialogTitle>
            <DialogDescription>O arquivo não é uma análise exportada por este sistema.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErroImport(false)}>Ok</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metrica({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cn("truncate text-base font-extrabold tabular-nums", alerta && "text-red-700")}>{valor}</div>
    </div>
  );
}
