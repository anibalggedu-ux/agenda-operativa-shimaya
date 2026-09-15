"use client";

import { useEffect, useState } from "react";
import {
  obtenerMiSolicitudPermisoPendiente,
  solicitarPermiso,
  type SolicitudPermisoPropia,
  type TipoSolicitudPermiso,
} from "./actions";
import { hoyPeru, formatearFechaLegible } from "@/lib/fechas";

export default function MiPermiso({
  tipo = "Permiso",
  onEstadoPendiente,
}: {
  tipo?: TipoSolicitudPermiso;
  onEstadoPendiente?: (hayPendiente: boolean) => void;
}) {
  const esVacaciones = tipo === "Vacaciones";
  const [fechaInicio, setFechaInicio] = useState(hoyPeru());
  const [fechaFin, setFechaFin] = useState(hoyPeru());
  const [motivo, setMotivo] = useState("");
  const [pendiente, setPendiente] = useState<SolicitudPermisoPropia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);

  function cargar() {
    setCargando(true);
    obtenerMiSolicitudPermisoPendiente(tipo)
      .then((solicitud) => {
        setPendiente(solicitud);
        onEstadoPendiente?.(!!solicitud);
      })
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function enviar() {
    setEnviando(true);
    setMensaje(null);
    const resultado = await solicitarPermiso(fechaInicio, fechaFin, motivo, tipo);
    setEnviando(false);
    setMensaje({ texto: resultado.mensaje || (resultado.exito ? "Enviado." : "No se pudo enviar."), exito: resultado.exito });
    if (resultado.exito) {
      setMotivo("");
      cargar();
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-marca-tenue text-[11px]">
        {esVacaciones
          ? "Pide tus vacaciones con anticipación indicando las fechas — el coordinador debe aprobarlas antes de que queden activas."
          : "Pide un permiso con anticipación indicando las fechas — el coordinador debe aprobarlo antes de que quede activo."}
      </p>

      {pendiente && (
        <div className="bg-amber-950/20 border border-amber-500/40 rounded-[3px] px-3 py-2">
          <p className="text-amber-400 text-[11px] font-bold">
            ⏳ Solicitud pendiente: {formatearFechaLegible(pendiente.fechaInicio)} →{" "}
            {formatearFechaLegible(pendiente.fechaFin)}
            {pendiente.motivo ? ` — ${pendiente.motivo}` : ""} — esperando aprobación del coordinador.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
          <input
            type="date"
            value={fechaInicio}
            min={hoyPeru()}
            onChange={(e) => {
              setFechaInicio(e.target.value);
              if (fechaFin < e.target.value) setFechaFin(e.target.value);
            }}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
          <input
            type="date"
            value={fechaFin}
            min={fechaInicio}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Motivo (opcional)
        </label>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. Trámite personal"
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>

      <button
        onClick={enviar}
        disabled={enviando}
        className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
      >
        {enviando ? "Enviando..." : esVacaciones ? "Solicitar vacaciones" : "Solicitar permiso"}
      </button>

      {mensaje && (
        <p className={`text-xs font-bold ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
