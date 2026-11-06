"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { AlarmClock, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/input";
import { salvarPrazosAction } from "@/app/actions/licitacoes";
import { novoId } from "@/lib/exequibilidade/defaults";
import {
  diasParaVencer,
  formatDataBR,
  formatPrazo,
  nivelPrazo,
  rotuloTipoPrazo,
  textoContagem,
  TIPOS_PRAZO,
  type NivelPrazo,
  type Prazo,
  type TipoPrazo,
} from "@/lib/exequibilidade/licitacao";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "./ui";

/* Relógio compartilhado: atualiza a cada 30 s; no servidor é null (evita diferença de hidratação). */
const PASSO = 30_000;
function assinar(cb: () => void) {
  const t = setInterval(cb, PASSO);
  return () => clearInterval(t);
}
export function useAgora(): number | null {
  return useSyncExternalStore(assinar, () => Math.floor(Date.now() / PASSO) * PASSO, () => null);
}

const ESTILO: Record<NivelPrazo, string> = {
  vencido: "border-red-500 bg-red-50 text-red-900",
  urgente: "border-red-400 bg-red-50 text-red-900",
  proximo: "border-amber-400 bg-amber-50 text-amber-900",
  futuro: "border-slate-200 bg-white text-slate-800",
  concluido: "border-slate-200 bg-slate-50 text-slate-500 line-through",
};

const localISO = (ms: number) => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** Painel de prazos dentro da licitação. */
export function PrazosLicitacao({ licitacaoId, inicial }: { licitacaoId: string; inicial: Prazo[] }) {
  const [prazos, setPrazos] = useState<Prazo[]>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [pending, start] = useTransition();
  const agora = useAgora();

  const salvar = (lista: Prazo[]) => {
    const antes = prazos;
    const ordenada = [...lista].sort((x, y) => x.quando.localeCompare(y.quando));
    setPrazos(ordenada);
    start(async () => {
      const r = await salvarPrazosAction(licitacaoId, ordenada);
      if (!r.ok) {
        setErro(r.error);
        setPrazos(antes);
      } else setErro(null);
    });
  };

  const pendentes = prazos.filter((p) => !p.concluido);
  const concluidos = prazos.filter((p) => p.concluido);

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <AlarmClock className="h-4 w-4" aria-hidden /> Prazos
        </span>
        {pendentes.length === 0 && <span className="text-sm text-slate-500">Nenhum prazo pendente.</span>}
        {pendentes.map((p) => (
          <ChipPrazo key={p.id} p={p} agora={agora}>
            <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Marcar como concluído" title="Concluído" disabled={pending} onClick={() => salvar(prazos.map((x) => (x.id === p.id ? { ...x, concluido: true } : x)))}>
              <Check className="h-4 w-4" />
            </button>
            <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Excluir prazo" title="Excluir" disabled={pending} onClick={() => salvar(prazos.filter((x) => x.id !== p.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </ChipPrazo>
        ))}
        <Button size="sm" variant="outline" onClick={() => setNovo(true)}>
          <Plus className="h-4 w-4" /> Prazo
        </Button>
      </div>
      {concluidos.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-500">{concluidos.length} prazo(s) concluído(s)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {concluidos.map((p) => (
              <ChipPrazo key={p.id} p={p} agora={agora}>
                <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Reabrir prazo" title="Reabrir" disabled={pending} onClick={() => salvar(prazos.map((x) => (x.id === p.id ? { ...x, concluido: false } : x)))}>
                  <Undo2 className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Excluir prazo" title="Excluir" disabled={pending} onClick={() => salvar(prazos.filter((x) => x.id !== p.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </ChipPrazo>
            ))}
          </div>
        </details>
      )}
      {erro && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{erro}</p>}
      {novo && (
        <NovoPrazo
          onCancel={() => setNovo(false)}
          onSalvar={(p) => {
            setNovo(false);
            salvar([...prazos, p]);
          }}
        />
      )}
    </div>
  );
}

function ChipPrazo({ p, agora, children }: { p: Prazo; agora: number | null; children?: React.ReactNode }) {
  const nivel = agora === null ? (p.concluido ? "concluido" : "futuro") : nivelPrazo(p, agora);
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-xl border-2 py-1 pl-3 pr-1 text-sm", ESTILO[nivel])}>
      <span>
        <b>{p.descricao || rotuloTipoPrazo(p.tipo)}</b>
        <span className="block text-xs">
          {formatPrazo(p.quando)}
          {agora !== null && !p.concluido && <b className="ml-1">· {textoContagem(p, agora)}</b>}
        </span>
      </span>
      {children}
    </span>
  );
}

