"use client";

import { useState, useTransition } from "react";
import { PackageSearch } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from "./ui";
import { buscarProdutosAction } from "@/app/actions/licitacoes";
import { formatBRL } from "@/lib/exequibilidade/format";

type Produto = { id: string; codigo: string; nome: string; valor: number };

/** Puxa o valor unitário de um produto do cadastro do estoque para a planilha de custos. */
export function ProdutosDoEstoque({ onEscolher }: { onEscolher: (p: Produto) => void }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const buscar = (termo: string) => {
    setQ(termo);
    start(async () => {
      const r = await buscarProdutosAction(termo);
      if (r.ok) {
        setLista(r.data);
        setErro(null);
      } else setErro(r.error);
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <PackageSearch /> Produto do estoque
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Produto do estoque</DialogTitle>
            <DialogDescription>
              Busque pelo nome ou código. O valor unitário cadastrado vira o custo da linha (revise a quantidade e o custo).
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus aria-label="Buscar produto" placeholder="Ex.: camiseta pv ou 410.002" value={q} onChange={(e) => buscar(e.target.value)} className="h-11" />
          {erro && <p role="alert" className="text-sm font-semibold text-red-700">{erro}</p>}
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {lista.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    onEscolher(p);
                    setAberto(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.nome}</span>
                    <span className="text-xs text-slate-500">cód. {p.codigo}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{p.valor > 0 ? formatBRL(p.valor) : "sem valor"}</span>
                </button>
              </li>
            ))}
            {!pending && q.trim().length >= 2 && lista.length === 0 && <li className="py-4 text-center text-sm text-slate-500">Nenhum produto encontrado.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
