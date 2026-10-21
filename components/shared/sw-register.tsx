"use client";

import * as React from "react";

/** Registra o service worker (tela "sem internet" e requisito de instalação do app). */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sem service worker o sistema funciona normalmente; só não há tela offline
    });
  }, []);
  return null;
}
