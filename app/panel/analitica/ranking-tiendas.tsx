"use client";

import { useEffect, useState } from "react";
import {
  obtenerVisitasTiendaDetalle,
  type RankingTiendasCompleto,
  type RankingTiendaCompleto,
  type VisitaTiendaDetalle,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

function CuadroRanking({
  titulo,
  filas,
  offset,
  tiendaSeleccionada,
  onSeleccionar,
  vacio,
}: {
  titulo: string;
  filas: RankingTiendaCompleto[];
  offset: number;
  tiendaSeleccionada: string | null;
  onSeleccionar: (id: string, nombre: string) => void;
  vacio: string;
}) {
  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
        {titulo} ({filas.length})
      </h4>
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">{vacio}</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {filas.map((f, i) => (
            <button
              key={f.tiendaId}
              onClick={() => onSeleccionar(f.tiendaId, f.tiendaNombre)}
              className={`w-full flex items-center justify-between text-left rounded-[3px] px-3 py-2 transition ${
                tiendaSeleccionada === f.tiendaId
                  ? "bg-marca-rojo/20 border border-marca-rojo"
                  : "bg-marca-fondo border border-marca-borde hover:border-marca-rojo/40"
              }`}
            >
              <span className="text-sm text-marca-texto truncate">
                <span className="text-marca-tenue font-black mr-2">{offset + i + 1}.</span>
                {f.tiendaNombre}
              </span>
              {f.visitas > 0 && (
                <span className="text-marca-rojoclaro font-black text-xs shrink-0 ml-2">
                  {f.visitas}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RankingTiendas({
  ranking,
  desde,
  hasta,
}: {
  ranking: RankingTiendasCompleto;
  desde: string;
  hasta: string;
}) {
  const [tiendaId, setTiendaId] = useState<string | null>(null);
  const [tiendaNombreSel, setTiendaNombreSel] = useState<string>("");
  const [visitas, setVisitas] = useState<VisitaTiendaDetalle[] | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    setTiendaId(null);
    setVisitas(null);
  }, [ranking]);

  function handleSeleccionar(id: string, nombre: string) {
    setTiendaId(id);
    setTiendaNombreSel(nombre);
    setCargandoDetalle(true);
    obtenerVisitasTiendaDetalle(id, desde, hasta)
      .then(setVisitas)
      .catch(() => setVisitas(null))
      .finally(() => setCargandoDetalle(false));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CuadroRanking
          titulo="🥇 TOP 20"
          filas={ranking.top20}
          offset={0}
          tiendaSeleccionada={tiendaId}
          onSeleccionar={handleSeleccionar}
          vacio="Sin visitas registradas en este rango."
        />
        <CuadroRanking
          titulo="DESDE EL PUESTO 21"
          filas={ranking.resto}
          offset={20}
          tiendaSeleccionada={tiendaId}
          onSeleccionar={handleSeleccionar}
          vacio="No hay más tiendas visitadas."
        />
        <CuadroRanking
          titulo="🚫 SIN VISITAS"
          filas={ranking.sinVisitas}
          offset={0}
          tiendaSeleccionada={tiendaId}
          onSeleccionar={handleSeleccionar}
          vacio="Todas las tiendas recibieron al menos una visita."
        />
      </div>

      {tiendaId && (
        <div className="bg-marca-superficie border-2 border-marca-rojo/30 rounded-[3px] p-4">
          <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
            VISITAS A {tiendaNombreSel.toUpperCase()}
          </h4>
          {cargandoDetalle ? (
            <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
          ) : !visitas || visitas.length === 0 ? (
            <p className="text-marca-tenue text-sm italic">
              Sin visitas registradas en este rango de fechas.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {visitas.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2"
                >
                  <span className="text-marca-texto text-sm">
                    {v.usuarioNombre}{" "}
                    <span className="text-marca-tenue text-[11px] uppercase">({v.rol})</span>
                    {!v.tieneObservacion && (
                      <span className="text-marca-tenue text-[10px] font-normal ml-2">
                        (sin observación)
                      </span>
                    )}
                  </span>
                  <span className="text-marca-tenue text-[11px] capitalize">
                    {formatearFechaLegible(v.fecha)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
