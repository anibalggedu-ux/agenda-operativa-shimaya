"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BedDouble, Check, ClipboardList } from "lucide-react";
import { obtenerDashboardGerente, marcarAlertaAtrasadaLeida, type DashboardGerente } from "./actions";
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
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <p className="text-marca-tenue text-[10px] uppercase font-semibold tracking-widest">
        {etiqueta}
      </p>
      <p className={`font-display text-3xl mt-2 ${color}`}>{valor}</p>
    </div>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState<DashboardGerente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Mientras se confirma con el servidor, para no dejar tocar "Leído" dos
  // veces en la misma alerta ni que se sienta trabada si tarda un poco.
  const [marcandoLeida, setMarcandoLeida] = useState<string | null>(null);
  const [errorAlerta, setErrorAlerta] = useState<string | null>(null);

  useEffect(() => {
    obtenerDashboardGerente()
      .then(setDatos)
      .catch((e) => setError(e.message || "Error al cargar el dashboard."))
      .finally(() => setCargando(false));
  }, []);

  async function handleMarcarLeida(id: string) {
    setMarcandoLeida(id);
    // Optimista: la quita de la lista al toque; si falla, se vuelve a poner
    // y se avisa por qué.
    const alertaRemovida = datos?.alertasAtrasadas.find((a) => a.id === id) ?? null;
    setDatos((prev) =>
      prev ? { ...prev, alertasAtrasadas: prev.alertasAtrasadas.filter((a) => a.id !== id) } : prev
    );
    const resultado = await marcarAlertaAtrasadaLeida(id).catch(() => ({
      exito: false as const,
      mensaje: "No se pudo conectar con el servidor.",
    }));
    setMarcandoLeida(null);
    if (!resultado.exito && alertaRemovida) {
      setDatos((prev) =>
        prev ? { ...prev, alertasAtrasadas: [...prev.alertasAtrasadas, alertaRemovida] } : prev
      );
      setErrorAlerta(resultado.mensaje || "No se pudo marcar la alerta como leída.");
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando dashboard...</p>;
  }

  if (error || !datos) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
          HOY
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <TarjetaKpi
            etiqueta="Tiendas reportadas"
            valor={datos.kpis.tiendasVisitadasHoy}
            color="text-emerald-500"
          />
          <TarjetaKpi
            etiqueta="Tiendas asignadas"
            valor={datos.kpis.tiendasAsignadasHoy}
            color="text-amber-400"
          />
          <TarjetaKpi
            etiqueta="Reportes atrasados"
            valor={datos.kpis.reportesAtrasados}
            color="text-marca-rojoclaro"
          />
          <TarjetaKpi
            etiqueta="Personal en campo"
            valor={datos.kpis.personalEnCampoHoy}
            color="text-marca-textofuerte"
          />
        </div>
      </div>

      <div>
        <h2 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-marca-rojoclaro" /> ALERTAS CRÍTICAS — REPORTES
          ATRASADOS
        </h2>
        {errorAlerta && (
          <div className="mb-2 flex items-center justify-between gap-2 bg-amber-950/20 border border-amber-500/40 rounded-[3px] p-2.5">
            <p className="text-amber-400 text-xs font-semibold">{errorAlerta}</p>
            <button
              onClick={() => setErrorAlerta(null)}
              className="shrink-0 text-[10px] font-bold text-amber-400/70 hover:text-amber-300"
            >
              Cerrar
            </button>
          </div>
        )}
        {datos.alertasAtrasadas.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">
            No hay reportes atrasados. Todo al día.
          </p>
        ) : (
          <div className="space-y-2">
            {datos.alertasAtrasadas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-4"
              >
                <div className="min-w-0">
                  <p className="text-marca-textofuerte font-semibold text-sm">
                    {a.usuarioNombre} → {a.tiendaNombre}
                  </p>
                  <p className="text-marca-rojoclaro text-[11px] capitalize mt-1">
                    Planificado: {formatearFechaLegible(a.fechaPlanificada)}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-marca-rojoclaro font-black text-xs whitespace-nowrap">
                    {a.diasAtraso} día{a.diasAtraso === 1 ? "" : "s"} atrasado
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMarcarLeida(a.id)}
                    disabled={marcandoLeida === a.id}
                    className="flex items-center gap-1 text-[10.5px] font-bold text-marca-tenue hover:text-emerald-400 border border-marca-borde hover:border-emerald-500/40 rounded-[3px] px-2 py-1 transition whitespace-nowrap disabled:opacity-50"
                    title="Ya lo sé — quitar esta alerta de la lista"
                  >
                    <Check className="w-3 h-3" /> Leído
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue mb-3">
            <BedDouble className="w-3.5 h-3.5 text-marca-rojoclaro" /> PERSONAL DESCANSANDO HOY
          </h2>
          {datos.personalDescansandoHoy.length === 0 ? (
            <p className="text-marca-tenue text-sm italic">Nadie tiene descanso fijo hoy.</p>
          ) : (
            <div className="space-y-2">
              {datos.personalDescansandoHoy.map((p, i) => (
                <div
                  key={i}
                  className="bg-marca-superficie border border-marca-borde rounded-[3px] p-3 flex justify-between"
                >
                  <span className="text-marca-textofuerte text-sm font-semibold">{p.nombre}</span>
                  <span className="text-marca-tenue text-[11px] uppercase">{p.rol}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue mb-3">
            <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> VACACIONES / PERMISOS VIGENTES
          </h2>
          {datos.personalConAsignacionEspecial.length === 0 ? (
            <p className="text-marca-tenue text-sm italic">
              Nadie tiene una asignación especial vigente hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {datos.personalConAsignacionEspecial.map((a, i) => (
                <div
                  key={i}
                  className="bg-marca-superficie border border-marca-borde rounded-[3px] p-3"
                >
                  <p className="text-marca-textofuerte text-sm font-semibold">
                    {a.nombre} — {a.tipo}
                  </p>
                  <p className="text-marca-tenue text-[11px] capitalize mt-1">
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
