import type { MovementType, Reason, Role, StockStatus } from "@/lib/constants";

export type Profile = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type StockRow = {
  variant_id: string;
  product_id: string;
  codigo: string;
  produto: string;
  categoria: string;
  cor: string;
  tamanho: string;
  tamanho_ordem: number;
  nome_base: string;
  tamanho_rank: number;
  modelo: string | null;
  sku: string;
  barcode: string | null;
  estoque_minimo: number;
  estoque: number;
  reservado: number;
  disponivel: number;
  status: StockStatus;
  ativo: boolean;
  /** só administradores recebem valores (operadores: null) */
  valor_unitario: number | null;
  valor_total: number | null;
};

export type MovementRow = {
  id: string;
  created_at: string;
  tipo: MovementType;
  quantidade: number;
  motivo: Reason;
  oc_number: string | null;
  observacao: string | null;
  user_id: string;
  user_nome: string;
  user_role: Role;
  estoque_anterior: number;
  estoque_posterior: number;
  corrige_movement_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  variant_id: string;
  product_id: string;
  produto: string;
  categoria: string;
  codigo: string;
  cor: string;
  tamanho: string;
  sku: string;
};

export type AuditRow = {
  id: string;
  user_id: string | null;
  user_nome: string | null;
  user_role: Role | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ProductRow = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  valor_unitario: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type VariantRow = {
  id: string;
  product_id: string;
  cor: string;
  tamanho: string;
  modelo: string | null;
  sku: string;
  barcode: string | null;
  estoque_minimo: number;
  ativo: boolean;
};

export type OcSummaryRow = {
  oc_number: string;
  movimentos: number;
  total_retirado: number;
  primeira_movimentacao: string;
  ultima_movimentacao: string;
};

export type MovementResult = {
  id: string;
  tipo: MovementType;
  quantidade: number;
  motivo: Reason;
  oc_number: string | null;
  estoque_anterior: number;
  estoque_posterior: number;
  created_at: string;
  produto: string;
  cor: string;
  tamanho: string;
  sku: string;
  duplicado: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false;
      error: string;
      code?: string;
      detail?: Record<string, unknown>;
      fieldErrors?: Record<string, string>;
    };
