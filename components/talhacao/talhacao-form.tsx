"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { addFuncionariaAction, registerTalhacaoAction, removeFuncionariaAction } from "@/app/actions/talhacao";
import { cn, formatNumber, newKey } from "@/lib/utils";
import { TAMANHOS_TALHACAO, ordemTamanho } from "@/lib/talhacao";

type Funcionaria = { id: string; nome: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TalhacaoForm({ funcionarias, pecas, hoje }: { funcionarias: Funcionaria[]; pecas: string[]; hoje: string }) {
  const router = useRouter();
  const [funcEscolhida, setFuncId] = React.useState(funcionarias[0]?.id ?? "");
  // se a lista mudou (nova/removida) e a escolhida saiu, usa a primeira
  const funcId = funcionarias.some((f) => f.id === funcEscolhida) ? funcEscolhida : (funcionarias[0]?.id ?? "");
  const [data, setData] = React.useState(hoje);
  const [peca, setPeca] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [listOpen, setListOpen] = React.useState(false);
  const [qtds, setQtds] = React.useState<Record<string, string>>({});
  const [obs, setObs] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [novaOpen, setNovaOpen] = React.useState(false);
  const [novoNome, setNovoNome] = React.useState("");
  const [novaPending, setNovaPending] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);

  const keyRef = React.useRef(newKey());
  const lock = React.useRef(false);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});


  const touch = () => {
    keyRef.current = newKey();
    setError(null);
  };

  const matches = React.useMemo(() => {
    const tokens = norm(query.trim()).split(/\s+/).filter(Boolean);
    const list = tokens.length === 0 ? pecas : pecas.filter((p) => tokens.every((t) => norm(p).includes(t)));
    return list.slice(0, 40);
  }, [query, pecas]);

  const tamanhos = TAMANHOS_TALHACAO.filter((t) => t in qtds);
  const total = tamanhos.reduce((s, t) => s + (parseInt(qtds[t] || "0", 10) || 0), 0);
  const semQtd = tamanhos.filter((t) => !(parseInt(qtds[t] || "0", 10) > 0));

  function escolherPeca(p: string) {
    touch();
    setPeca(p);
    setQuery(p);
    setListOpen(false);
    setQtds({});
  }

  function toggleTamanho(t: string) {
    touch();
    const jaTem = t in qtds;
    setQtds((prev) => {
      if (t in prev) {
        const resto = { ...prev };
        delete resto[t];
        return resto;
      }
      return { ...prev, [t]: "" };
    });
    if (!jaTem) setTimeout(() => inputs.current[t]?.focus(), 0);
  }

  function setQtd(t: string, v: string) {
    touch();
    setQtds((prev) => ({ ...prev, [t]: v.replace(/\D/g, "").slice(0, 6) }));
  }

  const blocker = !funcId
    ? "Cadastre ou selecione a funcionária"
    : !data
      ? "Informe a data"
      : !peca
        ? "Selecione a peça"
        : tamanhos.length === 0
          ? "Escolha ao menos um tamanho"
          : semQtd.length > 0
            ? "Informe a quantidade de todos os tamanhos escolhidos"
            : null;

  async function salvar() {
    if (lock.current || blocker) {
      if (blocker) setError(blocker);
      return;
    }
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await registerTalhacaoAction({
        funcionariaId: funcId,
        data,
        peca,
        key: keyRef.current,
        observacao: obs,
        itens: tamanhos.map((t) => ({ tamanho: t, quantidade: parseInt(qtds[t], 10) })),
      });
      if (res.ok) {
        toast.success(res.data.repetido ? "Este lançamento já havia sido salvo." : `Lançamento salvo: ${formatNumber(res.data.pecas)} peças.`);
        keyRef.current = newKey();
        setPeca("");
        setQuery("");
        setQtds({});
        setObs("");
        router.refresh();
      } else {
        setError(res.error);
        keyRef.current = newKey();
      }
    } catch {
      setError("Falha de conexão. Verifique a rede e salve de novo — o lançamento não será duplicado.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function criarFuncionaria(e: React.FormEvent) {
    e.preventDefault();
    if (novaPending) return;
    setNovaPending(true);
    const res = await addFuncionariaAction(novoNome);
    setNovaPending(false);
    if (res.ok) {
      toast.success(`${res.data.nome} cadastrada.`);
      setFuncId(res.data.id);
      setNovaOpen(false);
      setNovoNome("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function removerFuncionaria() {
    setRemovePending(true);
    const res = await removeFuncionariaAction(funcId);
    setRemovePending(false);
    setRemoveOpen(false);
    if (res.ok) {
      toast.success("Funcionária removida da lista (os lançamentos antigos continuam salvos).");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const funcAtual = funcionarias.find((f) => f.id === funcId);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">Novo lançamento — Talhação</h2>

      <div className="space-y-4">
        <Field label="Funcionária" htmlFor="t-func">
          <div className="flex gap-2">
            <Select id="t-func" value={funcId} onChange={(e) => { touch(); setFuncId(e.target.value); }} className="min-w-0 flex-1">
              {funcionarias.length === 0 && <option value="">Nenhuma cadastrada</option>}
              {funcionarias.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="lg" onClick={() => setNovaOpen(true)} className="h-12">
              + Nova
            </Button>
            <Button type="button" variant="outline" size="lg" disabled={!funcId} onClick={() => setRemoveOpen(true)} className="h-12 border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
              Remover
            </Button>
          </div>
        </Field>

        <Field label="Data" htmlFor="t-data">
          <Input id="t-data" type="date" value={data} max={hoje} onChange={(e) => { touch(); setData(e.target.value); }} className="h-12" />
        </Field>

        <div className="relative">
          <label htmlFor="t-peca" className="mb-1.5 block text-sm font-semibold text-slate-700">Peça</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              id="t-peca"
              value={query}
              autoComplete="off"
              placeholder="Digite para buscar peça…"
              onFocus={() => setListOpen(true)}
              onChange={(e) => {
                touch();
                setQuery(e.target.value);
                if (peca) {
                  setPeca("");
                  setQtds({});
                }
                setListOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && listOpen && matches[0]) {
                  e.preventDefault();
                  escolherPeca(matches[0]);
                }
                if (e.key === "Escape") setListOpen(false);
              }}
              className="h-12 pl-12"
            />
          </div>
          {listOpen && !peca && (
            <>
              <button type="button" aria-label="Fechar lista" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setListOpen(false)} />
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white shadow-lg" role="listbox" aria-label="Peças">
                {matches.length === 0 && <p className="px-4 py-3 text-slate-500">Nenhuma peça encontrada para “{query}”.</p>}
                {matches.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => escolherPeca(p)}
                    className="block min-h-12 w-full border-b border-slate-100 px-4 py-2.5 text-left font-semibold last:border-0 hover:bg-orange-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {peca && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Tamanho (pode escolher mais de um)</p>
            <div className="flex flex-wrap gap-2">
              {TAMANHOS_TALHACAO.map((t) => {
                const on = t in qtds;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTamanho(t)}
                    className={cn(
                      "min-h-12 min-w-12 rounded-xl border-2 px-4 text-base font-bold transition-colors",
                      on ? "border-brand bg-brand text-black" : "border-slate-200 bg-white text-slate-800 hover:border-brand hover:bg-orange-50",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {tamanhos.length > 0 && (
              <div className="mt-4 space-y-2">
                {tamanhos
                  .slice()
                  .sort((a, b) => ordemTamanho(a) - ordemTamanho(b))
                  .map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="flex h-12 min-w-14 items-center justify-center rounded-xl bg-brand px-3 text-base font-extrabold text-black">{t}</span>
                      <input
                        ref={(el) => {
                          inputs.current[t] = el;
                        }}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        aria-label={`Quantidade talhada no tamanho ${t}`}
                        placeholder="Quantidade"
                        value={qtds[t] ?? ""}
                        onChange={(e) => setQtd(t, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                      />
                      <button
                        type="button"
                        onClick={() => toggleTamanho(t)}
                        aria-label={`Tirar o tamanho ${t}`}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <Field label="Observações (opcional)" htmlFor="t-obs">
          <Input id="t-obs" value={obs} maxLength={300} placeholder="Ex.: tecido novo, sobra do lote anterior…" onChange={(e) => { touch(); setObs(e.target.value); }} className="h-12" />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        <Button type="button" size="lg" loading={pending} disabled={!!blocker} onClick={salvar} className="w-full">
          Salvar lançamento{total > 0 ? ` · ${formatNumber(total)} peças` : ""}
        </Button>
        {blocker && (peca || query) && <p className="-mt-2 text-center text-sm text-slate-500">{blocker}</p>}
      </div>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <form onSubmit={criarFuncionaria} autoComplete="off">
            <DialogHeader>
              <DialogTitle>Nova funcionária</DialogTitle>
              <DialogDescription>Ela passa a aparecer na lista de quem talha.</DialogDescription>
            </DialogHeader>
            <Field label="Nome" htmlFor="t-novo-nome">
              <Input id="t-novo-nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={60} required autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setNovaOpen(false)}>Cancelar</Button>
              <Button type="submit" size="lg" loading={novaPending} disabled={novoNome.trim().length < 2}>Cadastrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remover ${funcAtual?.nome ?? "funcionária"} da lista?`}
        description="Ela deixa de aparecer para novos lançamentos. Os lançamentos que já foram feitos continuam salvos."
        confirmLabel="REMOVER"
        variant="danger"
        loading={removePending}
        onConfirm={removerFuncionaria}
      />
    </Card>
  );
}
