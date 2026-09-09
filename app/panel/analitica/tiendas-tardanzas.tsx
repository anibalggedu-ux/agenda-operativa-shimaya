"use client";

import { useEffect, useState } from "react";
import {
  obtenerTiendasPorTardanzas,
  type TiendaConTardanzas,
  type ColaboradorVisitaTienda,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

function ListaColaboradores({ lista }: { lista: ColaboradorVisitaTienda[] }) {
  if (lista.length === 0) {
    return <p className="text-marca-tenue text-sm italic">Sin registros.</p>;
  }
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {lista.map((c, i) => (
        <div
          key={i}
          className={`flex items-center justify-between rounded-[3px] px-3 py-2 border ${
            c.tarde ? "bg-marca-rojo/10 border-marca-rojo/40" : "bg-marca-fondo border-marca-borde"
          }`}
        >
          <span className="text-marca-texto text-sm">
            {c.usuarioNombre}{" "}
            <span className="text-marca-tenue text-[11px] uppercase">({c.rol})</span>
            {c.tarde && <span className="text-marca-rojoclaro text-[10px] font-bold ml-2">TARDE</span>}
          </span>
          <span className="text-marca-tenue text-[11px] capitalize">
            {formatearFechaLegible(c.fecha)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TiendasTardanzas({ desde, hasta }: { desde: string; hasta: string }) {
  const [tiendas, setTiendas] = useState<TiendaConTardanzas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tiendaId, setTiendaId] = useState<string | null>(null);
  const [vista, setVista] = useState<"visitantes" | "tarde" | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    setTiendaId(null);
    setVista(null);
    obtenerTiendasPorTardanzas(desde, hasta)
      .then(setTiendas)
      .catch((e) => setError(e.message || "Error al cargar las tardanzas por tienda."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  if (tiendas.length === 0) {
    return (
      <p className="text-marca-tenue text-sm italic">No hay visitas registradas en este rango.</p>
    );
  }

  const tiendaSel = tiendas.find((t) => t.tiendaId === tiendaId) ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-marca-tenue text-[10px] uppercase tracking-widest text-left">
              <th className="py-2 pr-3">Tienda</th>
              <th className="py-2 pr-3">Visitas</th>
              <th className="py-2 pr-3">Colaboradores tarde</th>
            </tr>
          </thead>
          <tbody>
            {tiendas.map((t) => {
              const visitantesActivo = tiendaId === t.tiendaId && vista === "visitantes";
              const tardeActivo = tiendaId === t.tiendaId && vista === "tarde";
              return (
                <tr key={t.tiendaId} className="border-t border-marca-borde">
                  <td className="py-2 pr-3 text-marca-texto">{t.tiendaNombre}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => {
                        setTiendaId(t.tiendaId);
                        setVista("visitantes");
                      }}
                      className={`font-black text-marca-rojoclaro hover:underline ${
                        visitantesActivo ? "underline" : ""
                      }`}
                    >
                      {t.totalVisitas}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    {t.cantidadTarde === 0 ? (
                      <span className="text-marca-tenue">0</span>
                    ) : (
                      <button
                        onClick={() => {
                          setTiendaId(t.tiendaId);
                          setVista("tarde");
                        }}
                        className={`font-black text-marca-rojoclaro hover:underline ${
                          tardeActivo ? "underline" : ""
                        }`}
                      >
                        {t.cantidadTarde}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tiendaSel && vista && (
        <div className="bg-marca-superficie border-2 border-marca-rojo/30 rounded-[3px] p-4">
          <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
            {vista === "visitantes"
              ? `COLABORADORES QUE VISITARON ${tiendaSel.tiendaNombre.toUpperCase()}`
              : `COLABORADORES QUE LLEGARON TARDE — ${tiendaSel.tiendaNombre.toUpperCase()}`}
          </h4>
          <ListaColaboradores
            lista={vista === "visitantes" ? tiendaSel.visitantes : tiendaSel.visitantesTarde}
          />
        </div>
      )}
    </div>
  );
}
