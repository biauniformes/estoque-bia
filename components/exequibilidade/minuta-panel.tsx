"use client";

import { useMemo, useState } from "react";
import { Check, Copy, FileDown, Printer, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui";
import { Button } from "./ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { Textarea } from "./ui";
import type { ChaveArgumento } from "@/lib/exequibilidade/types";
import type { UseAnalise } from "@/hooks/use-analise-exequibilidade";
import { ARGUMENTOS, gerarMinuta } from "@/lib/exequibilidade/minuta";
import { Campo, NumberField } from "./fields";

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function MinutaPanel({ ctx }: { ctx: UseAnalise }) {
  const { analise: a, resultado: r, atualizar } = ctx;
  const gerada = useMemo(() => gerarMinuta(a, r), [a, r]);
  const [editado, setEditado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const texto = editado ?? gerada.texto;

  const setArg = (k: ChaveArgumento, patch: Partial<(typeof a.defesa)[ChaveArgumento]>) => {
    setEditado(null);
    atualizar((x) => ({ ...x, defesa: { ...x.defesa, [k]: { ...x.defesa[k], ...patch } } }));
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const nomeArquivo = `defesa-exequibilidade-${(a.identificacao.edital || "proposta").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  const exportarDoc = () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Defesa de exequibilidade</title><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5}p{margin:0 0 6pt;text-align:justify;white-space:pre-wrap}</style></head><body>${texto
      .split("\n")
      .map((l) => `<p>${esc(l) || "&nbsp;"}</p>`)
      .join("")}</body></html>`;
    baixar(`${nomeArquivo}.doc`, html, "application/msword");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Card className="no-print h-fit">
        <CardHeader>
          <CardTitle>Fundamentos da defesa</CardTitle>
          <CardDescription>
            Marque somente o que é verdadeiro para a sua empresa e que você consiga comprovar com documentos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(ARGUMENTOS) as ChaveArgumento[]).map((k) => {
            const meta = ARGUMENTOS[k];
            const arg = a.defesa[k];
            return (
              <div key={k} className="rounded-lg border p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm font-medium leading-snug">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={arg.ativo}
                    onChange={(e) => setArg(k, { ativo: e.target.checked })}
                  />
                  <span>
                    {meta.titulo}
                    <span className="block text-xs font-normal text-muted-foreground">{meta.ajuda}</span>
                  </span>
                </label>
                {arg.ativo && (
                  <div className="mt-3 space-y-2">
                    {meta.temPercentual && (
                      <Campo rotulo={meta.rotuloPercentual ?? "Percentual"}>
                        <NumberField suffix="%" value={arg.percentual} onChange={(v) => setArg(k, { percentual: v })} />
                      </Campo>
                    )}
                    <Campo rotulo="Detalhe / evidência (opcional)">
                      <Textarea
                        rows={2}
                        value={arg.detalhe}
                        placeholder="Ex.: contrato de fornecimento nº…, cotação anexa…"
                        onChange={(e) => setArg(k, { detalhe: e.target.value })}
                      />
                    </Campo>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {gerada.avisos.length > 0 && (
          <Alert variant="destructive" className="no-print">
            <TriangleAlert />
            <AlertTitle>Antes de protocolar</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {gerada.avisos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <Card className="print-area">
          <CardHeader className="no-print">
            <CardTitle>Minuta de defesa / resposta à diligência</CardTitle>
            <CardDescription>
              Gerada em tempo real a partir dos seus cálculos. O texto abaixo é editável; marcar fundamentos ou
              alterar números regenera a minuta (e descarta edições manuais).
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={copiar}>
                {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar texto"}
              </Button>
              <Button size="sm" variant="outline" onClick={exportarDoc}>
                <FileDown /> Baixar .doc
              </Button>
              <Button size="sm" variant="outline" onClick={() => baixar(`${nomeArquivo}.txt`, texto, "text/plain;charset=utf-8")}>
                <FileDown /> Baixar .txt
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer /> Imprimir / PDF
              </Button>
              {editado !== null && (
                <Button size="sm" variant="ghost" onClick={() => setEditado(null)}>
                  Descartar edições
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              aria-label="Texto da minuta"
              value={texto}
              onChange={(e) => setEditado(e.target.value)}
              className="no-print min-h-[34rem] font-serif text-[0.95rem] leading-relaxed"
            />
            <pre className="hidden whitespace-pre-wrap font-serif text-[12pt] leading-relaxed print:block">{texto}</pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
