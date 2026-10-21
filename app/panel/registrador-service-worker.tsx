"use client";

import { useEffect } from "react";

// Registra el Service Worker para TODOS los que entran al panel, no solo
// para quienes activan las notificaciones push (que ya lo registraban por
// su cuenta en push-cliente.ts, al mismo archivo -- registrar de nuevo acá
// no les cambia nada, el navegador lo trata como la misma instalación). Sin
// esto, la caché de "abrir sin señal" (ver public/sw.js) solo cubría a quien
// ya tenía push activado, dejando afuera a cualquiera que no lo hubiera
// prendido -- montado una sola vez en PanelShell, como SincronizadorOffline.
export default function RegistradorServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el Service Worker:", error);
    });
  }, []);

  return null;
}
