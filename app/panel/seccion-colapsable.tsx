"use client";

import { useState, type ReactNode } from "react";

export default function SeccionColapsable({
  titulo,
  descripcion,
  icono,
  children,
  abiertoPorDefecto = false,
}: {
  titulo: string;
  descripcion?: string;
  icono?: string;
  children: ReactNode;
  abiertoPorDefecto?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [montado, setMontado] = useState(abiertoPorDefecto);

  function toggle() {
    setAbierto((v) => !v);
    if (!montado) setMontado(true);
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-marca-superficie2 transition"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {icono && <span className="text-sm shrink-0">{icono}</span>}
          <span className="text-xs font-black tracking-widest text-marca-tenue truncate">{titulo}</span>
        </span>
        <span
          className={`text-marca-tenue text-[10px] shrink-0 transition-transform duration-200 ${
            abierto ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {!abierto && descripcion && (
        <p className="px-4 pb-3.5 -mt-2 text-marca-tenue text-[11px]">{descripcion}</p>
      )}
      {montado && (
        <div className={abierto ? "px-4 pb-4 border-t border-marca-borde pt-4" : "hidden"}>{children}</div>
      )}
    </div>
  );
}
