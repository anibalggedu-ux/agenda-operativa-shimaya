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

    // La primerísima carga de una pantalla (antes de que el Service Worker
    // termine de instalarse) nunca pasa por su manejador de fetch, así que
    // esa pantalla queda "sin guardar" aunque la persona ya la haya visto --
    // probado en campo: al reabrir sin señal mostraba "Sin conexión" en vez
    // de la pantalla recién vista. Apenas el Service Worker toma el control
    // (o si ya lo tenía), se repite la misma petición una vez por su cuenta
    // -- esa sí pasa por su manejador y queda guardada para la próxima.
    function precargarPaginaActual() {
      fetch(window.location.href, { cache: "reload" }).catch(() => {});
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        if (navigator.serviceWorker.controller) {
          precargarPaginaActual();
        } else {
          navigator.serviceWorker.addEventListener("controllerchange", precargarPaginaActual, { once: true });
        }
      })
      .catch((error) => {
        console.error("No se pudo registrar el Service Worker:", error);
      });
  }, []);

  return null;
}
