"use client";

import { useRef, useState } from "react";
import {
  BarChart3,
  Calculator,
  Download,
  FileText,
  FlaskConical,
  Gavel,
  Percent,
  RotateCcw,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalise } from "@/hooks/use-analise-exequibilidade";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { AnalisePanel } from "./analise-panel";
import { BdiPanel } from "./bdi-panel";
import { CustosPanel } from "./custos-panel";
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
} from "./ui";

const ABAS = [
  { v: "parametros", rotulo: "Parâmetros", Icone: Gavel },
  { v: "custos", rotulo: "Custos", Icone: Calculator },
  { v: "bdi", rotulo: "BDI e tributos", Icone: Percent },
  { v: "analise", rotulo: "Análise", Icone: BarChart3 },
  { v: "minuta", rotulo: "Minuta de defesa", Icone: FileText },
] as const;

type Aba = (typeof ABAS)[number]["v"];

export function ExequibilidadeView() {
  const ctx = useAnalise();
  const { analise: a, resultado: r } = ctx;
  const [aba, setAba] = useState<Aba>("parametros");
  const [confirmarNova, setConfirmarNova] = useState(false);
  const [erroImport, setErroImport] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }));
    const l = document.createElement("a");
    l.href = url;
    l.download = `exequibilidade-${(a.identificacao.edital || "analise").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    l.click();
    URL.revokeObjectURL(url);
  };

  const importar = async (f: File | undefined) => {
    if (!f) return;
    setErroImport(!ctx.importar(await f.text()));
    if (arquivo.current) arquivo.current.value = "";
  };

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={ctx.carregarExemplo}>
          <FlaskConical className="h-4 w-4" /> Exemplo
        </Button>
        <Button size="sm" variant="outline" onClick={exportar}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Button size="sm" variant="outline" onClick={() => arquivo.current?.click()}>
          <Upload className="h-4 w-4" /> Importar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmarNova(true)}>
          <RotateCcw className="h-4 w-4" /> Nova análise
        </Button>
        <input
          ref={arquivo}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => importar(e.target.files?.[0])}
        />
      </div>

      {/* Resumo ao vivo: sempre visível durante a disputa */}
      <div className="no-print z-30 mb-4 rounded-2xl border-2 border-slate-200 bg-white shadow-sm md:sticky md:top-2">
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-5">
          <Metrica rotulo="Preço ofertado" valor={formatBRL(a.parametros.precoOfertado)} />
          <Metrica rotulo="% do estimado" valor={r.percentualDoEstimado !== null ? formatPct(r.percentualDoEstimado) : "—"} />
          <Metrica rotulo="Limite inexequível" valor={formatBRL(r.limiteLegal)} />
          <Metrica
            rotulo="Lucro / margem"
            valor={
              r.custos.custoDireto > 0
                ? `${formatBRL(r.decomposicao.lucro)} · ${formatPct(r.decomposicao.margemSobrePreco, 1)}`
                : "—"
            }
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

      <p className="no-print mt-6 text-center text-xs text-slate-500">
        Os dados desta análise ficam salvos apenas neste navegador
        {ctx.salvoEm ? ` (salvo às ${ctx.salvoEm.toLocaleTimeString("pt-BR")})` : ""}. Use “Exportar” para guardar cada
        licitação.
      </p>

      <Dialog open={confirmarNova} onOpenChange={setConfirmarNova}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar nova análise?</DialogTitle>
            <DialogDescription>
              Todos os dados atuais serão apagados deste navegador. Exporte antes se quiser guardá-los.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarNova(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                ctx.novaAnalise();
                setConfirmarNova(false);
                setAba("parametros");
              }}
            >
              Apagar e começar
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
