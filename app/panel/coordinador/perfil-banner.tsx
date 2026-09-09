"use client";

import { useEffect, useState } from "react";
import { obtenerPerfilCoordinador, type PerfilCoordinador } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function PerfilBanner() {
  const [perfil, setPerfil] = useState<PerfilCoordinador | null>(null);

  useEffect(() => {
    obtenerPerfilCoordinador()
      .then(setPerfil)
      .catch(() => setPerfil(null));
  }, []);

  if (!perfil) return null;

  const textoDescanso =
    perfil.diasDescanso.length === 0
      ? "Sin descanso fijo asignado"
      : perfil.diasDescanso.join(" y ");

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
