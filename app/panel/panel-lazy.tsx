"use client";

// Cada sección pesada del menú lateral se carga solo cuando el usuario la
// abre (en vez de venir siempre en el paquete inicial de cada portal) — la
// mayoría entra desde el celular, así que esto reduce lo que hay que
// descargar al entrar al panel.

import dynamic from "next/dynamic";

// Esqueleto con forma de contenido (título + tarjeta + dos bloques chicos)
// en vez de un "Cargando..." de texto plano -- ver .bloque-shimmer en
// globals.css.
const cargando = () => (
  <div className="space-y-3">
    <div className="bloque-shimmer h-5 w-40" />
    <div className="bloque-shimmer h-24 w-full" />
    <div className="flex gap-3">
      <div className="bloque-shimmer h-16 flex-1" />
      <div className="bloque-shimmer h-16 flex-1" />
    </div>
  </div>
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

export const LazyAuditoriasPanel = dynamic(() => import("./auditorias/auditorias-panel"), {
  ssr: false,
  loading: cargando,
});

export const LazyMapaOperativo = dynamic(() => import("./gerente/mapa-operativo"), {
  ssr: false,
  loading: cargando,
});

export const LazyConsultorioIA = dynamic(() => import("./consultorio/consultorio-ia"), {
  ssr: false,
  loading: cargando,
});

export const LazyHistoriasFeed = dynamic(() => import("./historias/historias-feed"), {
  ssr: false,
  loading: cargando,
});

export const LazyMiGaleria = dynamic(() => import("./historias/mi-galeria"), {
  ssr: false,
  loading: cargando,
});

export const LazyMiPerfil = dynamic(() => import("./perfil/mi-perfil"), {
  ssr: false,
  loading: cargando,
});

export const LazyMiAgenda = dynamic(() => import("./mi-agenda/mi-agenda"), {
  ssr: false,
  loading: cargando,
});

export const LazySoporte = dynamic(() => import("./soporte/soporte"), {
  ssr: false,
  loading: cargando,
});

// Reutilizados desde Gerente -- mismos componentes que ya usa Coordinador
// para anuncios/encuestas, ahora que Gerente también puede publicar.
export const LazyAnuncios = dynamic(() => import("./coordinador/anuncios"), {
  ssr: false,
  loading: cargando,
});

export const LazyEncuestasCoordinador = dynamic(() => import("./coordinador/encuestas"), {
  ssr: false,
  loading: cargando,
});

export const LazyMarcacionesBreakEquipo = dynamic(() => import("./coordinador/marcaciones-break-equipo"), {
  ssr: false,
  loading: cargando,
});

// Vive en la barra superior (junto a Recargar/Tema) -- un "Cargando..." ahí
// se ve fuera de lugar, así que no muestra nada mientras carga el bundle.
export const LazyCampanaNotificaciones = dynamic(() => import("./historias/campana-notificaciones"), {
  ssr: false,
  loading: () => null,
});
