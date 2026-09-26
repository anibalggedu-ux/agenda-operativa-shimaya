"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, X, RefreshCw, MoreHorizontal } from "lucide-react";
import { cerrarSesionAction } from "./logout-action";
import ThemeToggle from "./theme-toggle";
import SincronizadorOffline from "./sincronizador-offline";
import OndaDorada from "./onda-dorada";
import TelonBienvenida from "./telon-bienvenida";
import Brasas from "./brasas";
import Celebracion from "./celebracion";

export type ItemMenuPanel = {
  id: string;
  etiqueta: string;
  // Ya renderizado (ej. <Home className="w-4 h-4" />), no la referencia al
  // componente — algunas páginas que arman `items` son Server Components, y
  // pasar el componente en sí (en vez de un elemento) a PanelShell (cliente)
  // rompe la serialización de React Server Components.
  icono: ReactNode;
  contenido: ReactNode;
  // Numerito rojo junto al nombre de la pestaña (ej. notificaciones nuevas
  // en Mi Galería). Se calcula en el servidor al cargar la página.
  badge?: number;
};

// Barra de pestañas flotante para celular (reemplaza tener que abrir el
// menú hamburguesa para cambiar de sección). El ícono activo "flota" con la
// animación de profundidad (ver .profundidad-activo en globals.css): sube
// sobre una placa dorada con sombra, como el ícono activo en apps nativas.
const MAX_BOTONES_BARRA = 4;

function BotonBarra({
  item,
  activo,
  onClick,
}: {
  item: ItemMenuPanel;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0"
      aria-current={activo}
    >
      <span
        className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px] ${
          activo ? "bg-oro/20 text-marca-rojoclaro profundidad-activo" : "text-marca-tenue"
        }`}
      >
        {item.icono}
        {!!item.badge && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-marca-rojo text-white text-[9px] font-black">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        )}
      </span>
      <span
        className={`text-[9.5px] font-bold truncate max-w-full ${
          activo ? "text-marca-textofuerte" : "text-marca-tenue"
        }`}
      >
        {item.etiqueta}
      </span>
    </button>
  );
}

function BarraFlotante({
  items,
  activo,
  onSeleccionar,
  onAbrirMas,
}: {
  items: ItemMenuPanel[];
  activo: string;
  onSeleccionar: (id: string) => void;
  onAbrirMas: () => void;
}) {
  const hayMas = items.length > MAX_BOTONES_BARRA;
  const visibles = hayMas ? items.slice(0, MAX_BOTONES_BARRA - 1) : items;
  const activoEnMas = hayMas && !visibles.some((i) => i.id === activo);

  return (
    <nav
      className="lg:hidden fixed left-3 right-3 z-30 flex items-center bg-marca-superficie/95 backdrop-blur border border-marca-borde rounded-2xl shadow-lg px-1"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      {visibles.map((item) => (
        <BotonBarra key={item.id} item={item} activo={activo === item.id} onClick={() => onSeleccionar(item.id)} />
      ))}
      {hayMas && (
        <button
          onClick={onAbrirMas}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0"
        >
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-full [&>svg]:w-[18px] [&>svg]:h-[18px] ${
              activoEnMas ? "bg-oro/20 text-marca-rojoclaro profundidad-activo" : "text-marca-tenue"
            }`}
          >
            <MoreHorizontal />
          </span>
          <span className={`text-[9.5px] font-bold ${activoEnMas ? "text-marca-textofuerte" : "text-marca-tenue"}`}>
            Más
          </span>
        </button>
      )}
    </nav>
  );
}

