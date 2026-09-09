"use client";

import { useEffect, useState } from "react";
import {
  obtenerTiendasBasicas,
  obtenerHistorialTiendaAnalitica,
  obtenerRotacionTienda,
  type TiendaBasicaAnalitica,
  type HistorialTiendaAnalitica,
  type EncargadoRotacion,
} from "./actions";
import { formatearFechaLegible, hoyPeru, sumarDias } from "@/lib/fechas";
import { generarPdfHistorialTienda } from "@/lib/generar-pdf";

function SelectorFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
    </div>
  );
}

export default function ReporteTienda() {
  const [tiendas, setTiendas] = useState<TiendaBasicaAnalitica[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());
  const [historial, setHistorial] = useState<HistorialTiendaAnalitica | null>(null);
  const [rotacion, setRotacion] = useState<EncargadoRotacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerTiendasBasicas().then(setTiendas);
  }, []);

  useEffect(() => {
    if (!tiendaId) {
      setHistorial(null);
      setRotacion([]);
      return;
    }
    setCargando(true);
    setError(null);
    Promise.all([
      obtenerHistorialTiendaAnalitica(tiendaId, desde, hasta),
      obtenerRotacionTienda(tiendaId),
    ])
      .then(([h, r]) => {
        setHistorial(h);
        setRotacion(r);
      })
      .catch((e) => setError(e.message || "Error al cargar el historial."))
      .finally(() => setCargando(false));
  }, [tiendaId, desde, hasta]);

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 space-y-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Tienda
          </label>
          <select
            value={tiendaId}
            onChange={(e) => setTiendaId(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="">Selecciona una tienda...</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando historial...</p>}

      {!cargando && !tiendaId && (
        <p className="text-marca-tenue text-sm italic">Selecciona una tienda para ver su historial.</p>
      )}

      {!cargando && historial && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display text-lg text-marca-textofuerte">{historial.tiendaNombre}</p>
              <p className="text-marca-tenue text-xs">
                {historial.totalVisitas} visita(s) en el rango seleccionado
              </p>
            </div>
            <button
              onClick={() => generarPdfHistorialTienda({ ...historial, desde, hasta })}
              className="bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              📄 Descargar PDF
            </button>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              COLABORADORES QUE VISITARON
            </h4>
            {historial.visitantes.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin visitas registradas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {historial.visitantes.map((v) => (
                  <span
                    key={v.usuarioNombre}
                    className="bg-marca-fondo border border-marca-borde rounded-full px-3 py-1.5 text-xs"
                  >
                    <span className="text-marca-textofuerte font-bold">{v.usuarioNombre}</span>{" "}
                    <span className="text-marca-tenue">({v.rol})</span>{" "}
                    <span className="text-marca-rojoclaro font-black">×{v.visitas}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              🔄 ROTACIÓN DE ENCARGADOS
            </h4>
            {rotacion.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">
                Nunca ha tenido un supervisor/capacitador permanente asignado.
              </p>
            ) : (
              <div className="space-y-2">
                {rotacion.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between flex-wrap gap-2 rounded-[3px] p-3 border ${
                      r.actual
                        ? "bg-emerald-950/20 border-emerald-700/40"
                        : "bg-marca-fondo border-marca-borde"
                    }`}
                  >
                    <div>
                      <p className="text-marca-textofuerte font-bold text-sm">
                        {r.usuarioNombre}{" "}
                        <span className="text-marca-tenue font-normal text-[11px] uppercase">
                          ({r.rol})
                        </span>
                      </p>
                      <p className="text-marca-tenue text-[11px] font-data mt-0.5">
                        {formatearFechaLegible(r.desde)} →{" "}
                        {r.hasta ? formatearFechaLegible(r.hasta) : "actualidad"}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-full ${
                        r.actual
                          ? "bg-emerald-900/40 text-emerald-300"
                          : "bg-marca-superficie2 text-marca-tenue"
                      }`}
                    >
                      {r.actual ? "Actual · " : ""}
                      {r.duracion}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              OBSERVACIONES
            </h4>
            {historial.observaciones.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">Sin observaciones en este rango.</p>
            ) : (
              <div className="space-y-2">
                {historial.observaciones.map((o, i) => (
                  <div key={i} className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
                    <p className="text-marca-textofuerte font-bold text-sm">
                      {o.usuarioNombre} <span className="text-marca-tenue font-normal">({o.rol})</span>
                    </p>
                    <p className="text-marca-tenue text-[11px] capitalize mt-1">
                      {formatearFechaLegible(o.fecha)}
                    </p>
                    <p className="text-marca-texto text-sm mt-2">{o.observacion}</p>
                    {o.actividad && (
                      <p className="text-marca-tenue text-[12px] italic mt-1">
                        Actividad: {o.actividad}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
