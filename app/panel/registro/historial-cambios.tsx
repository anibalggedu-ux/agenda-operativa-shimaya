"use client";

import { useEffect, useState } from "react";
import { obtenerHistorialCambios, type CambioAuditoria } from "./actions";
import { hoyPeru, sumarDias } from "@/lib/fechas";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistorialCambios() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [cambios, setCambios] = useState<CambioAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerHistorialCambios(desde, hasta)
      .then(setCambios)
      .catch((e) => setError(e.message || "Error al cargar el historial."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  return (
    <div>
      <p className="text-marca-tenue text-[11px] mb-3">
        Cada corrección o eliminación manual hecha desde Registro queda anotada aquí: quién la
        hizo y cuándo — nadie edita datos sin que quede constancia.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className={clasesInput}
          />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className={clasesInput}
          />
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando historial...</p>
      ) : cambios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">Sin cambios registrados en este rango.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {cambios.map((c) => (
            <div key={c.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-marca-textofuerte font-bold text-xs">{c.accion}</span>
                <span className="text-marca-tenue text-[10px] font-data whitespace-nowrap">
                  {formatearFechaHora(c.fecha)}
                </span>
              </div>
              <p className="text-marca-tenue text-[11px] mt-1">
                Por <span className="text-marca-texto font-semibold">{c.usuarioNombre}</span>
                {c.detalle ? ` — ${c.detalle}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
