"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analise, TipoLicitacao } from "@/lib/exequibilidade/types";
import { analisar } from "@/lib/exequibilidade/calc";
import {
  BDI_PADRAO,
  PERCENTUAL_PADRAO,
  TRIBUTOS_PADRAO,
  analiseVazia,
  defesaPadrao,
  encargosPadrao,
  exemplo,
} from "@/lib/exequibilidade/defaults";

const CHAVE = "exequibilidade:analise:v1";

/** Mescla dados salvos/importados com os padrões, tolerando versões antigas. */
export function normalizar(bruto: unknown): Analise | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Partial<Analise>;
  if (!b.parametros || !Array.isArray(b.insumos)) return null;
  const base = analiseVazia(b.parametros.tipo ?? "obras");
  return {
    ...base,
    ...b,
    versao: 1,
    identificacao: { ...base.identificacao, ...b.identificacao },
    parametros: { ...base.parametros, ...b.parametros },
    encargos: {
      ...base.encargos,
      ...b.encargos,
      itens: b.encargos?.itens?.length ? b.encargos.itens : encargosPadrao().itens,
    },
    bdi: { ...base.bdi, ...b.bdi },
    tributos: { ...base.tributos, ...b.tributos },
    concorrentes: Array.isArray(b.concorrentes) ? b.concorrentes : [],
    defesa: { ...defesaPadrao(), ...b.defesa },
  };
}

export function useAnalise() {
  const [analise, setAnalise] = useState<Analise>(() => analiseVazia());
  const [carregado, setCarregado] = useState(false);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega do localStorage após a hidratação (evita divergência SSR/cliente).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const txt = localStorage.getItem(CHAVE);
      if (txt) {
        const n = normalizar(JSON.parse(txt));
        if (n) setAnalise(n);
      }
    } catch {
      /* armazenamento indisponível: segue com padrão */
    }
    setCarregado(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Autosave com debounce.
  useEffect(() => {
    if (!carregado) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(analise));
        setSalvoEm(new Date());
      } catch {
        /* ignore */
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [analise, carregado]);

  const resultado = useMemo(() => analisar(analise), [analise]);

  const atualizar = useCallback(
    (fn: (a: Analise) => Analise) => setAnalise((a) => fn(a)),
    [],
  );

  const trocarTipo = useCallback((tipo: TipoLicitacao) => {
    setAnalise((a) => ({
      ...a,
      parametros: {
        ...a.parametros,
        tipo,
        percentualInexequibilidade: PERCENTUAL_PADRAO[tipo],
      },
      bdi: { ...BDI_PADRAO[tipo] },
      tributos: { ...TRIBUTOS_PADRAO[tipo] },
    }));
  }, []);

  const novaAnalise = useCallback(() => setAnalise(analiseVazia()), []);
  const carregarExemplo = useCallback(() => setAnalise(exemplo()), []);
  const importar = useCallback((json: string): boolean => {
    try {
      const n = normalizar(JSON.parse(json));
      if (!n) return false;
      setAnalise(n);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    analise,
    resultado,
    atualizar,
    trocarTipo,
    novaAnalise,
    carregarExemplo,
    importar,
    salvoEm,
    carregado,
  };
}

export type UseAnalise = ReturnType<typeof useAnalise>;