function NovoPrazo({ onCancel, onSalvar }: { onCancel: () => void; onSalvar: (p: Prazo) => void }) {
  const [tipo, setTipo] = useState<TipoPrazo>("diligencia");
  const [descricao, setDescricao] = useState("");
  const [quando, setQuando] = useState(() => localISO(Date.now() + 2 * 3600_000));
  const info = TIPOS_PRAZO.find((t) => t.value === tipo);
  const valido = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando);
  function atalho(horas: number) {
    setQuando(localISO(new Date().getTime() + horas * 3600_000));
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo prazo</DialogTitle>
          <DialogDescription>O sistema mostra quanto tempo falta e avisa na lista de licitações quando estiver perto de vencer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prazo-tipo">Tipo de prazo</Label>
            <Select id="prazo-tipo" className="h-11 w-full" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPrazo)}>
              {TIPOS_PRAZO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            {info?.dica && <p className="text-xs text-slate-500">{info.dica}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prazo-desc">Descrição (opcional)</Label>
            <Input id="prazo-desc" className="h-11" maxLength={200} value={descricao} placeholder={rotuloTipoPrazo(tipo)} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prazo-quando">Vence em (data e hora)</Label>
            <Input id="prazo-quando" type="datetime-local" className="h-11" value={quando} onChange={(e) => setQuando(e.target.value)} />
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ["+2 horas", 2],
                ["+24 horas", 24],
                ["+3 dias", 72],
                ["+5 dias", 120],
              ].map(([r, h]) => (
                <Button key={r} type="button" size="sm" variant="outline" onClick={() => atalho(h as number)}>{r}</Button>
              ))}
            </div>
            <p className="text-xs text-slate-500">Dias úteis não são calculados: confira feriados e fins de semana no edital.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={!valido} onClick={() => onSalvar({ id: novoId(), tipo, descricao: descricao.trim(), quando, concluido: false })}>
            Salvar prazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Alerta na lista de licitações: prazos vencidos ou que vencem em até 7 dias e sessões próximas. */
export function AlertaPrazos({
  itens,
}: {
  itens: { id: string; titulo: string; dataSessao: string | null; prazos: Prazo[] }[];
}) {
  const agora = useAgora();
  if (agora === null) return null;
  type Linha = { key: string; href: string; nome: string; titulo: string; quando: string; contagem: string; nivel: NivelPrazo };
  const linhas: Linha[] = [];
  for (const l of itens) {
    const href = `/exequibilidade/${l.id}`;
    for (const p of l.prazos) {
      const nivel = nivelPrazo(p, agora);
      if (nivel === "vencido" || nivel === "urgente" || nivel === "proximo")
        linhas.push({ key: l.id + p.id, href, nome: p.descricao || rotuloTipoPrazo(p.tipo), titulo: l.titulo, quando: p.quando, contagem: textoContagem(p, agora), nivel });
    }
    const dias = diasParaVencer(l.dataSessao, new Date(agora));
    if (l.dataSessao && dias !== null && dias >= 0 && dias <= 7)
      linhas.push({
        key: l.id + "sessao",
        href,
        nome: "Sessão pública",
        titulo: l.titulo,
        quando: `${l.dataSessao}T00:00`,
        contagem: dias === 0 ? "é hoje" : dias === 1 ? "é amanhã" : `em ${dias} dias`,
        nivel: dias <= 1 ? "urgente" : "proximo",
      });
  }
  if (!linhas.length) return null;
  linhas.sort((x, y) => x.quando.localeCompare(y.quando));
  const graves = linhas.some((x) => x.nivel !== "proximo");
  return (
    <div role="alert" className={cn("mb-4 rounded-2xl border-2 p-4", graves ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50")}>
      <p className={cn("mb-2 flex items-center gap-2 font-bold", graves ? "text-red-900" : "text-amber-900")}>
        <AlarmClock className="h-5 w-5" aria-hidden /> Prazos das licitações
      </p>
      <ul className="space-y-1.5">
        {linhas.map((x) => (
          <li key={x.key}>
            <Link href={x.href} className={cn("flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 hover:bg-black/5", x.nivel === "proximo" ? "text-amber-900" : "font-semibold text-red-900")}>
              <b>{x.nome}</b>
              <span>— {x.titulo}</span>
              <span className="text-sm">
                {x.key.endsWith("sessao") ? formatDataBR(x.quando.slice(0, 10)) : formatPrazo(x.quando)} · <b>{x.contagem}</b>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