function BotonItem({
  item,
  activo,
  onClick,
}: {
  item: ItemMenuPanel;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-[calc(100%-1rem)] mx-2 flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-bold tracking-wide transition rounded-lg ${
        activo
          ? "text-marca-rojoclaro bg-marca-rojo/15"
          : "text-marca-tenue hover:text-marca-texto hover:bg-marca-superficie2"
      }`}
    >
      <span className="shrink-0">{item.icono}</span>
      <span className="truncate flex-1">{item.etiqueta}</span>
      {!!item.badge && (
        <span className="shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-marca-rojo text-white text-[10px] font-black">
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </button>
  );
}

export default function PanelShell({
  nombre,
  tituloPortal,
  items,
  defaultId,
  accionesExtra,
  encabezado,
  encabezadoGaleria,
}: {
  nombre: string;
  tituloPortal: string;
  items: ItemMenuPanel[];
  defaultId?: string;
  accionesExtra?: ReactNode;
  // Contenido que va debajo de la barra fija (título del panel, Resumen del
  // Día, etc.) — se define por página, pero siempre queda bajo la misma
  // barra superior fija.
  encabezado?: ReactNode;
  // Reemplaza a "encabezado" mientras la pestaña "galeria" o "perfil" está
  // activa (ej. sin las tarjetas de Resumen del Día ni el compositor de
  // Historias, que no pintan bien encima de esas secciones). Un componente
  // de servidor no puede pasar una función a este Client Component, así que
  // en vez de "encabezado(activo)" se reciben las dos versiones ya armadas.
  encabezadoGaleria?: ReactNode;
}) {
  // Permite enlaces directos a una sección (ej. desde el correo de "Nueva
  // ruta asignada" hacia la Bitácora de Campo): /panel/supervisor?seccion=bitacora
  const parametros = useSearchParams();
  const seccionUrl = parametros.get("seccion");
  // "Home" de cada portal -- no siempre se llama "inicio" (coordinador usa
  // "rutas"), así que se toma de defaultId en vez de un id fijo.
  const idHome = defaultId ?? items[0]?.id;
  // "Mi Galería" ahora vive dentro de Mi Perfil: los enlaces viejos a
  // ?seccion=galeria abren el perfil.
  const seccionPedida = seccionUrl === "galeria" && !items.some((i) => i.id === "galeria") ? "perfil" : seccionUrl;
  const idInicial = seccionPedida && items.some((i) => i.id === seccionPedida) ? seccionPedida : idHome;

  const [activo, setActivo] = useState(idInicial);
  const [drawerAbierto, setDrawerAbierto] = useState(false);

  const seccionActiva = items.find((i) => i.id === activo) ?? items[0];

  function seleccionar(id: string) {
    setActivo(id);
    setDrawerAbierto(false);
  }

  return (
    <div className="relative min-h-screen bg-marca-fondo text-marca-texto font-body">
      <div
        aria-hidden
        className="pointer-events-none fixed -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[300px] rounded-full bg-marca-rojo/10 blur-[90px] z-0"
      />
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-marca-borde bg-marca-superficie px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setDrawerAbierto(true)}
            className="lg:hidden bg-marca-superficie2 border border-marca-borde text-marca-texto w-9 h-9 rounded-[3px] shrink-0 flex items-center justify-center"
            aria-label="Abrir menú"
          >
            <Menu className="w-4 h-4" />
          </button>
          <p className="font-display text-sm sm:text-base font-semibold text-marca-textofuerte truncate">
            Shimaya <span className="text-marca-tenue font-body font-normal text-[11px]">· {tituloPortal}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-marca-tenue text-[11px] truncate max-w-[220px]">
            Sesión activa: <span className="text-marca-textofuerte font-semibold">{nombre}</span>
          </span>
          {accionesExtra}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-marca-superficie2 border border-marca-borde text-marca-tenue w-9 h-9 rounded-[3px] hover:text-marca-texto transition shrink-0 flex items-center justify-center"
            aria-label="Recargar página"
            title="Recargar página"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <ThemeToggle />
          <form action={cerrarSesionAction}>
            <button className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-3 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      {drawerAbierto && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerAbierto(false)} />
          <aside className="relative w-64 max-w-[80%] h-full bg-marca-superficie border-r border-marca-borde flex flex-col">
            <div className="p-4 border-b border-marca-borde flex items-center justify-between">
              <p className="font-display text-lg font-semibold text-marca-textofuerte">{tituloPortal}</p>
              <button
                onClick={() => setDrawerAbierto(false)}
                className="text-marca-tenue leading-none"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-2 overflow-y-auto">
              {items.map((item) => (
                <BotonItem key={item.id} item={item} activo={activo === item.id} onClick={() => seleccionar(item.id)} />
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="relative z-10 p-4 sm:p-6 pb-24 lg:pb-6">
        <div className="sm:hidden mb-3 text-marca-tenue text-[11px]">
          Sesión activa: <span className="text-marca-textofuerte font-semibold">{nombre}</span>
        </div>

        <div className="mb-4 flex items-center justify-end gap-3 bg-marca-superficie border border-marca-borde border-r-2 border-r-marca-oro/70 rounded-2xl px-4 py-3">
          <span className="shrink-0 text-marca-rojoclaro [&>svg]:w-5 [&>svg]:h-5">{seccionActiva?.icono}</span>
          <p className="font-display text-lg sm:text-xl font-bold text-marca-textofuerte truncate">
            {seccionActiva?.etiqueta}
          </p>
        </div>

        {activo === idHome ? encabezado : encabezadoGaleria ?? encabezado}

        <div className="flex flex-col lg:flex-row border border-marca-borde rounded-[3px] overflow-hidden">
          <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-marca-superficie border-r border-marca-borde">
            <nav className="flex-1 py-2 overflow-y-auto">
              {items.map((item) => (
                <BotonItem key={item.id} item={item} activo={activo === item.id} onClick={() => seleccionar(item.id)} />
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col bg-marca-fondo">
            {/* key: al cambiar de sección se vuelve a montar y corre la
                animación "tinta" de entrada. */}
            <div key={activo} className="flex-1 p-4 sm:p-6 animar-tinta">
              {seccionActiva?.contenido}
            </div>
          </div>
        </div>
      </div>

      <BarraFlotante items={items} activo={activo} onSeleccionar={seleccionar} onAbrirMas={() => setDrawerAbierto(true)} />

      {activo === idHome && <Brasas />}

      <SincronizadorOffline />
      <OndaDorada />
      <TelonBienvenida nombre={nombre} />
      <Celebracion />
    </div>
  );
}
