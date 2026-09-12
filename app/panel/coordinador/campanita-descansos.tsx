"use client";

import { useEffect, useState } from "react";
import {
  contarSolicitudesDescansoPendientes,
  obtenerSolicitudesDescansoPendientes,
  responderSolicitudDescanso,
  type SolicitudDescansoPendiente,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

export default function CampanitaDescansos() {
  const [abierto, setAbierto] = useState(false);
  const [conteo, setConteo] = useState(0);
  const [solicitudes, setSolicitudes] = useState<SolicitudDescansoPendiente[] | null>(null);
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);

  function cargarConteo() {
    contarSolicitudesDescansoPendientes()
      .then(setConteo)
      .catch(() => {});
  }

  useEffect(() => {
    cargarConteo();
    const intervalo = setInterval(cargarConteo, 60000);
    return () => clearInterval(intervalo);
  }, []);

  function abrir() {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    if (nuevoEstado) {
      obtenerSolicitudesDescansoPendientes()
        .then(setSolicitudes)
        .catch(() => setSolicitudes([]));
    }
  }

  async function responder(id: string, aprobar: boolean) {
    setRespondiendoId(id);
    const resultado = await responderSolicitudDescanso(id, aprobar);
    setRespondiendoId(null);
    if (resultado.exito) {
      setSolicitudes((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      setConteo((prev) => Math.max(0, prev - 1));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={abrir}
        className="relative border border-marca-borde text-marca-tenue hover:text-marca-texto px-3 py-2 rounded-[3px] text-xs transition"
        aria-label="Solicitudes de descanso pendientes"
      >
        🔔
        {conteo > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-marca-rojo text-marca-textofuerte text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
            {conteo > 9 ? "9+" : conteo}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-marca-superficie border border-marca-rojo/30 rounded-[3px] shadow-lg z-20 p-3">
            <p className="text-xs font-black tracking-widest text-marca-tenue mb-2">
              SOLICITUDES DE DESCANSO
            </p>
            {solicitudes === null && (
              <p className="text-marca-tenue text-xs animate-pulse">Cargando...</p>
            )}
            {solicitudes && solicitudes.length === 0 && (
              <p className="text-marca-tenue text-xs italic">No hay solicitudes pendientes.</p>
            )}
            {solicitudes && solicitudes.length > 0 && (
              <div className="space-y-2">
                {solicitudes.map((s) => (
                  <div key={s.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3">
                    <p className="text-marca-textofuerte text-xs font-bold">{s.usuarioNombre}</p>
                    <p className="text-[11px] text-marca-tenue mt-1">
                      {s.diasActuales.length > 0 ? s.diasActuales.join(" y ") : "Sin descanso"}
                      {" → "}
                      <span className="text-marca-textofuerte font-bold">
                        {s.diasSolicitados.join(" y ") || "sin días"}
                      </span>
                    </p>
                    <p className="text-[10px] text-marca-tenue mt-1">
                      {formatearFechaLegible(s.createdAt.slice(0, 10))}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => responder(s.id, true)}
                        disabled={respondiendoId === s.id}
                        className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-1.5 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => responder(s.id, false)}
                        disabled={respondiendoId === s.id}
                        className="flex-1 border border-marca-borde text-marca-tenue hover:text-marca-texto disabled:opacity-50 font-black py-1.5 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
