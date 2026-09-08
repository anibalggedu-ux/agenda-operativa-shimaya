"use client";

import { useEffect, useState } from "react";
import { obtenerMisPuntos, type MisPuntos } from "./puntos-actions";
import { UMBRALES_MEDALLAS } from "@/lib/trofeos";

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

  const { puntos, medallas, progresoBronce } = datos;
  const progreso = Math.round((progresoBronce.actual / (progresoBronce.actual + progresoBronce.faltan)) * 100);

  return (
    <div className="bg-[#0f111a] border-2 border-yellow-500/30 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">🏆 MIS PUNTOS</h3>

      <p className="text-2xl font-black text-white">{puntos} pts</p>

      <div className="flex items-center gap-4">
        {UMBRALES_MEDALLAS.map((u) => (
          <div key={u.id} className="flex items-center gap-1">
            <span className="text-2xl leading-none">{u.emoji}</span>
            <span className="text-slate-300 font-black text-sm">×{medallas[u.id]}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-yellow-500 transition-all" style={{ width: progreso + "%" }} />
        </div>
        <p className="text-slate-500 text-[11px] mt-1">
          {progresoBronce.faltan} pts para tu próximo 🥉
        </p>
      </div>
    </div>
  );
}
