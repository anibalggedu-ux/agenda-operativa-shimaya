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
    return <p className="text-slate-500 text-sm italic">Sin registros.</p>;
  }
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {lista.map((c, i) => (
        <div
          key={i}
          className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
            c.tarde ? "bg-red-950/20 border-red-600/50" : "bg-[#07080c] border-slate-800"
          }`}
        >
          <span className="text-white text-sm">
            {c.usuarioNombre}{" "}
            <span className="text-slate-500 text-[11px] uppercase">({c.rol})</span>
            {c.tarde && <span className="text-red-400 text-[10px] font-bold ml-2">TARDE</span>}
          </span>
          <span className="text-slate-500 text-[11px] capitalize">
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

  if (cargando) return <p className="text-slate-500 text-sm animate-pulse">Cargando...</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  if (tiendas.length === 0) {
    return (
      <p className="text-slate-500 text-sm italic">No hay visitas registradas en este rango.</p>
    );
  }

  const tiendaSel = tiendas.find((t) => t.tiendaId === tiendaId) ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase tracking-widest text-left">
              <th className="py-2 pr-3">Tienda</th>
              <th className="py-2 pr-3">Visitas</th>
              <th className="py-2 pr-3">Colaboradores tarde</th>
            </tr>
          </thead>
          <tbody>
            {tiendas.map((t) => (
              <tr key={t.tiendaId} className="border-t border-slate-800">
                <td className="py-2 pr-3 text-white">{t.tiendaNombre}</td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => {
                      setTiendaId(t.tiendaId);
                      setVista("visitantes");
                    }}
                    className={`font-black hover:underline ${
                      tiendaId === t.tiendaId && vista === "visitantes"
                        ? "text-purple-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {t.totalVisitas}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  {t.cantidadTarde === 0 ? (
                    <span className="text-slate-600">0</span>
                  ) : (
                    <button
                      onClick={() => {
                        setTiendaId(t.tiendaId);
                        setVista("tarde");
                      }}
                      className={`font-black hover:underline ${
                        tiendaId === t.tiendaId && vista === "tarde"
                          ? "text-purple-400"
                          : "text-red-400"
                      }`}
                    >
                      {t.cantidadTarde}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tiendaSel && vista && (
        <div className="bg-[#0d1117] border-2 border-purple-500/30 rounded-xl p-4">
          <h4 className="text-xs font-black tracking-widest text-slate-300 mb-3">
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
