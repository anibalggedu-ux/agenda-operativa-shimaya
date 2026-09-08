"use client";

import { useEffect, useState } from "react";
import { obtenerDashboardGerente, type DashboardGerente } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

function TarjetaKpi({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: number;
  color: string;
}) {
  return (
    <div className="bg-[#131418] border border-gray-800 rounded-2xl p-5">
      <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">
        {etiqueta}
      </p>
      <p className={`text-3xl font-black mt-2 ${color}`}>{valor}</p>
    </div>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState<DashboardGerente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerDashboardGerente()
      .then(setDatos)
      .catch((e) => setError(e.message || "Error al cargar el dashboard."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-gray-500 text-sm animate-pulse">Cargando dashboard...</p>;
  }

  if (error || !datos) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xs font-black tracking-widest text-gray-400 mb-3">
          HOY
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <TarjetaKpi
            etiqueta="Tiendas visitadas"
            valor={datos.kpis.tiendasVisitadasHoy}
            color="text-green-500"
          />
          <TarjetaKpi
            etiqueta="Reportes pendientes"
            valor={datos.kpis.reportesPendientesHoy}
            color="text-yellow-500"
          />
          <TarjetaKpi
            etiqueta="Reportes atrasados"
            valor={datos.kpis.reportesAtrasados}
            color="text-red-500"
          />
          <TarjetaKpi
            etiqueta="Personal en campo"
            valor={datos.kpis.personalEnCampoHoy}
            color="text-cyan-500"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-black tracking-widest text-gray-400 mb-3">
          🚨 ALERTAS CRÍTICAS — REPORTES ATRASADOS
        </h2>
        {datos.alertasAtrasadas.length === 0 ? (
          <p className="text-gray-600 text-sm italic">
            No hay reportes atrasados. Todo al día.
          </p>
        ) : (
          <div className="space-y-2">
            {datos.alertasAtrasadas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-red-950/20 border border-red-500/40 rounded-xl p-4"
              >
                <div>
                  <p className="text-white font-bold text-sm">
                    {a.usuarioNombre} → {a.tiendaNombre}
                  </p>
                  <p className="text-red-300 text-[11px] capitalize mt-1">
                    Planificado: {formatearFechaLegible(a.fechaPlanificada)}
                  </p>
                </div>
                <span className="text-red-400 font-black text-xs shrink-0 ml-3">
                  {a.diasAtraso} día{a.diasAtraso === 1 ? "" : "s"} atrasado
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-black tracking-widest text-gray-400 mb-3">
            🛌 PERSONAL DESCANSANDO HOY
          </h2>
          {datos.personalDescansandoHoy.length === 0 ? (
            <p className="text-gray-600 text-sm italic">Nadie tiene descanso fijo hoy.</p>
          ) : (
            <div className="space-y-2">
              {datos.personalDescansandoHoy.map((p, i) => (
                <div
                  key={i}
                  className="bg-[#131418] border border-gray-800 rounded-xl p-3 flex justify-between"
                >
                  <span className="text-white text-sm font-bold">{p.nombre}</span>
                  <span className="text-gray-500 text-[11px] uppercase">{p.rol}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xs font-black tracking-widest text-gray-400 mb-3">
            📋 VACACIONES / PERMISOS VIGENTES
          </h2>
          {datos.personalConAsignacionEspecial.length === 0 ? (
            <p className="text-gray-600 text-sm italic">
              Nadie tiene una asignación especial vigente hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {datos.personalConAsignacionEspecial.map((a, i) => (
                <div
                  key={i}
                  className="bg-[#131418] border border-gray-800 rounded-xl p-3"
                >
                  <p className="text-white text-sm font-bold">
                    {a.nombre} — {a.tipo}
                  </p>
                  <p className="text-gray-500 text-[11px] capitalize mt-1">
                    {formatearFechaLegible(a.fechaInicio)} → {formatearFechaLegible(a.fechaFin)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
