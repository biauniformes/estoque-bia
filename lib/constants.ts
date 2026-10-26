export const CATEGORIES = [
  { value: "camisetas", label: "Camisetas" },
  { value: "camisas_polo", label: "Camisas Polo" },
  { value: "camisas_sociais", label: "Camisas Sociais" },
  { value: "jaquetas", label: "Jaquetas" },
  { value: "calcas", label: "Calças" },
  { value: "bermudas", label: "Bermudas" },
  { value: "jalecos", label: "Jalecos" },
  { value: "coletes", label: "Coletes" },
  { value: "outros", label: "Outros" },
] as const;
export type Category = (typeof CATEGORIES)[number]["value"];
export const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const ENTRADA_REASONS = [
  { value: "producao", label: "Produção" },
  { value: "compra", label: "Compra" },
  { value: "devolucao", label: "Devolução" },
  { value: "ajuste_positivo", label: "Ajuste positivo" },
  { value: "outros", label: "Outros" },
] as const;

export const SAIDA_REASONS = [
  { value: "oc", label: "OC" },
  { value: "producao", label: "Produção" },
  { value: "perda", label: "Perda" },
  { value: "avaria", label: "Avaria" },
  { value: "ajuste_negativo", label: "Ajuste" },
  { value: "outros", label: "Outros" },
] as const;

export type MovementType = "entrada" | "saida";
export type Reason =
  | "producao"
  | "compra"
  | "devolucao"
  | "ajuste_positivo"
  | "oc"
  | "perda"
  | "avaria"
  | "ajuste_negativo"
  | "correcao"
  | "contagem_inicial"
  | "outros";

export const REASON_LABELS: Record<string, string> = {
  producao: "Produção",
  compra: "Compra",
  devolucao: "Devolução",
  ajuste_positivo: "Ajuste positivo",
  oc: "Saída para OC",
  perda: "Perda",
  avaria: "Avaria",
  ajuste_negativo: "Ajuste",
  correcao: "Correção",
  contagem_inicial: "Contagem inicial",
  outros: "Outros",
};

export type Role = "admin" | "operator" | "expedicao" | "corte";
export const ROLE_LABELS: Record<Role, string> = { admin: "Administrador", operator: "Operador de estoque", expedicao: "Expedição", corte: "Corte (talhador)" };

export const STATUS_LABELS = { normal: "Normal", baixo: "Estoque baixo", zerado: "Zerado" } as const;
export type StockStatus = keyof typeof STATUS_LABELS;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  entrada: "Entrada de estoque",
  saida: "Saída de estoque",
  ajuste: "Ajuste de estoque",
  operacao_invalida: "Tentativa de operação inválida",
  acesso_administrativo: "Acesso administrativo",
  produto_criado: "Produto criado",
  produto_alterado: "Produto alterado",
  produto_desativado: "Produto desativado",
  produto_reativado: "Produto reativado",
  variacao_criado: "Variação criada",
  variacao_alterado: "Variação alterada",
  variacao_desativado: "Variação desativada",
  variacao_reativado: "Variação reativada",
  usuario_criado: "Usuário criado",
  usuario_alterado: "Usuário alterado",
  usuario_desativado: "Usuário desativado",
  usuario_reativado: "Usuário reativado",
  permissao_alterada: "Permissão alterada",
  criacao_usuario: "Usuário cadastrado por administrador",
  senha_redefinida: "Senha redefinida por administrador",
  exportacao_relatorio: "Relatório exportado",
  contagem_inicial: "Contagem inicial lançada",
  saida_oc_lote: "Saída por OC (vários itens)",
  importacao_catalogo: "Catálogo importado",
  limpeza_dados_demonstracao: "Dados de demonstração removidos",
  oc_importada: "OC do cliente importada",
  oc_excluida: "OC do cliente excluída",
  oc_separada: "OCs marcadas como separadas",
  oc_reaberta: "OCs reabertas",
  oc_ligacao_alterada: "Ligação de código de cliente alterada",
  talhacao_lancada: "Talhação lançada",
  talhacao_excluida: "Talhação excluída",
  talhacao_funcionaria_criada: "Funcionária da talhação cadastrada",
  talhacao_funcionaria_removida: "Funcionária da talhação removida",
};

export const PAGE_SIZE = 25;
