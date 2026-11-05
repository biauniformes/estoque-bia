"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "./ui";
import { Campo } from "./fields";
import { criarLicitacaoAction } from "@/app/actions/licitacoes";

const CHAVE_ANTIGA = "exequibilidade:analise:v1";

export function NovaLicitacao() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [json, setJson] = useState<string | undefined>();
  const [nomeArq, setNomeArq] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [antiga, setAntiga] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const arq = useRef<HTMLInputElement>(null);

  // análise feita antes (salva só neste navegador): oferece trazer para o banco
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE_ANTIGA);
      if (t) {
        const o = JSON.parse(t);
        if (o?.parametros && Array.isArray(o.insumos) && (o.insumos.length > 0 || o.parametros.precoOfertado > 0)) setAntiga(t);
      }
    } catch {
      /* sem armazenamento */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const criar = (analiseJson?: string, nome?: string) =>
    start(async () => {
      const r = await criarLicitacaoAction({ titulo: nome ?? titulo, analiseJson });
      if (r.ok) {
        if (analiseJson && analiseJson === antiga) {
          try {
            localStorage.removeItem(CHAVE_ANTIGA);
          } catch {
            /* ignore */
          }
        }
        router.push(`/exequibilidade/${r.data.id}`);
      } else setErro(r.error);
    });

  return (
    <>
      {antiga && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 text-sky-950">
          <p className="text-sm">
            <strong>Há uma análise salva só neste navegador</strong> (da versão anterior). Traga para o banco de dados para não perder.
          </p>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              const o = JSON.parse(antiga);
              criar(antiga, (o?.identificacao?.edital as string) || "Análise anterior");
            }}
          >
            Trazer para o banco
          </Button>
        </div>
      )}
      <Button size="lg" onClick={() => setAberto(true)}>
        <Plus className="h-5 w-5" aria-hidden /> Nova licitação
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova licitação</DialogTitle>
            <DialogDescription>Dê um nome para encontrar depois (órgão, número do pregão, ano).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Campo rotulo="Nome da licitação" htmlFor="nl-titulo">
              <Input
                id="nl-titulo"
                autoFocus
                value={titulo}
                maxLength={200}
                placeholder="Ex.: Pregão 12/2026 — Prefeitura de Exemplo"
                onChange={(e) => setTitulo(e.target.value)}
                className="h-11"
              />
            </Campo>
            <div>
              <Button size="sm" variant="outline" type="button" onClick={() => arq.current?.click()}>
                <Upload className="h-4 w-4" /> Começar de um arquivo exportado (opcional)
              </Button>
              {nomeArq && <span className="ml-2 text-sm text-slate-600">{nomeArq}</span>}
              <input
                ref={arq}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setJson(await f.text());
                    setNomeArq(f.name);
                  }
                }}
              />
            </div>
            {erro && <p role="alert" className="text-sm font-semibold text-red-700">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={pending || titulo.trim().length < 2} onClick={() => criar(json)}>
              {pending ? "Criando…" : "Criar e abrir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
