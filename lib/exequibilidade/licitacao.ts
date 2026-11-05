/** Cadastro de licitações, checklist de habilitação e anexos (Lei 14.133/2021, arts. 59 e 62 a 70). */

export const STATUS_LICITACAO = [
  { value: "em_analise", label: "Em análise" },
  { value: "proposta_enviada", label: "Proposta enviada" },
  { value: "diligencia", label: "Em diligência" },
  { value: "vencida", label: "Vencida" },
  { value: "perdida", label: "Perdida" },
  { value: "arquivada", label: "Arquivada" },
] as const;
export type StatusLicitacao = (typeof STATUS_LICITACAO)[number]["value"];
export const rotuloStatusLicitacao = (v: string) => STATUS_LICITACAO.find((s) => s.value === v)?.label ?? v;

export const CATEGORIAS_ANEXO = [
  { value: "cotacao", label: "Cotação de fornecedor" },
  { value: "nota_fiscal", label: "Nota fiscal de compra" },
  { value: "contrato", label: "Contrato executado / fornecimento" },
  { value: "atestado", label: "Atestado de capacidade técnica" },
  { value: "certidao", label: "Certidão / regularidade" },
  { value: "balanco", label: "Balanço / demonstrações contábeis" },
  { value: "laudo", label: "Laudo, certificação ou amostra" },
  { value: "declaracao", label: "Declaração" },
  { value: "planilha", label: "Planilha / proposta assinada" },
  { value: "outro", label: "Outro" },
] as const;
export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number]["value"];
export const rotuloCategoria = (v: string) => CATEGORIAS_ANEXO.find((c) => c.value === v)?.label ?? v;

export type Licitacao = {
  id: string;
  titulo: string;
  orgao: string | null;
  edital: string | null;
  status: StatusLicitacao;
  data_sessao: string | null;
  valor_estimado: number | null;
  preco_ofertado: number | null;
  status_exequibilidade: string | null;
  analise: unknown;
  checklist: Checklist;
  created_at: string;
  updated_at: string;
};

export type Anexo = {
  id: string;
  licitacao_id: string | null;
  categoria: CategoriaAnexo;
  item: string | null;
  descricao: string;
  emissor: string | null;
  numero: string | null;
  emissao: string | null;
  validade: string | null;
  arquivo_path: string;
  arquivo_nome: string;
  mime: string | null;
  tamanho: number | null;
  created_at: string;
};

export type Checklist = Record<string, { ok: boolean; obs?: string }>;

export type ItemChecklist = {
  chave: string;
  titulo: string;
  base: string;
  /** só vale se o edital exigir (a Administração só pode exigir o que está no edital) */
  condicional?: boolean;
  /** categoria de anexo sugerida */
  categoria: CategoriaAnexo;
};

export type GrupoChecklist = { chave: string; titulo: string; descricao: string; itens: ItemChecklist[] };

