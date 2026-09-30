import { z } from "zod";
import { CATEGORIES } from "@/lib/constants";

const categories = CATEGORIES.map((c) => c.value) as [string, ...string[]];

export const productSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código.").max(30, "Máximo 30 caracteres."),
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  categoria: z.enum(categories, { error: "Selecione a categoria." }),
  descricao: z.string().trim().max(500, "Máximo 500 caracteres.").default(""),
});

export const variantSchema = z.object({
  cor: z.string().trim().min(1, "Informe a cor.").max(40),
  tamanho: z.string().trim().min(1, "Informe o tamanho.").max(20),
  modelo: z.string().trim().max(40).default(""),
  sku: z.string().trim().max(60).default(""),
  estoque_minimo: z.coerce.number({ error: "Informe um número." }).int("Número inteiro.").min(0, "Não pode ser negativo.").max(1_000_000).default(0),
});

/** SKU automático: CODIGO-COR3-TAMANHO (sem acentos). */
export function makeSku(codigo: string, cor: string, tamanho: string) {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
  return [clean(codigo), clean(cor).slice(0, 3), clean(tamanho)].filter(Boolean).join("-");
}
