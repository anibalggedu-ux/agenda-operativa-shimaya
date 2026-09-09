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
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        🏆 RANKING DE CAPACITADORES
      </h3>
      <p className="text-marca-tenue text-[11px]">
        Puntos acumulados de por vida — puntualidad + reportes enviados.
      </p>

      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando ranking...</p>
      ) : error ? (
        <p className="text-marca-rojoclaro text-sm">{error}</p>
      ) : vitrina.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">Todavía no hay puntos acumulados.</p>
      ) : (
        <div className="space-y-2">
          {vitrina.map((fila, i) => (
            <div
              key={fila.usuarioId}
              className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] p-3 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-marca-tenue font-black text-xs w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <p className="text-marca-textofuerte font-bold text-sm truncate">{fila.nombre}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  {UMBRALES_MEDALLAS.map((u) =>
                    fila.medallas[u.id] > 0 ? (
                      <span key={u.id} className="text-xs font-bold text-marca-texto whitespace-nowrap">
                        {u.emoji}×{fila.medallas[u.id]}
                      </span>
                    ) : null
                  )}
                </div>
                <span className="text-marca-rojoclaro font-black text-sm shrink-0">
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