export const CHECKLIST: GrupoChecklist[] = [
  {
    chave: "juridica",
    titulo: "Habilitação jurídica",
    descricao: "Art. 66 — comprovação de existência jurídica da empresa e de quem a representa.",
    itens: [
      { chave: "contrato_social", titulo: "Contrato social / ato constitutivo e alterações (ou certificado de MEI)", base: "Lei 14.133, art. 66", categoria: "certidao" },
      { chave: "representante", titulo: "Documento do representante legal (RG/CPF) e procuração, se houver", base: "Lei 14.133, art. 66", categoria: "declaracao" },
    ],
  },
  {
    chave: "fiscal",
    titulo: "Regularidade fiscal, social e trabalhista",
    descricao: "Art. 68 — exigida só do licitante mais bem classificado, depois do julgamento (art. 63, III).",
    itens: [
      { chave: "cnpj", titulo: "Cartão CNPJ e inscrições estadual/municipal, se houver", base: "Art. 68, I e II", categoria: "certidao" },
      { chave: "cert_federal", titulo: "Certidão conjunta de tributos federais e dívida ativa da União (RFB/PGFN)", base: "Art. 68, III", categoria: "certidao" },
      { chave: "cert_estadual", titulo: "Certidão negativa estadual", base: "Art. 68, III", categoria: "certidao" },
      { chave: "cert_municipal", titulo: "Certidão negativa municipal", base: "Art. 68, III", categoria: "certidao" },
      { chave: "fgts", titulo: "Certificado de Regularidade do FGTS (CRF)", base: "Art. 68, IV", categoria: "certidao" },
      { chave: "cndt", titulo: "Certidão Negativa de Débitos Trabalhistas (CNDT)", base: "Art. 68, V", categoria: "certidao" },
      { chave: "menor", titulo: "Declaração de não emprego de menor (art. 7º, XXXIII, CF)", base: "Art. 68, VI", categoria: "declaracao" },
    ],
  },
  {
    chave: "economica",
    titulo: "Qualificação econômico-financeira",
    descricao: "Art. 69 — vedado exigir faturamento mínimo ou índices de rentabilidade/lucratividade.",
    itens: [
      { chave: "balanco", titulo: "Balanço patrimonial e DRE dos 2 últimos exercícios sociais", base: "Art. 69, I", categoria: "balanco" },
      { chave: "falencia", titulo: "Certidão negativa de falência (distribuidor da sede)", base: "Art. 69, II", categoria: "certidao" },
      { chave: "capital", titulo: "Capital social ou patrimônio líquido mínimo (até 10% do valor estimado)", base: "Art. 69, §4º", categoria: "balanco", condicional: true },
    ],
  },
  {
    chave: "tecnica",
    titulo: "Qualificação técnica",
    descricao: "Art. 67 — restrita ao que o edital justificar; atestados só para parcelas de 4% ou mais do valor estimado.",
    itens: [
      { chave: "atestado", titulo: "Atestado(s) de capacidade técnica de fornecimento similar", base: "Art. 67, II e §1º", categoria: "atestado", condicional: true },
      { chave: "conhecimento", titulo: "Declaração de conhecimento das condições para cumprir o objeto", base: "Art. 67, VI", categoria: "declaracao", condicional: true },
      { chave: "registro", titulo: "Registro em entidade profissional competente, se couber", base: "Art. 67, V", categoria: "certidao", condicional: true },
    ],
  },
  {
    chave: "declaracoes",
    titulo: "Declarações do licitante",
    descricao: "Art. 63 — declarações feitas no sistema; o declarante responde pela veracidade.",
    itens: [
      { chave: "requisitos", titulo: "Declaração de atendimento aos requisitos de habilitação", base: "Art. 63, I", categoria: "declaracao" },
      { chave: "pcd", titulo: "Declaração de cumprimento de reserva de cargos (PCD / reabilitado)", base: "Art. 63, IV", categoria: "declaracao" },
      { chave: "mepp", titulo: "Declaração de enquadramento como ME/EPP (LC 123/2006), se aplicável", base: "LC 123/2006", categoria: "declaracao", condicional: true },
    ],
  },
  {
    chave: "objeto",
    titulo: "Qualidade do produto (amostra, laudos e certificações)",
    descricao: "Arts. 17 §3º, 41 e 42 — só o licitante provisoriamente vencedor, e apenas se o edital pedir.",
    itens: [
      { chave: "amostra", titulo: "Amostra do uniforme (provisoriamente vencedor)", base: "Arts. 17 §3º e 41, II", categoria: "laudo", condicional: true },
      { chave: "laudos", titulo: "Laudos laboratoriais, normas ABNT/certificação Inmetro do tecido", base: "Art. 42", categoria: "laudo", condicional: true },
      { chave: "ficha", titulo: "Ficha técnica / catálogo das peças ofertadas", base: "Art. 59, II", categoria: "declaracao", condicional: true },
      { chave: "solidariedade", titulo: "Carta de solidariedade do fabricante (revendedor/distribuidor)", base: "Art. 41, IV", categoria: "declaracao", condicional: true },
    ],
  },
  {
    chave: "exequibilidade",
    titulo: "Prova de exequibilidade da proposta",
    descricao: "Art. 59 IV e §2º; IN SEGES/ME 73/2022, art. 34 — o edital deve prever os documentos; guarde tudo antes da diligência.",
    itens: [
      { chave: "planilha", titulo: "Planilha de custos e formação de preços assinada (readequada ao lance vencedor)", base: "IN 73/2022, art. 31", categoria: "planilha" },
      { chave: "cotacoes", titulo: "Cotações de tecido, aviamentos e serviços (fornecedores e data)", base: "Art. 59, §2º", categoria: "cotacao" },
      { chave: "notas", titulo: "Notas fiscais de compra recentes dos mesmos insumos", base: "Art. 59, §2º", categoria: "nota_fiscal" },
      { chave: "contratos", titulo: "Contratos de fornecimento executados com preços semelhantes", base: "Art. 59, §2º", categoria: "contrato" },
      { chave: "ativos", titulo: "Comprovação de maquinário próprio e estoque de matéria-prima", base: "Art. 59, §2º", categoria: "declaracao" },
    ],
  },
];

export function progressoChecklist(c: Checklist, aplicaveis?: (i: ItemChecklist) => boolean) {
  let total = 0;
  let ok = 0;
  for (const g of CHECKLIST)
    for (const i of g.itens) {
      if (aplicaveis && !aplicaveis(i)) continue;
      total++;
      if (c[i.chave]?.ok) ok++;
    }
  return { total, ok };
}

/** Dias até o vencimento (negativo = vencido). null se sem validade. */
export function diasParaVencer(validade: string | null, hoje = new Date()): number | null {
  if (!validade) return null;
  const [y, m, d] = validade.split("-").map(Number);
  const alvo = Date.UTC(y, m - 1, d);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86400000);
}

export const formatDataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
