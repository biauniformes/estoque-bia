import type { MetadataRoute } from "next";

// Torna o sistema instalável como app (tela cheia, ícone na tela inicial) e é a base do APK.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estoque Bia",
    short_name: "Estoque Bia",
    description: "Controle inteligente de estoque para confecção",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
