"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  contarSolicitudesDescansoPendientes,
  obtenerSolicitudesDescansoPendientes,
  responderSolicitudDescanso,
  contarSolicitudesPermisoPendientes,
  obtenerSolicitudesPermisoPendientes,
  responderSolicitudPermiso,
  type SolicitudDescansoPendiente,
  type SolicitudPermisoPendiente,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

type ItemSolicitud =
  | { tipo: "descanso"; datos: SolicitudDescansoPendiente }
  | { tipo: "permiso"; datos: SolicitudPermisoPendiente };

export default function CampanitaDescansos() {
  const [abierto, setAbierto] = useState(false);
  const [conteo, setConteo] = useState(0);
  const [items, setItems] = useState<ItemSolicitud[] | null>(null);
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const parametros = useSearchParams();

  function cargarConteo() {
    Promise.all([contarSolicitudesDescansoPendientes(), contarSolicitudesPermisoPendientes()])
      .then(([descansos, permisos]) => setConteo(descansos + permisos))
      .catch(() => {});
  }

  function cargarItems() {
    Promise.all([obtenerSolicitudesDescansoPendientes(), obtenerSolicitudesPermisoPendientes()])
      .then(([descansos, permisos]) => {
        const combinadas: ItemSolicitud[] = [
          ...descansos.map((d): ItemSolicitud => ({ tipo: "descanso", datos: d })),
          ...permisos.map((p): ItemSolicitud => ({ tipo: "permiso", datos: p })),
        ].sort((a, b) => a.datos.createdAt.localeCompare(b.datos.createdAt));
        setItems(combinadas);
      })
      .catch(() => setItems([]));
  }

  useEffect(() => {
    cargarConteo();
    const intervalo = setInterval(cargarConteo, 60000);
    return () => clearInterval(intervalo);
  }, []);

  // Enlace directo desde el correo de "solicitó cambio de descanso/permiso"
  // (?abrirSolicitudes=1) — abre la campanita sola al cargar la página, sin
  // que el coordinador tenga que encontrarla y hacerle clic.
  useEffect(() => {
    if (parametros.get("abrirSolicitudes") === "1") {
      setAbierto(true);
      cargarItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir() {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    if (nuevoEstado) cargarItems();
  }

  async function responder(item: ItemSolicitud, aprobar: boolean) {
    setRespondiendoId(item.datos.id);
    const resultado =
      item.tipo === "descanso"
        ? await responderSolicitudDescanso(item.datos.id, aprobar)
        : await responderSolicitudPermiso(item.datos.id, aprobar);
    setRespondiendoId(null);
    if (resultado.exito) {
      setItems((prev) => (prev ? prev.filter((s) => s.datos.id !== item.datos.id) : prev));
      setConteo((prev) => Math.max(0, prev - 1));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={abrir}
        className="relative border border-marca-borde text-marca-tenue hover:text-marca-texto px-3 py-2 rounded-[3px] text-xs transition"
        aria-label="Solicitudes pendientes (descanso y permisos)"
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
          <div
            className="fixed inset-x-4 top-16 max-h-[70vh] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0
              sm:mt-2 sm:w-80 sm:max-h-96 overflow-y-auto bg-marca-superficie border border-marca-rojo/30
              rounded-[3px] shadow-lg z-20 p-3"
          >
            <p className="text-xs font-black tracking-widest text-marca-tenue mb-2">SOLICITUDES PENDIENTES</p>
            {items === null && <p className="text-marca-tenue text-xs animate-pulse">Cargando...</p>}
            {items && items.length === 0 && (
              <p className="text-marca-tenue text-xs italic">No hay solicitudes pendientes.</p>
            )}
            {items && items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.datos.id}
                    className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
                  >
                    <p className="text-marca-textofuerte text-xs font-bold">
                      {item.datos.usuarioNombre}{" "}
                      <span className="text-marca-tenue text-[10px] uppercase font-black">
                        · {item.tipo === "descanso" ? "Descanso" : "Permiso"}
                      </span>
                    </p>
                    {item.tipo === "descanso" ? (
                      <p className="text-[11px] text-marca-tenue mt-1">
                        {item.datos.diasActuales.length > 0 ? item.datos.diasActuales.join(" y ") : "Sin descanso"}
                        {" → "}
                        <span className="text-marca-textofuerte font-bold">
                          {item.datos.diasSolicitados.join(" y ") || "sin días"}
                        </span>
                        {item.datos.fechaDeseada && (
                          <> desde el {formatearFechaLegible(item.datos.fechaDeseada)}</>
                        )}
                      </p>
                    ) : (
                      <p className="text-[11px] text-marca-tenue mt-1">
                        <span className="text-marca-textofuerte font-bold">
                          {formatearFechaLegible(item.datos.fechaInicio)} → {formatearFechaLegible(item.datos.fechaFin)}
                        </span>
                        {item.datos.motivo && <> — {item.datos.motivo}</>}
                      </p>
                    )}
                    <p className="text-[10px] text-marca-tenue mt-1">
                      {formatearFechaLegible(item.datos.createdAt.slice(0, 10))}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => responder(item, true)}
                        disabled={respondiendoId === item.datos.id}
                        className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-1.5 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => responder(item, false)}
                        disabled={respondiendoId === item.datos.id}
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
