"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProductSelector, groupProducts } from "./product-selector";
import { QuantityInput } from "./quantity-input";
import { registerMovementAction } from "@/app/actions/movements";
import { ENTRADA_REASONS, SAIDA_REASONS, REASON_LABELS } from "@/lib/constants";
import { cn, formatNumber, newKey, normalizeOc, variantLabel } from "@/lib/utils";
import type { MovementResult, StockRow } from "@/types";

type Props = { tipo: "entrada" | "saida"; variants: StockRow[]; initialVariantId?: string; isAdmin: boolean };

const SUCCESS_REDIRECT_MS = 8000;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-3 text-lg font-extrabold uppercase tracking-wide text-slate-700">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-14 min-w-16 rounded-2xl border-2 px-5 text-lg font-bold transition-colors active:scale-95 disabled:opacity-40",
        active ? "border-brand bg-brand text-black" : "border-slate-300 bg-white text-slate-800 hover:border-brand hover:bg-orange-50",
      )}
    >
      {children}
    </button>
  );
}

export function MovementForm({ tipo, variants, initialVariantId, isAdmin }: Props) {
  const router = useRouter();
  const isSaida = tipo === "saida";
  const reasons = isSaida ? SAIDA_REASONS : ENTRADA_REASONS;
  const products = React.useMemo(() => groupProducts(variants), [variants]);

  const initial = variants.find((v) => v.variant_id === initialVariantId);
  const [productId, setProductId] = React.useState<string | null>(initial?.product_id ?? null);
  const [cor, setCor] = React.useState<string | null>(initial?.cor ?? null);
  const [tamanho, setTamanho] = React.useState<string | null>(initial?.tamanho ?? null);
  const [qty, setQty] = React.useState("");
  const [motivo, setMotivo] = React.useState<string>(reasons[0].value);
  const [oc, setOc] = React.useState("");
  const [obs, setObs] = React.useState("");
  const [showObs, setShowObs] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<{ message: string; detail?: Record<string, unknown>; code?: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<MovementResult | null>(null);

  const keyRef = React.useRef(newKey());
  const lockRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timerRef.current && clearTimeout(timerRef.current)), []);

  // qualquer alteração nos campos invalida a chave anterior e limpa mensagens
  const touch = () => {
    keyRef.current = newKey();
    setErrors({});
    setFormError(null);
  };

  const product = products.find((p) => p.id === productId) ?? null;
  const colors = product ? [...new Set(product.variants.map((v) => v.cor))] : [];
  const sizes = product && cor ? product.variants.filter((v) => v.cor === cor) : [];
  const variant = product && cor && tamanho ? product.variants.find((v) => v.cor === cor && v.tamanho === tamanho) ?? null : null;
  const stockOf = (v: StockRow) => overrides[v.variant_id] ?? v.estoque;

  const n = parseInt(qty || "0", 10) || 0;
  const current = variant ? stockOf(variant) : 0;
  const after = isSaida ? current - n : current + n;
  const insufficient = isSaida && !!variant && n > current;
  // administrador: OC só quando o motivo é OC; demais usuários: TODA saída exige o número da OC
  const needsOc = isSaida && (motivo === "oc" || !isAdmin);
  const ocClean = normalizeOc(oc);
  const missing = !variant ? (product && product.variants.length > 1 ? "Selecione produto, cor e tamanho" : "Selecione o produto") : n < 1 ? "Informe a quantidade" : needsOc && !ocClean ? "Informe o número da OC" : null;
  const canSubmit = !missing && !insufficient && !pending;

  function pickProduct(id: string | null) {
    touch();
    setProductId(id);
    setTamanho(null);
    const p = products.find((x) => x.id === id);
    const cs = p ? [...new Set(p.variants.map((v) => v.cor))] : [];
    if (cs.length === 1) {
      setCor(cs[0]);
      const ss = p!.variants.filter((v) => v.cor === cs[0]);
      setTamanho(ss.length === 1 ? ss[0].tamanho : null);
    } else setCor(null);
  }
  function pickCor(c: string) {
    touch();
    setCor(c);
    const ss = product!.variants.filter((v) => v.cor === c);
    setTamanho(ss.length === 1 ? ss[0].tamanho : null);
  }

  async function submit() {
    if (lockRef.current || !variant) return; // trava contra duplo clique
    lockRef.current = true;
    setPending(true);
    setFormError(null);
    try {
      const res = await registerMovementAction({
        variantId: variant.variant_id,
        tipo,
        quantidade: n,
        motivo: motivo as never,
        oc: needsOc ? oc : "",
        observacao: obs,
        key: keyRef.current,
      });
      setConfirmOpen(false);
      if (res.ok) {
        setOverrides((o) => ({ ...o, [variant.variant_id]: res.data.estoque_posterior }));
        setResult(res.data);
        timerRef.current = setTimeout(() => {
          router.push("/");
          router.refresh();
        }, SUCCESS_REDIRECT_MS);
      } else {
        if (res.code === "ESTOQUE_INSUFICIENTE" && typeof res.detail?.disponivel === "number") {
          setOverrides((o) => ({ ...o, [variant.variant_id]: res.detail!.disponivel as number }));
        }
        setErrors(res.fieldErrors ?? {});
        setFormError({ message: res.error, detail: res.detail, code: res.code });
        keyRef.current = newKey();
      }
    } catch {
      setConfirmOpen(false);
      setFormError({ message: "Falha de conexão. Verifique a rede e toque em confirmar novamente — a operação não será duplicada." });
    } finally {
      lockRef.current = false;
      setPending(false);
    }
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    keyRef.current = newKey();
    setResult(null);
    setProductId(null);
    setCor(null);
    setTamanho(null);
    setQty("");
    setMotivo(reasons[0].value);
    setOc("");
    setObs("");
    setShowObs(false);
    setErrors({});
    setFormError(null);
  }

  // ---------------------------------------------------------------- sucesso --
  if (result) {
    const isIn = result.tipo === "entrada";
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center" role="status" aria-live="polite">
        <CheckCircle2 className={cn("mx-auto h-20 w-20", isIn ? "text-emerald-600" : "text-rose-600")} aria-hidden />
        <h2 className="mt-4 text-3xl font-extrabold">{isIn ? "Entrada registrada!" : "Saída registrada!"}</h2>
        <p className={cn("mt-4 text-6xl font-extrabold tabular-nums", isIn ? "text-emerald-600" : "text-rose-600")}>
          {isIn ? "+" : "−"}
          {formatNumber(result.quantidade)}
          <span className="ml-2 text-2xl font-bold text-slate-500">un.</span>
        </p>
        <p className="mt-4 text-2xl font-bold text-slate-900">{result.produto}</p>
        <p className="text-lg text-slate-600">
          {[variantLabel(result.cor, result.tamanho), result.oc_number ? `OC ${result.oc_number}` : ""].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-5 rounded-2xl bg-slate-100 py-4 text-xl font-bold text-slate-800">
          {isIn ? "Estoque atual" : "Estoque restante"}: <span className="tabular-nums">{formatNumber(result.estoque_posterior)}</span>
        </p>
        {result.duplicado && <p className="mt-3 text-sm text-slate-500">Esta operação já havia sido registrada — nada foi duplicado.</p>}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button size="lg" variant="outline" onClick={reset}>
            Registrar outra {isIn ? "entrada" : "saída"}
          </Button>
          <Button size="lg" asChild>
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-slate-500">Voltando automaticamente para o início…</p>
      </Card>
    );
  }

  // ------------------------------------------------------------- formulário --
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Step n={1} title="Produto">
        <ProductSelector products={products} value={productId} onChange={pickProduct} />
        {errors.variantId && <p className="text-sm font-medium text-red-600">{errors.variantId}</p>}
      </Step>

      {product && product.variants.length > 1 && (
        <Step n={2} title="Cor e tamanho">
          <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-3">
            {colors.map((c) => (
              <Chip key={c} active={cor === c} onClick={() => pickCor(c)}>
                {c}
              </Chip>
            ))}
          </div>
          {cor && (
            <div role="radiogroup" aria-label="Tamanho" className="flex flex-wrap gap-3">
              {sizes.map((v) => (
                <Chip
                  key={v.variant_id}
                  active={tamanho === v.tamanho}
                  onClick={() => {
                    touch();
                    setTamanho(v.tamanho);
                  }}
                >
                  <span className="block leading-tight">{v.tamanho}</span>
                  <span className="block text-xs font-semibold opacity-80">{formatNumber(stockOf(v))} un.</span>
                </Chip>
              ))}
            </div>
          )}
        </Step>
      )}

      {variant && (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 px-5 py-4",
              isSaida ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50",
            )}
          >
            <p className="text-lg font-bold text-slate-800">
              {variant.produto}{variantLabel(variant.cor, variant.tamanho) && ` · ${variantLabel(variant.cor, variant.tamanho)}`}
            </p>
            <p className="text-lg text-slate-700">
              Estoque atual: <strong className="text-2xl tabular-nums">{formatNumber(current)}</strong>
            </p>
          </div>

          <Step n={3} title="Quantidade">
            <QuantityInput value={qty} onChange={(v) => { touch(); setQty(v); }} invalid={!!errors.quantidade || insufficient} />
            {errors.quantidade && <p className="text-sm font-medium text-red-600">{errors.quantidade}</p>}
            {n > 0 && !insufficient && (
              <p className="text-center text-lg text-slate-600">
                Estoque após {isSaida ? "saída" : "entrada"}: <strong className="tabular-nums text-slate-900">{formatNumber(current)} → {formatNumber(after)}</strong>
              </p>
            )}
            {insufficient && (
              <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-red-900">
                <p className="flex items-center gap-2 text-xl font-extrabold">
                  <AlertTriangle className="h-6 w-6" aria-hidden /> ESTOQUE INSUFICIENTE
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-sm">Disponível</dt><dd className="text-2xl font-extrabold tabular-nums">{formatNumber(current)}</dd></div>
                  <div><dt className="text-sm">Solicitado</dt><dd className="text-2xl font-extrabold tabular-nums">{formatNumber(n)}</dd></div>
                  <div><dt className="text-sm">Faltam</dt><dd className="text-2xl font-extrabold tabular-nums">{formatNumber(n - current)}</dd></div>
                </dl>
              </div>
            )}
          </Step>

          <Step n={4} title={isSaida ? "Destino / motivo" : "Motivo"}>
            <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-3">
              {reasons.map((r) => (
                <Chip key={r.value} active={motivo === r.value} onClick={() => { touch(); setMotivo(r.value); }}>
                  {r.label}
                </Chip>
              ))}
            </div>
            {needsOc && (
              <div>
                <label htmlFor="oc" className="mb-1.5 block text-sm font-bold text-slate-700">
                  Número da OC <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="flex h-16 items-center rounded-2xl bg-slate-900 px-5 text-2xl font-extrabold text-white">OC</span>
                  <Input
                    id="oc"
                    value={oc}
                    onChange={(e) => { touch(); setOc(e.target.value.replace(/^\s*oc[\s._-]*/i, "").toUpperCase()); }}
                    placeholder="22"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={20}
                    aria-invalid={!!errors.oc || undefined}
                    className="h-16 text-2xl font-bold"
                  />
                </div>
                {errors.oc && <p className="mt-1 text-sm font-medium text-red-600">{errors.oc}</p>}
                {!isAdmin && <p className="mt-1 text-sm text-slate-500">Toda saída precisa do número da OC.</p>}
              </div>
            )}
            <div>
              {showObs ? (
                <>
                  <label htmlFor="obs" className="mb-1.5 block text-sm font-bold text-slate-700">Observação (opcional)</label>
                  <Textarea id="obs" value={obs} maxLength={500} onChange={(e) => { touch(); setObs(e.target.value); }} />
                </>
              ) : (
                <button type="button" onClick={() => setShowObs(true)} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
                  <ChevronDown className="h-4 w-4" aria-hidden /> Adicionar observação
                </button>
              )}
            </div>
          </Step>
        </>
      )}

      {formError && !insufficient && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          <p className="text-lg font-semibold">{formError.message}</p>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          size="xl"
          variant={isSaida ? "saida" : "entrada"}
          className="w-full"
          disabled={!canSubmit}
          loading={pending && !isSaida}
          onClick={() => (isSaida ? setConfirmOpen(true) : submit())}
        >
          {isSaida ? "REVISAR SAÍDA" : "CONFIRMAR ENTRADA"}
          {!pending && <ArrowRight className="h-7 w-7" aria-hidden />}
        </Button>
        {missing && variant !== null && <p className="mt-2 text-center text-sm text-slate-500">{missing}</p>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar saída?"
        confirmLabel="CONFIRMAR SAÍDA"
        variant="saida"
        loading={pending}
        onConfirm={submit}
      >
        {variant && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-slate-50 p-4 text-lg">
            <dt className="text-slate-500">Produto</dt><dd className="font-bold">{variant.produto}</dd>
            {variantLabel(variant.cor, variant.tamanho) && (
              <>
                <dt className="text-slate-500">Cor / tamanho</dt><dd className="font-bold">{variantLabel(variant.cor, variant.tamanho)}</dd>
              </>
            )}
            <dt className="text-slate-500">Quantidade</dt><dd className="font-extrabold tabular-nums text-rose-600">−{formatNumber(n)}</dd>
            <dt className="text-slate-500">Destino</dt><dd className="font-bold">{needsOc ? `OC ${ocClean}${motivo !== "oc" ? ` · ${REASON_LABELS[motivo]}` : ""}` : REASON_LABELS[motivo]}</dd>
            <dt className="text-slate-500">Estoque atual</dt><dd className="font-bold tabular-nums">{formatNumber(current)}</dd>
            <dt className="text-slate-500">Após a saída</dt><dd className="font-extrabold tabular-nums">{formatNumber(after)}</dd>
          </dl>
        )}
      </ConfirmDialog>
    </div>
  );
}
