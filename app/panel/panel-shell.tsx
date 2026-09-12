"use client";

import { useState, type ReactNode } from "react";
import { cerrarSesionAction } from "./logout-action";

export type ItemMenuPanel = {
  id: string;
  etiqueta: string;
  icono: string;
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
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs font-bold tracking-wide transition border-l-2 ${
        activo
          ? "border-marca-rojoclaro text-marca-rojoclaro bg-marca-rojo/10"
          : "border-transparent text-marca-tenue hover:text-marca-texto hover:bg-marca-superficie2"
      }`}
    >
      <span className="text-sm shrink-0">{item.icono}</span>
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
}: {
  nombre: string;
  tituloPortal: string;
  items: ItemMenuPanel[];
  defaultId?: string;
  accionesExtra?: ReactNode;
}) {
  const [activo, setActivo] = useState(defaultId ?? items[0]?.id);
  const [drawerAbierto, setDrawerAbierto] = useState(false);

  const seccionActiva = items.find((i) => i.id === activo) ?? items[0];

  function seleccionar(id: string) {
    setActivo(id);
    setDrawerAbierto(false);
  }

  return (
    <div className="flex flex-col lg:flex-row border border-marca-borde rounded-[3px] overflow-hidden">
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-marca-superficie border-r border-marca-borde">
        <div className="p-4 border-b border-marca-borde">
          <p className="font-display text-lg font-semibold text-marca-textofuerte">Shimaya</p>
          <p className="text-marca-tenue text-[10px] uppercase tracking-widest">{tituloPortal}</p>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {items.map((item) => (
            <BotonItem key={item.id} item={item} activo={activo === item.id} onClick={() => seleccionar(item.id)} />
          ))}
        </nav>
      </aside>

      {drawerAbierto && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerAbierto(false)} />
          <aside className="relative w-64 max-w-[80%] h-full bg-marca-superficie border-r border-marca-borde flex flex-col">
            <div className="p-4 border-b border-marca-borde flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-marca-textofuerte">Shimaya</p>
                <p className="text-marca-tenue text-[10px] uppercase tracking-widest">{tituloPortal}</p>
              </div>
              <button
                onClick={() => setDrawerAbierto(false)}
                className="text-marca-tenue text-xl leading-none"
                aria-label="Cerrar menú"
              >
                ✕
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

      <div className="flex-1 min-w-0 flex flex-col bg-marca-fondo">
        <div className="flex items-center justify-between gap-3 border-b border-marca-borde px-4 sm:px-6 py-3 bg-marca-superficie">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setDrawerAbierto(true)}
              className="lg:hidden bg-marca-superficie2 border border-marca-borde text-marca-texto w-9 h-9 rounded-[3px] shrink-0"
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div className="min-w-0">
              <p className="text-marca-tenue text-[11px] truncate">
                Sesión activa: <span className="text-marca-textofuerte font-semibold">{nombre}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {accionesExtra}
            <form action={cerrarSesionAction}>
              <button className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-3 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-marca-textofuerte mb-4 flex items-center gap-2">
            <span>{seccionActiva?.icono}</span> {seccionActiva?.etiqueta}
          </h2>
          {seccionActiva?.contenido}
        </div>
      </div>
    </div>
  );
}
