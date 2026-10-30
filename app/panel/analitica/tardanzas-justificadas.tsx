"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { obtenerTardanzasJustificadas, type TardanzaJustificada } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function TardanzasJustificadas({ desde, hasta }: { desde: string; hasta: string }) {
  const [filas, setFilas] = useState<TardanzaJustificada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerTardanzasJustificadas(desde, hasta)
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar las tardanzas justificadas."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  if (filas.length === 0) {
    return <p className="text-marca-tenue text-sm italic">No hay tardanzas justificadas en este rango de fechas.</p>;
  }

  return (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div key={i} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-marca-texto text-sm font-bold">
              {f.usuarioNombre} <span className="text-marca-tenue text-[11px] uppercase font-normal">({f.rol})</span>
            </span>
            <span className="text-marca-tenue text-[11px] capitalize shrink-0">
              {formatearFechaLegible(f.fecha)} · {f.tipo === "ingreso" ? "Ingreso" : "Break"}
            </span>
          </div>
          <p className="text-marca-texto text-[12.5px] mt-1.5">{f.texto}</p>
          {f.fotoUrl && (
            <a
              href={f.fotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold mt-2"
            >
              <Camera className="w-3 h-3" /> Ver foto
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
