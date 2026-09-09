"use client";

import { useEffect, useState } from "react";
import { obtenerVitrinaTrofeos, type FilaVitrina } from "../puntos-actions";
import { UMBRALES_MEDALLAS } from "@/lib/trofeos";

export default function RankingCapacitadores() {
  const [vitrina, setVitrina] = useState<FilaVitrina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerVitrinaTrofeos()
      .then((filas) => setVitrina(filas.filter((f) => f.rol === "capacitador")))
      .catch((e) => setError(e.message || "Error al cargar el ranking."))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="bg-[#0f111a] border-2 border-yellow-500/30 rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        🏆 RANKING DE CAPACITADORES
      </h3>
      <p className="text-slate-500 text-[11px]">
        Puntos acumulados de por vida — puntualidad + reportes enviados.
      </p>

      {cargando ? (
        <p className="text-slate-500 text-sm animate-pulse">Cargando ranking...</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : vitrina.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Todavía no hay puntos acumulados.</p>
      ) : (
        <div className="space-y-2">
          {vitrina.map((fila, i) => (
            <div
              key={fila.usuarioId}
              className="flex items-center justify-between bg-[#0d1117] border border-slate-800 rounded-xl p-3 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-slate-600 font-black text-xs w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <p className="text-white font-bold text-sm truncate">{fila.nombre}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  {UMBRALES_MEDALLAS.map((u) =>
                    fila.medallas[u.id] > 0 ? (
                      <span key={u.id} className="text-xs font-bold text-slate-300 whitespace-nowrap">
                        {u.emoji}×{fila.medallas[u.id]}
                      </span>
                    ) : null
                  )}
                </div>
                <span className="text-yellow-400 font-black text-sm shrink-0">
                  {fila.puntos} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
