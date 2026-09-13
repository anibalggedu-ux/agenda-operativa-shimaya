"use client";

import { useEffect, useState } from "react";
import { formatearFechaLegible } from "@/lib/fechas";

// Forma mínima que necesita este banner — coordinador y cada portal de
// campo tienen su propia acción de servidor (con su propio tipo, algunos
// campos extra como nombre/rol), pero todas calzan en esta forma.
export type PerfilBase = {
  diasDescanso: string[];
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
};

export default function PerfilBanner({ cargarPerfil }: { cargarPerfil: () => Promise<PerfilBase> }) {
  const [perfil, setPerfil] = useState<PerfilBase | null>(null);

  useEffect(() => {
    cargarPerfil()
      .then(setPerfil)
      .catch(() => setPerfil(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!perfil) return null;

  const textoDescanso =
    perfil.diasDescanso.length === 0 ? "Sin descanso fijo asignado" : perfil.diasDescanso.join(" y ");

  const textoAntiguedad = perfil.antiguedad
    ? `${perfil.antiguedad.anios} año${perfil.antiguedad.anios !== 1 ? "s" : ""}` +
      (perfil.antiguedad.meses > 0
        ? ` y ${perfil.antiguedad.meses} mes${perfil.antiguedad.meses !== 1 ? "es" : ""}`
        : "")
    : "No registrada";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] px-4 py-3">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
          🛌 Descanso semanal
        </p>
        <p className="text-marca-textofuerte text-sm font-bold mt-1">{textoDescanso}</p>
      </div>

      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] px-4 py-3">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
          📅 Antigüedad
        </p>
        <p className="text-marca-textofuerte text-sm font-bold mt-1">{textoAntiguedad}</p>
      </div>

      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] px-4 py-3">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
          🎉 Próximo aniversario
        </p>
        {perfil.proximoAniversario ? (
          <p className="text-marca-textofuerte text-sm font-bold mt-1 capitalize">
            {perfil.proximoAniversario.diasFaltantes === 0
              ? "¡Hoy!"
              : `En ${perfil.proximoAniversario.diasFaltantes} día${
                  perfil.proximoAniversario.diasFaltantes !== 1 ? "s" : ""
                }`}{" "}
            <span className="text-marca-tenue font-normal">
              ({formatearFechaLegible(perfil.proximoAniversario.fecha)})
            </span>
          </p>
        ) : (
          <p className="text-marca-textofuerte text-sm font-bold mt-1">—</p>
        )}
      </div>
    </div>
  );
}
