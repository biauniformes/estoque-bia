import { getDocumentProxy } from "unpdf";

/**
 * Leitor das ordens de compra da ORBENK (PDF do sistema deles).
 * Cada linha de item tem: Sq · Pro.Forn (código nosso, quando eles têm) · Produto (66.0042) · Der. (tamanho) ·
 * Descrição · U.M. · Qtde · Vlr Unit. · Vlr Produtos · CCU. O que identifica a peça é Produto + Der.
 */
export type OcItem = { seq: number; codCliente: string; tamanho: string; descricao: string; quantidade: number; codNosso: string };
export type OcLida = {
  cliente: "ORBENK";
  empresa: string;
  cnpj: string | null;
  numero: string;
  entrega: string | null; // AAAA-MM-DD
  itens: OcItem[];
  naoLidas: string[];
  totalPecasNoPdf: number | null;
};

/** Parte direita da linha (a partir da coluna "Produto"): 66.0304 M Calça … UN 6,00 83,840000 503,04 1707 */
const DIREITA = /^(\d{2,3}\.\d{4})\s+(\S+)\s+(.*?)\s+(?:UN|PC|CJ|PAR|KG|MT)\s+([\d.]+,\d{2})\s+([\d.]+,\d{6})\s+(?:([\d.]+,\d{2})\s+)?(\d{3,5})$/;
const CODIGO_NOSSO = /(\d{3}\.\d{3}\.\d{2})(?!\d)/;
/** As colunas "Sq" e "Pro. Forn" se sobrepõem no PDF; tudo que está à esquerda desta posição é lixo (menos o código nosso). */
const X_PRODUTO = 70;

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

type Pedaco = { x: number; y: number; s: string };

/** Agrupa os pedaços de texto da página em linhas (mesma altura), separando o que está à esquerda e à direita da coluna "Produto". */
function linhasDaPagina(pedacos: Pedaco[]): { esq: string; dir: string; todo: string }[] {
  const ordenados = [...pedacos].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Pedaco[][] = [];
  for (const p of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - p.y) <= 2.2) ultima.push(p);
    else linhas.push([p]);
  }
  const junta = (l: Pedaco[]) => l.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).filter(Boolean).join(" ");
  return linhas.map((l) => ({ esq: junta(l.filter((p) => p.x < X_PRODUTO)), dir: junta(l.filter((p) => p.x >= X_PRODUTO)), todo: junta([...l]) }));
}

export async function lerOcOrbenk(pdf: Uint8Array): Promise<OcLida> {
  const doc = await getDocumentProxy(pdf);
  const paginas: { esq: string; dir: string; todo: string }[][] = [];
  let textoTodo = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const pedacos: Pedaco[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      pedacos.push({ x: it.transform[4], y: it.transform[5], s: it.str });
    }
    const linhas = linhasDaPagina(pedacos);
    paginas.push(linhas);
    textoTodo += linhas.map((l) => l.todo).join("\n") + "\n";
  }

  const empresa = textoTodo.match(/ORBENK[^\n]*?(?:LTDA|S\.?A\.?)/i)?.[0].replace(/\s+/g, " ").trim();
  const numero = textoTodo.match(/ORDEM DE COMPRA N\.?\S*\s*:\s*([\d.]+)/i)?.[1];
  if (!empresa || !numero) throw new Error("Este PDF não parece uma ordem de compra da Orbenk.");
  const cnpj = textoTodo.match(/CNPJ\.*:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)?.[1] ?? null;
  const ent = textoTodo.match(/DATA ENTREGA:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const entrega = ent ? `${ent[3]}-${ent[2]}-${ent[1]}` : null;

  const itens: OcItem[] = [];
  const naoLidas: string[] = [];
  let seq = 0;
  for (const linhas of paginas) {
    for (const l of linhas) {
      const m = DIREITA.exec(l.dir);
      if (m) {
        seq++;
        itens.push({ seq, codCliente: m[1], tamanho: m[2], descricao: m[3], quantidade: num(m[4]), codNosso: CODIGO_NOSSO.exec(l.esq)?.[1] ?? "" });
      } else if (/^\d+\s/.test(l.todo) && /,\d{2}\s+\d{3,5}$/.test(l.todo)) {
        naoLidas.push(l.todo);
      }
    }
  }
  return { cliente: "ORBENK", empresa, cnpj, numero, entrega, itens, naoLidas, totalPecasNoPdf: null };
}

