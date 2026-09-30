"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/states";

export default function PrivateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      description="Ocorreu um erro ao carregar esta tela. Tente novamente; se persistir, avise um administrador."
      action={
        <Button size="lg" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
