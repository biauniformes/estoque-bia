"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analise, TipoLicitacao } from "@/lib/exequibilidade/types";
import { analisar } from "@/lib/exequibilidade/calc";
import {
  BDI_PADRAO,
  PERCENTUAL_PADRAO,
  TRIBUTOS_PADRAO,
  analiseVazia,
  exemplo,
} from "@/lib/exequibilidade/defaults";
import { normalizar } from "@/lib/exequibilidade/normalizar";

export { normalizar };

export type EstadoSalvamento = "salvo" | "pendente" | "salvando" | "erro";

/**
 * Estado da análise de UMA licitação. O salvamento é automático (com debounce) pelo
 * callback `aoSalvar`, que grava no banco; devolve mensagem de erro ou null.
 */
export function useAnalise(inicial: Analise, aoSalvar: (a: Analise) => Promise<string | null>) {
  const [analise, setAnalise] = useState<Analise>(inicial);
  const [estado, setEstado] = useState<EstadoSalvamento>("salvo");
  const [erro, setErro] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeira = useRef(true);
  const salvarRef = useRef(aoSalvar);
  const ultima = useRef(analise);

  useEffect(() => {
    salvarRef.current = aoSalvar;
  });

  const gravar = useCallback(async () => {
    setEstado("salvando");
    const msg = await salvarRef.current(ultima.current);
    if (msg) {
      setErro(msg);
      setEstado("erro");
    } else {
      setErro(null);
      setSalvoEm(new Date());
      setEstado("salvo");
    }
  }, []);

  // Autosave com debounce (não grava na montagem).
  useEffect(() => {
    ultima.current = analise;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    setEstado("pendente");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(gravar, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [analise, gravar]);

  // Avisa se tentar sair com alteração ainda não gravada.
  useEffect(() => {
    if (estado === "salvo") return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [estado]);

  const resultado = useMemo(() => analisar(analise), [analise]);

  const atualizar = useCallback((fn: (a: Analise) => Analise) => setAnalise((a) => fn(a)), []);

  const trocarTipo = useCallback((tipo: TipoLicitacao) => {
    setAnalise((a) => ({
      ...a,
      parametros: { ...a.parametros, tipo, percentualInexequibilidade: PERCENTUAL_PADRAO[tipo] },
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
    estado,
    erro,
    salvarAgora: gravar,
  };
}

export type UseAnalise = ReturnType<typeof useAnalise>;
