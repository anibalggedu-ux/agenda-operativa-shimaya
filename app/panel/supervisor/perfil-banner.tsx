"use client";

import { useEffect, useState } from "react";
import { obtenerMiPerfil, type PerfilPersonal } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function PerfilBanner() {
  const [perfil, setPerfil] = useState<PerfilPersonal | null>(null);

  useEffect(() => {
    obtenerMiPerfil()
      .then(setPerfil)
      .catch(() => setPerfil(null));
  }, []);

  if (!perfil) return null;

  const textoAntiguedad = perfil.antiguedad
    ? `${perfil.antiguedad.anios} año${perfil.antiguedad.anios !== 1 ? "s" : ""}` +
      (perfil.antiguedad.meses > 0
        ? ` y ${perfil.antiguedad.meses} mes${perfil.antiguedad.meses !== 1 ? "es" : ""}`
        : "")
    : "No registrada";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <div className="bg-[#0f111a] border border-yellow-700/40 rounded-xl px-4 py-3">
        <p className="text-yellow-400 text-[10px] font-black uppercase tracking-widest">
          📅 Antigüedad
        </p>
        <p className="text-white text-sm font-bold mt-1">{textoAntiguedad}</p>
      </div>

      <div className="bg-[#0f111a] border border-green-700/40 rounded-xl px-4 py-3">
        <p className="text-green-400 text-[10px] font-black uppercase tracking-widest">
          🎉 Próximo aniversario
        </p>
        {perfil.proximoAniversario ? (
          <p className="text-white text-sm font-bold mt-1 capitalize">
            {perfil.proximoAniversario.diasFaltantes === 0
              ? "¡Hoy!"
              : `En ${perfil.proximoAniversario.diasFaltantes} día${
                  perfil.proximoAniversario.diasFaltantes !== 1 ? "s" : ""
                }`}{" "}
            <span className="text-slate-500 font-normal">
              ({formatearFechaLegible(perfil.proximoAniversario.fecha)})
            </span>
          </p>
        ) : (
          <p className="text-white text-sm font-bold mt-1">—</p>
        )}
      </div>
    </div>
  );
}
