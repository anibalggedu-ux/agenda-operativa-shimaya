"use client";

import { useEffect, useState } from "react";
import { obtenerActividadUsuarios, type ActividadUsuario } from "./actividad-actions";
import { hoyPeru, sumarDias, diasEntreFechas, formatearFechaLegible } from "@/lib/fechas";

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

function DiasDesde({ fecha, tipo }: { fecha: string | null; tipo: "fecha" | "timestamp" }) {
  if (!fecha) {
    return <span className="text-marca-rojoclaro font-bold">Sin registro en los últimos 180 días</span>;
  }
  const fechaSolo = tipo === "timestamp" ? fecha.slice(0, 10) : fecha;
  const dias = diasEntreFechas(fechaSolo, hoyPeru());
  const texto = tipo === "timestamp" ? formatearFechaHora(fecha) : formatearFechaLegible(fecha);
  const etiquetaDias = dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  return (
    <span className={dias >= 7 ? "text-amber-400 font-bold" : "text-marca-texto"}>
      {texto} <span className="text-marca-tenue">({etiquetaDias})</span>
    </span>
  );
}

function FilaUsuario({ u }: { u: ActividadUsuario }) {
  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3 space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-marca-textofuerte font-bold text-sm">{u.nombre}</span>
        <span className="text-marca-tenue text-[10px] uppercase">{u.rol}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <p className="text-marca-tenue">
          Accesos en el rango: <span className="text-marca-texto font-bold">{u.accesosEnRango}</span>
        </p>
        <p className="text-marca-tenue">
          Reportes en el rango: <span className="text-marca-texto font-bold">{u.reportesEnRango}</span>
        </p>
        <p className="text-marca-tenue">
          Último acceso: <DiasDesde fecha={u.ultimoAcceso} tipo="timestamp" />
        </p>
        <p className="text-marca-tenue">
          Último reporte: <DiasDesde fecha={u.ultimoReporte} tipo="fecha" />
        </p>
      </div>
    </div>
  );
}

export default function ActividadUsuarios() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [datos, setDatos] = useState<ActividadUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerActividadUsuarios(desde, hasta)
      .then(setDatos)
      .catch((e) => setError(e.message || "Error al cargar la actividad."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const sinAccesos = datos.filter((u) => u.accesosEnRango === 0);
  const conAccesos = datos.filter((u) => u.accesosEnRango > 0);

  return (
    <div>
      <p className="text-marca-tenue text-[11px] mb-3">
        Quién entra al sistema y genera reportes, y quién no — el acceso se registra desde que se
        activó esta sección en adelante, no hay datos de antes.
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
        <p className="text-marca-tenue text-sm animate-pulse">Cargando actividad...</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-marca-rojoclaro text-[10px] uppercase font-black tracking-widest mb-2">
              Sin accesos en este rango ({sinAccesos.length})
            </p>
            {sinAccesos.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Todos entraron al sistema en este rango.</p>
            ) : (
              <div className="space-y-2">
                {sinAccesos.map((u) => (
                  <FilaUsuario key={u.usuarioId} u={u} />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-marca-tenue text-[10px] uppercase font-black tracking-widest mb-2">
              Con accesos en este rango ({conAccesos.length})
            </p>
            {conAccesos.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Nadie entró al sistema en este rango.</p>
            ) : (
              <div className="space-y-2">
                {conAccesos.map((u) => (
                  <FilaUsuario key={u.usuarioId} u={u} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
