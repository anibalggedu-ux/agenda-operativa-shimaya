"use client";

// Cada sección pesada del menú lateral se carga solo cuando el usuario la
// abre (en vez de venir siempre en el paquete inicial de cada portal) — la
// mayoría entra desde el celular, así que esto reduce lo que hay que
// descargar al entrar al panel.

import dynamic from "next/dynamic";

const cargando = () => (
  <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
);

export const LazyCentralAnalitica = dynamic(() => import("./analitica/central-analitica"), {
  ssr: false,
  loading: cargando,
});

export const LazyDocumentos = dynamic(() => import("./documentos/documentos"), {
  ssr: false,
  loading: cargando,
});

export const LazyCalendario = dynamic(() => import("./calendario/calendario"), {
  ssr: false,
  loading: cargando,
});

export const LazyRegistro = dynamic(() => import("./registro/registro"), {
  ssr: false,
  loading: cargando,
});

export const LazyHistorialAuditorias = dynamic(() => import("./auditorias/historial-auditorias"), {
  ssr: false,
  loading: cargando,
});

export const LazyAuditoriasPanel = dynamic(() => import("./auditorias/auditorias-panel"), {
  ssr: false,
  loading: cargando,
});
