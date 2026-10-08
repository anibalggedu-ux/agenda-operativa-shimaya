"use client";

import { useState, type ReactNode } from "react";

// Envoltorio genérico para secciones pesadas (con su propia carga de datos)
// que no hace falta ver siempre abiertas -- arranca cerrado y recién monta
// su contenido la primera vez que se abre (no antes), para no pedirle nada
// al servidor hasta que alguien lo quiera ver.
export default function BloqueColapsable({
  icono,
  titulo,
  badge,
  abiertoPorDefecto,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  // Texto chico al lado del título (ej. "2 pendientes") -- opcional.
  badge?: string;
  abiertoPorDefecto?: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(!!abiertoPorDefecto);
  const [montado, setMontado] = useState(!!abiertoPorDefecto);

  function alternar() {
    setAbierto((v) => !v);
    if (!montado) setMontado(true);
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
      <button
        type="button"
        onClick={alternar}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-marca-superficie2 transition"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-marca-rojoclaro shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icono}</span>
          <span className="text-marca-textofuerte font-bold text-sm truncate">{titulo}</span>
          {badge && (
            <span className="shrink-0 text-[10px] font-black uppercase tracking-wide bg-marca-rojo/15 text-marca-rojoclaro px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </span>
        <span className={`text-marca-tenue text-[10px] transition-transform shrink-0 ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>
      {montado && <div className={abierto ? "px-4 pb-4 border-t border-marca-borde pt-3" : "hidden"}>{children}</div>}
    </div>
  );
}
