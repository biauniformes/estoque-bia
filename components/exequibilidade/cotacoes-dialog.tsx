"use client";

import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { novoId } from "@/lib/exequibilidade/defaults";
import { formatBRL } from "@/lib/exequibilidade/format";
import { rotuloCategoria, type Anexo } from "@/lib/exequibilidade/licitacao";
import {
  aplicarCotacoes,
  COTACAO_CV_ALTO,
  COTACAO_VALIDADE_DIAS,
  COTACOES_RECOMENDADAS,
  CRITERIOS_COTACAO,
  resumoCotacoes,
} from "@/lib/exequibilidade/cotacoes";
import type { Cotacao, Insumo } from "@/lib/exequibilidade/types";
import { Campo, NumberField, SelectField } from "./fields";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "./ui";

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CotacoesDialog({
  insumo,
  anexos,
  onChange,
  onClose,
}: {
  insumo: Insumo | null;
  anexos: Anexo[];
  onChange: (i: Insumo) => void;
  onClose: () => void;
}) {
  if (!insumo) return null;
  const cs = insumo.cotacoes ?? [];
  const criterio = insumo.criterioCotacao ?? "menor";
  const r = resumoCotacoes(cs);
  const salvar = (patch: Partial<Insumo>) => onChange(aplicarCotacoes({ ...insumo, ...patch }));
  const setCot = (id: string, patch: Partial<Cotacao>) => salvar({ cotacoes: cs.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const docs = anexos.filter((x) => ["cotacao", "nota_fiscal", "contrato"].includes(x.categoria));
  const outros = anexos.filter((x) => !["cotacao", "nota_fiscal", "contrato"].includes(x.categoria));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Quadro de cotações</DialogTitle>
          <DialogDescription>
            <b className="text-slate-800">{insumo.descricao || "Insumo sem descrição"}</b> — preço por {insumo.unidade || "unidade"}.
            Anote quanto cada fornecedor cobrou. O ideal são {COTACOES_RECOMENDADAS} cotações recentes, cada uma com o
            orçamento guardado em Anexos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {cs.length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              Nenhuma cotação ainda. Toque em “Adicionar cotação”.
            </p>
          )}
          {cs.map((c, n) => (
            <div key={c.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.4fr_9.5rem_9rem_1.4fr_auto] sm:items-end">
              <Campo rotulo={`Fornecedor ${n + 1}`}>
                <Input className="h-11" value={c.fornecedor} placeholder="Ex.: Malharia Santa Rita" onChange={(e) => setCot(c.id, { fornecedor: e.target.value })} />
              </Campo>
              <Campo rotulo="Data da cotação">
                <Input className="h-11" type="date" value={c.data} onChange={(e) => setCot(c.id, { data: e.target.value })} />
              </Campo>
              <Campo rotulo={`Preço por ${insumo.unidade || "un"}`}>
                <NumberField prefix="R$" value={c.valor} onChange={(v) => setCot(c.id, { valor: v })} />
              </Campo>
              <Campo rotulo="Documento (em Anexos)">
                <Select className="h-11 w-full" value={c.anexoId ?? ""} onChange={(e) => setCot(c.id, { anexoId: e.target.value || null })}>
                  <option value="">— sem documento —</option>
                  {docs.length > 0 && (
                    <optgroup label="Cotações, notas e contratos">
                      {docs.map((x) => (
                        <option key={x.id} value={x.id}>{x.descricao} ({rotuloCategoria(x.categoria)})</option>
                      ))}
                    </optgroup>
                  )}
                  {outros.length > 0 && (
                    <optgroup label="Outros anexos">
                      {outros.map((x) => (
                        <option key={x.id} value={x.id}>{x.descricao}</option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </Campo>
              <Button variant="ghost" size="icon" aria-label={`Remover cotação ${n + 1}`} onClick={() => salvar({ cotacoes: cs.filter((k) => k.id !== c.id) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => salvar({ cotacoes: [...cs, { id: novoId(), fornecedor: "", data: hojeISO(), valor: 0, anexoId: null }] })}
            >
              <Plus /> Adicionar cotação
            </Button>
            {anexos.length === 0 && (
              <span className="text-xs text-slate-500">Para ligar o documento, envie antes o orçamento na aba “Anexos”.</span>
            )}
          </div>
        </div>

        {r && (
          <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Info rotulo="Menor preço" valor={formatBRL(r.menor)} />
              <Info rotulo="Preço do meio (mediana)" valor={formatBRL(r.mediana)} />
              <Info rotulo="Média" valor={formatBRL(r.media)} />
              <Info rotulo="Maior preço" valor={formatBRL(r.maior)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Campo rotulo="Qual valor usar como custo na planilha?">
                <SelectField value={criterio} opcoes={CRITERIOS_COTACAO} onChange={(v) => salvar({ criterioCotacao: v })} />
              </Campo>
              <div className="text-right">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Custo na planilha</div>
                {criterio === "manual" ? (
                  <NumberField className="w-40" prefix="R$" value={insumo.custoUnitario} onChange={(v) => onChange({ ...insumo, custoUnitario: v })} />
                ) : (
                  <div className="text-2xl font-extrabold tabular-nums">{formatBRL(insumo.custoUnitario)}</div>
                )}
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              <Check ok={r.n >= COTACOES_RECOMENDADAS} texto={`${r.n} cotação(ões) — recomendado: ${COTACOES_RECOMENDADAS} ou mais`} />
              <Check ok={r.n < 2 || r.cv <= COTACAO_CV_ALTO} texto={r.n < 2 ? "Variação de preços: precisa de 2 cotações para comparar" : `Variação entre os preços: ${r.cv.toFixed(0)}% ${r.cv > COTACAO_CV_ALTO ? "(alta: confira se é o mesmo produto, gramatura e unidade)" : "(normal)"}`} />
              <Check ok={r.maisAntigaDias === null || r.maisAntigaDias <= COTACAO_VALIDADE_DIAS} texto={r.maisAntigaDias === null ? "Informe a data das cotações" : `Cotação mais antiga: ${r.maisAntigaDias} dia(s) ${r.maisAntigaDias > COTACAO_VALIDADE_DIAS ? `(mais de ${COTACAO_VALIDADE_DIAS} dias: peça uma nova)` : ""}`} />
              <Check ok={r.semDocumento === 0} texto={r.semDocumento === 0 ? "Todas as cotações têm documento" : `${r.semDocumento} cotação(ões) sem documento anexado`} />
              {criterio === "manual" && insumo.custoUnitario < r.menor - 0.005 && (
                <Check ok={false} texto="O custo digitado está abaixo da menor cotação: esse valor não está comprovado." />
              )}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Pronto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function Check({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-emerald-800" : "font-semibold text-amber-800"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      {texto}
    </li>
  );
}
