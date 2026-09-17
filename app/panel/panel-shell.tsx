"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, X, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cerrarSesionAction } from "./logout-action";
import ThemeToggle from "./theme-toggle";

export type ItemMenuPanel = {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  contenido: ReactNode;
};

function BotonItem({
  item,
  activo,
  onClick,
}: {
  item: ItemMenuPanel;
  activo: boolean;
  onClick: () => void;
}) {
  const Icono = item.icono;
  return (
    <button
      onClick={onClick}
      className={`w-[calc(100%-1rem)] mx-2 flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-bold tracking-wide transition rounded-lg ${
        activo
          ? "text-marca-rojoclaro bg-marca-rojo/15"
          : "text-marca-tenue hover:text-marca-texto hover:bg-marca-superficie2"
      }`}
    >
      <Icono className="w-4 h-4 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{item.etiqueta}</span>
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
}) {
  // Permite enlaces directos a una sección (ej. desde el correo de "Nueva
  // ruta asignada" hacia la Bitácora de Campo): /panel/supervisor?seccion=bitacora
  const parametros = useSearchParams();
  const seccionUrl = parametros.get("seccion");
  const idInicial = seccionUrl && items.some((i) => i.id === seccionUrl) ? seccionUrl : defaultId ?? items[0]?.id;

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

      <div className="relative z-10 p-4 sm:p-6">
        <div className="sm:hidden mb-3 text-marca-tenue text-[11px]">
          Sesión activa: <span className="text-marca-textofuerte font-semibold">{nombre}</span>
        </div>

        <div className="mb-4 flex items-center justify-end gap-3 bg-marca-superficie border border-marca-borde border-r-4 border-r-marca-rojoclaro rounded-lg px-4 py-3">
          {seccionActiva && (
            <seccionActiva.icono className="w-6 h-6 shrink-0 text-marca-rojoclaro" strokeWidth={2} />
          )}
          <p className="font-display text-lg sm:text-xl font-bold text-marca-textofuerte truncate">
            {seccionActiva?.etiqueta}
          </p>
        </div>

        {encabezado}

        <div className="flex flex-col lg:flex-row border border-marca-borde rounded-[3px] overflow-hidden">
          <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-marca-superficie border-r border-marca-borde">
            <nav className="flex-1 py-2 overflow-y-auto">
              {items.map((item) => (
                <BotonItem key={item.id} item={item} activo={activo === item.id} onClick={() => seleccionar(item.id)} />
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col bg-marca-fondo">
            <div className="flex-1 p-4 sm:p-6">
              {seccionActiva?.contenido}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
