"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  FileUp,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { importarOcsAction, type ImportResultado } from "@/app/actions/oc";
import { formatNumber } from "@/lib/utils";

export function ImportCard({ aberto = false }: { aberto?: boolean }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [pending, setPending] = React.useState(false);
  const [resultados, setResultados] = React.useState<ImportResultado[] | null>(
    null,
  );

  async function importar() {
    if (files.length === 0 || pending) return;
    setPending(true);
    setResultados(null);
    const todos: ImportResultado[] = [];
    try {
      for (let i = 0; i < files.length; i += 8) {
        const fd = new FormData();
        for (const f of files.slice(i, i + 8)) fd.append("arquivos", f);
        const res = await importarOcsAction(fd);
        if (!res.ok) {
          toast.error(res.error);
          break;
        }
        todos.push(...res.data);
      }
    } catch {
      toast.error("Falha de conexão ao enviar os arquivos. Tente de novo.");
    }
    setResultados(todos);
    setPending(false);
    const novas = todos.filter((r) => r.ok && !r.duplicada).length;
    if (novas > 0)
      toast.success(
        `${novas} OC${novas === 1 ? "" : "s"} importada${novas === 1 ? "" : "s"}.`,
      );
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <details
      open={aberto || !!resultados}
      className="group no-print rounded-2xl border-2 border-slate-200 bg-white open:shadow-sm"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-extrabold">
          <FileUp className="h-5 w-5" aria-hidden /> Importar OCs do cliente
          (PDF)
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t-2 border-slate-100 px-5 pb-5 pt-3">
        <p className="text-sm text-slate-500">
          Escolha os PDFs das ordens de compra da Orbenk (pode ser vários de uma
          vez). O sistema lê os itens e liga aos nossos códigos.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,.PDF"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="min-w-0 flex-1 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-black file:px-4 file:py-2 file:font-bold file:text-white"
            aria-label="Arquivos PDF das ordens de compra"
          />
          <Button
            type="button"
            size="lg"
            loading={pending}
            disabled={files.length === 0}
            onClick={importar}
          >
            <FileUp className="h-5 w-5" aria-hidden /> Ler e importar
            {files.length > 0 ? ` (${files.length})` : ""}
          </Button>
        </div>

        {resultados && (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border-2 border-slate-200">
            {resultados.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-4 py-2.5 text-sm"
              >
                {r.ok && !r.duplicada && !r.aviso && (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                )}
                {r.ok && (r.duplicada || r.aviso) && (
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                    aria-hidden
                  />
                )}
                {!r.ok && (
                  <XCircle
                    className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{r.arquivo}</span>
                  {r.numero && (
                    <span className="ml-2 text-slate-600">OC {r.numero}</span>
                  )}
                  {r.ok && !r.duplicada && (
                    <span className="ml-2 text-slate-600">
                      · {formatNumber(r.itens ?? 0)} itens ·{" "}
                      {formatNumber(r.pecas ?? 0)} peças
                    </span>
                  )}
                  {r.duplicada && (
                    <span className="ml-2 font-semibold text-amber-700">
                      já estava importada — nada foi duplicado
                    </span>
                  )}
                  {r.aviso && (
                    <span className="block font-semibold text-amber-700">
                      {r.aviso}
                    </span>
                  )}
                  {r.erro && (
                    <span className="block font-semibold text-red-700">
                      {r.erro}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
