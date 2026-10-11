"use client";

import { useEffect } from "react";
import { esTemporadaHalloween } from "@/lib/fechas";

// Durante octubre, el ícono de la pestaña del navegador cambia a una
// calabaza en vez del logo normal -- dibujada en un canvas invisible (no
// hace falta subir un archivo nuevo) y puesta como favicon vía <link>. Al
// terminar octubre, el navegador ya está usando el favicon normal de
// siempre (este componente nunca lo toca fuera de esa ventana).
export default function FaviconHalloween() {
  useEffect(() => {
    if (!esTemporadaHalloween()) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = "56px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎃", 32, 36);

      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.type = "image/png";
      link.href = canvas.toDataURL("image/png");
    } catch {
      // El favicon es un detalle de más -- si el navegador lo bloquea, no
      // debe romper nada del resto de la app.
    }
  }, []);

  return null;
}
