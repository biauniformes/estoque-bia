"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Trash2 } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "./ui";
import { Select } from "@/components/ui/input";
import { Campo } from "./fields";
import { enviarAnexoAction, excluirAnexoAction, urlAnexoAction } from "@/app/actions/licitacoes";
import {
  CATEGORIAS_ANEXO,
  CHECKLIST,
  diasParaVencer,
  formatDataBR,
  rotuloCategoria,
  type Anexo,
  type CategoriaAnexo,
} from "@/lib/exequibilidade/licitacao";
import { cn } from "@/lib/utils";

const ITENS = CHECKLIST.flatMap((g) => g.itens.map((i) => ({ chave: i.chave, rotulo: `${g.titulo.split(" ")[0]} — ${i.titulo}`, categoria: i.categoria })));

export function BadgeValidade({ validade }: { validade: string | null }) {
  const d = diasParaVencer(validade);
  if (d === null) return <span className="text-slate-400">—</span>;
  const cls = d < 0 ? "bg-red-100 text-red-800" : d <= 30 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800";
  const txt = d < 0 ? `Vencido há ${-d} d` : d === 0 ? "Vence hoje" : d <= 30 ? `Vence em ${d} d` : "Em dia";
  return (
    <span className="inline-flex flex-col">
      <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-bold", cls)}>{txt}</span>
      <span className="text-xs text-slate-500">{formatDataBR(validade)}</span>
    </span>
  );
}

export function AnexosPanel({
  licitacaoId,
  anexos,
  titulo,
  descricao,
  itemInicial,
}: {
  licitacaoId: string | null;
  anexos: Anexo[];
  titulo: string;
  descricao: string;
  itemInicial?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [categoria, setCategoria] = useState<CategoriaAnexo>("cotacao");
  const [item, setItem] = useState(itemInicial ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("licitacaoId", licitacaoId ?? "");
    start(async () => {
      const r = await enviarAnexoAction(fd);
      if (r.ok) {
        setMsg({ ok: true, texto: "Documento guardado." });
        formRef.current?.reset();
        setItem("");
        router.refresh();
      } else setMsg({ ok: false, texto: r.error });
    });
  };

  const abrir = (id: string) =>
    start(async () => {
      const r = await urlAnexoAction(id);
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else setMsg({ ok: false, texto: r.error });
    });

  const excluir = (a: Anexo) => {
    if (!window.confirm(`Excluir "${a.descricao}"? O arquivo será apagado.`)) return;
    start(async () => {
      const r = await excluirAnexoAction(a.id);
      if (r.ok) router.refresh();
      else setMsg({ ok: false, texto: r.error });
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
          <CardDescription>{descricao}</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={enviar} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Tipo de documento" htmlFor="an-cat">
              <Select id="an-cat" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaAnexo)}>
                {CATEGORIAS_ANEXO.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Item da habilitação (opcional)" htmlFor="an-item">
              <Select
                id="an-item"
                name="item"
                value={item}
                onChange={(e) => {
                  setItem(e.target.value);
                  const it = ITENS.find((i) => i.chave === e.target.value);
                  if (it) setCategoria(it.categoria);
                }}
              >
                <option value="">— nenhum —</option>
                {ITENS.map((i) => (
                  <option key={i.chave} value={i.chave}>{i.rotulo}</option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Descrição" htmlFor="an-desc" className="sm:col-span-2 lg:col-span-1">
              <Input id="an-desc" name="descricao" required maxLength={300} placeholder="Ex.: Cotação de brim — Malharia X" className="h-11" />
            </Campo>
            <Campo rotulo="Emitido por (fornecedor/órgão)" htmlFor="an-emissor"><Input id="an-emissor" name="emissor" maxLength={200} className="h-11" /></Campo>
            <Campo rotulo="Número (nota, certidão, contrato)" htmlFor="an-num"><Input id="an-num" name="numero" maxLength={100} className="h-11" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Emissão" htmlFor="an-em"><Input id="an-em" name="emissao" type="date" className="h-11" /></Campo>
              <Campo rotulo="Validade" htmlFor="an-val"><Input id="an-val" name="validade" type="date" className="h-11" /></Campo>
            </div>
            <Campo rotulo="Arquivo (PDF, foto, Word ou Excel — até 5 MB)" htmlFor="an-file" className="sm:col-span-2">
              <Input id="an-file" name="arquivo" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" className="h-auto py-2" />
            </Campo>
            <div className="flex items-end">
              <Button type="submit" size="lg" disabled={pending} className="w-full">
                <FileUp className="h-5 w-5" /> {pending ? "Enviando…" : "Guardar documento"}
              </Button>
            </div>
          </form>
          {msg && (
            <p role="status" className={cn("mt-3 text-sm font-semibold", msg.ok ? "text-emerald-700" : "text-red-700")}>
              {msg.texto}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Documentos guardados ({anexos.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {anexos.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nenhum documento guardado ainda.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Documento</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Emitido por / nº</th>
                  <th className="px-4 py-2">Validade</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {anexos.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold">{a.descricao}</p>
                      <p className="text-xs text-slate-500">{a.arquivo_nome}</p>
                    </td>
                    <td className="px-4 py-3">{rotuloCategoria(a.categoria)}</td>
                    <td className="px-4 py-3">
                      {a.emissor ?? "—"}
                      {a.numero && <span className="block text-xs text-slate-500">nº {a.numero}</span>}
                    </td>
                    <td className="px-4 py-3"><BadgeValidade validade={a.validade} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => abrir(a.id)} aria-label={`Baixar ${a.descricao}`}>
                          <Download className="h-4 w-4" /> Abrir
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => excluir(a)} aria-label={`Excluir ${a.descricao}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
