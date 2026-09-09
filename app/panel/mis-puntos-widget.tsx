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
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tus puntos...</p>;
  }

  if (error || !datos) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  const { puntos, medallas, progresoBronce } = datos;
  const progreso = Math.round((progresoBronce.actual / (progresoBronce.actual + progresoBronce.faltan)) * 100);

  return (
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">🏆 MIS PUNTOS</h3>

      <p className="font-display text-2xl text-marca-textofuerte">{puntos} pts</p>

      <div className="flex items-center gap-4">
        {UMBRALES_MEDALLAS.map((u) => (
          <div key={u.id} className="flex items-center gap-1">
            <span className="text-2xl leading-none">{u.emoji}</span>
            <span className="text-marca-texto font-black text-sm">×{medallas[u.id]}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="h-2 bg-marca-fondo rounded-full overflow-hidden border border-marca-borde">
          <div className="h-full bg-marca-rojo transition-all" style={{ width: progreso + "%" }} />
        </div>
        <p className="text-marca-tenue text-[11px] mt-1">
          {progresoBronce.faltan} pts para tu próximo 🥉
        </p>
      </div>
    </div>
  );
}
