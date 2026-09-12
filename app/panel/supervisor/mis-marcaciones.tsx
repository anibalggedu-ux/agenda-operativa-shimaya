"use client";

import { useEffect, useState } from "react";
import { obtenerMisMarcaciones, type MiMarcacion } from "./actions";
import { formatearFechaLegible, formatearHora, hoyPeru, sumarDias } from "@/lib/fechas";

function Marcacion({
  hora,
  ubicacion,
  fotoUrl,
}: {
  hora: string | null;
  ubicacion: string | null;
  fotoUrl?: string | null;
}) {
  if (!hora) return <span className="text-marca-tenue">—</span>;
  return (
    <>
      {ubicacion ? (
        <a
          href={ubicacion}
          target="_blank"
          rel="noopener noreferrer"
          className="text-marca-rojoclaro hover:text-marca-rojo underline font-bold"
        >
          {formatearHora(hora)}
        </a>
      ) : (
        <span>{formatearHora(hora)}</span>
      )}
      {fotoUrl && (
        <a href={fotoUrl} target="_blank" rel="noopener noreferrer" className="ml-1" title="Ver foto">
          📷
        </a>
      )}
    </>
  );
}

export default function MisMarcaciones() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [marcaciones, setMarcaciones] = useState<MiMarcacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerMisMarcaciones(desde, hasta)
      .then(setMarcaciones)
      .catch((e) => setError(e.message || "Error al cargar tus marcaciones."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        📍 MIS MARCACIONES GPS
      </h3>
      <p className="text-marca-tenue text-[11px]">
        Toca una hora para verificar la ubicación exacta en Google Maps.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando marcaciones...</p>
      ) : marcaciones.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">Sin marcaciones en este rango de fechas.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {marcaciones.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <p className="text-marca-tenue text-[11px] capitalize">
                {formatearFechaLegible(m.fecha)}
              </p>
              <p className="text-xs font-bold text-marca-texto">
                Ingreso:{" "}
                <Marcacion hora={m.horaIngreso} ubicacion={m.ubicacionIngreso} fotoUrl={m.fotoIngresoUrl} />{" "}
                · Salida:{" "}
                <Marcacion hora={m.horaSalida} ubicacion={m.ubicacionSalida} fotoUrl={m.fotoSalidaUrl} />
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
