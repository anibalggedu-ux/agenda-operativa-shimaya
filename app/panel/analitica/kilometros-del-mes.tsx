"use client";

import { useEffect, useState } from "react";
import { obtenerResumenKilometros, type FilaKilometros } from "../kilometros-actions";
import { hoyPeru } from "@/lib/fechas";
import { formatearMinutos } from "@/lib/distancia";

function primerDiaDelMes(fechaISO: string): string {
  return fechaISO.slice(0, 7) + "-01";
}

const MEDALLAS_TOP3 = ["🥇", "🥈", "🥉"];

// Ranking fijo del mes calendario en curso (sin selector de fechas) — para
// que quede a la vista de un vistazo al entrar, útil para definir premios e
// incentivos mensuales por kilometraje recorrido. Con soloRol, se filtra a
// un solo rol (ej. capacitador) para que cada quien se compare con sus
// pares, no con todo el equipo. `limite` corta la lista (por defecto un
// podio de 3, como en Central Analítica) — pasar 0 para mostrarla completa
// (ej. el Inicio de Capacitador, donde cada quien quiere verse a sí mismo
// aunque no esté entre los primeros 3).
export default function KilometrosDelMes({
  soloRol,
  limite = 3,
}: { soloRol?: string; limite?: number } = {}) {
  const [filas, setFilas] = useState<FilaKilometros[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hoy = hoyPeru();
  const desde = primerDiaDelMes(hoy);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerResumenKilometros(desde, hoy)
      .then((r) => {
        const filtradas = soloRol ? r.filas.filter((f) => f.rol === soloRol) : r.filas;
        setFilas(limite > 0 ? filtradas.slice(0, limite) : filtradas);
      })
      .catch((e) => setError(e.message || "Error al cargar los kilómetros del mes."))
      .finally(() => setCargando(false));
  }, [desde, hoy, soloRol, limite]);

  const nombreMes = new Date(hoy + "T00:00:00Z").toLocaleDateString("es-PE", {
    month: "long",
    timeZone: "UTC",
  });

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  }
  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }
  if (filas.length === 0) {
    return <p className="text-marca-tenue text-sm italic">Sin visitas registradas este mes.</p>;
  }

  return (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div
          key={f.usuarioId}
          className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] p-3 gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {i < 3 ? (
              <span className="text-lg shrink-0 w-5 text-center">{MEDALLAS_TOP3[i]}</span>
            ) : (
              <span className="text-marca-tenue font-black text-xs w-5 text-right shrink-0">{i + 1}</span>
            )}
            <div className="min-w-0">
              <p className="text-marca-textofuerte font-bold text-sm truncate">{f.usuarioNombre}</p>
              <p className="text-marca-tenue text-[10px] uppercase">
                {f.rol} · {f.totalVisitas} visita{f.totalVisitas === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-marca-rojoclaro font-black text-sm">{f.totalKm} km</p>
            <p className="text-marca-tenue text-[10px]">{formatearMinutos(f.totalMinutos)} manejando</p>
          </div>
        </div>
      ))}
      <p className="text-marca-tenue text-[10px] italic pt-1 capitalize">
        Acumulado de {nombreMes} hasta hoy.
      </p>
    </div>
  );
}
