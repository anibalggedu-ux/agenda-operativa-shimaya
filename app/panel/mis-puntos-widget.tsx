"use client";

import { useEffect, useState } from "react";
import { obtenerMisPuntos, type MisPuntos } from "./puntos-actions";

export default function MisPuntosWidget() {
  const [datos, setDatos] = useState<MisPuntos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerMisPuntos()
      .then(setDatos)
      .catch((e) => setError(e.message || "Error al cargar tus puntos."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando tus puntos...</p>;
  }

  if (error || !datos) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  const { puntos, medalla, siguiente } = datos;
  const progreso = siguiente ? Math.min(100, Math.round((puntos / siguiente.puntos) * 100)) : 100;

  return (
    <div className="bg-[#0f111a] border-2 border-yellow-500/30 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">🏆 MIS PUNTOS</h3>

      <div className="flex items-center gap-4">
        <span className="text-4xl leading-none">{medalla ? medalla.emoji : "🎯"}</span>
        <div>
          <p className="text-2xl font-black text-white">{puntos} pts</p>
          <p className="text-slate-400 text-xs">
            {medalla ? "Medalla " + medalla.etiqueta : "Aún sin medalla"}
          </p>
        </div>
      </div>

      {siguiente && (
        <div>
          <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-yellow-500 transition-all"
              style={{ width: progreso + "%" }}
            />
          </div>
          <p className="text-slate-500 text-[11px] mt-1">
            {siguiente.puntos - puntos} pts para {siguiente.emoji} {siguiente.etiqueta}
          </p>
        </div>
      )}
    </div>
  );
}
