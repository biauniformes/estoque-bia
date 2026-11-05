"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "./ui";
import { salvarChecklistAction } from "@/app/actions/licitacoes";
import { CHECKLIST, diasParaVencer, progressoChecklist, type Anexo, type Checklist } from "@/lib/exequibilidade/licitacao";
import { cn } from "@/lib/utils";

export function HabilitacaoPanel({
  licitacaoId,
  inicial,
  anexos,
  documentosEmpresa,
}: {
  licitacaoId: string;
  inicial: Checklist;
  anexos: Anexo[];
  documentosEmpresa: Anexo[];
}) {
  const [lista, setLista] = useState<Checklist>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await salvarChecklistAction(licitacaoId, lista);
      setErro(r.ok ? null : r.error);
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lista, licitacaoId]);

  const set = (k: string, patch: { ok?: boolean; obs?: string }) =>
    setLista((c) => ({ ...c, [k]: { ...c[k], ok: c[k]?.ok ?? false, ...patch } }));

  const { total, ok } = progressoChecklist(lista);
  const todos = [...anexos, ...documentosEmpresa];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Habilitação e prova de exequibilidade</CardTitle>
          <CardDescription>
            Lista conforme a Lei 14.133/2021 (arts. 59, 62 a 70). A Administração só pode exigir o que estiver no edital:
            marque como pronto o que o edital pedir e confira cada item. Itens “se o edital exigir” podem ser ignorados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-600" style={{ width: `${total ? (ok / total) * 100 : 0}%` }} />
            </div>
            <p className="text-sm font-bold tabular-nums">{ok} de {total} prontos</p>
          </div>
          {erro && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Não foi possível salvar: {erro}</p>}
        </CardContent>
      </Card>

      {CHECKLIST.map((g) => (
        <Card key={g.chave}>
          <CardHeader>
            <CardTitle>{g.titulo}</CardTitle>
            <CardDescription>{g.descricao}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100">
            {g.itens.map((i) => {
              const feito = !!lista[i.chave]?.ok;
              const docs = todos.filter((a) => a.item === i.chave);
              const vencidos = docs.filter((a) => (diasParaVencer(a.validade) ?? 1) < 0);
              const aVencer = docs.filter((a) => {
                const d = diasParaVencer(a.validade);
                return d !== null && d >= 0 && d <= 30;
              });
              return (
                <div key={i.chave} className="grid gap-2 py-3 sm:grid-cols-[1fr_16rem]">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={feito}
                      onChange={(e) => set(i.chave, { ok: e.target.checked })}
                      className="mt-1 h-6 w-6 shrink-0 accent-emerald-600"
                    />
                    <span>
                      <span className={cn("font-bold", feito && "text-emerald-800")}>{i.titulo}</span>
                      <span className="block text-xs text-slate-500">
                        {i.base}
                        {i.condicional && " · se o edital exigir"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {docs.length > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> {docs.length} documento(s) guardado(s)
                          </span>
                        ) : (
                          <span className="text-slate-500">Sem documento guardado para este item</span>
                        )}
                        {vencidos.length > 0 && (
                          <span className="inline-flex items-center gap-1 font-bold text-red-700">
                            <AlertTriangle className="h-4 w-4" /> {vencidos.length} vencido(s)
                          </span>
                        )}
                        {aVencer.length > 0 && (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                            <AlertTriangle className="h-4 w-4" /> {aVencer.length} vence(m) em até 30 dias
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                  <Input
                    aria-label={`Observação: ${i.titulo}`}
                    placeholder="Observação (opcional)"
                    value={lista[i.chave]?.obs ?? ""}
                    maxLength={300}
                    onChange={(e) => set(i.chave, { obs: e.target.value })}
                    className="h-10"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
