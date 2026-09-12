"use client";

import { useEffect, useState } from "react";
import {
  obtenerMiPerfil,
  obtenerMiSolicitudDescansoPendiente,
  solicitarCambioDescanso,
  type SolicitudDescansoPropia,
} from "./actions";
import { DIAS_SEMANA } from "@/lib/fechas";

const MAX_DIAS = 2;

export default function MiDescanso() {
  const [diasActuales, setDiasActuales] = useState<string[]>([]);
  const [dias, setDias] = useState<string[]>([]);
  const [pendiente, setPendiente] = useState<SolicitudDescansoPropia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);

  function cargar() {
    setCargando(true);
    Promise.all([obtenerMiPerfil(), obtenerMiSolicitudDescansoPendiente()])
      .then(([perfil, solicitud]) => {
        setDiasActuales(perfil.diasDescanso);
        setDias(perfil.diasDescanso);
        setPendiente(solicitud);
      })
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  function toggleDia(dia: string) {
    setMensaje(null);
    setDias((prev) => {
      if (prev.includes(dia)) return prev.filter((d) => d !== dia);
      if (prev.length >= MAX_DIAS) return prev;
      return [...prev, dia];
    });
  }

  async function enviar() {
    setEnviando(true);
    setMensaje(null);
    const resultado = await solicitarCambioDescanso(dias);
    setEnviando(false);
    setMensaje({ texto: resultado.mensaje || (resultado.exito ? "Enviado." : "No se pudo enviar."), exito: resultado.exito });
    if (resultado.exito) cargar();
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tu descanso...</p>;
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        🛌 MI DESCANSO SEMANAL
      </h3>
      <p className="text-marca-tenue text-[11px]">
        {diasActuales.length > 0
          ? `Tu descanso actual: ${diasActuales.join(" y ")}.`
          : "Aún no tienes un día de descanso fijo asignado."}{" "}
        Elige hasta {MAX_DIAS} día(s) y envía la solicitud — el coordinador debe aprobarla antes de
        que quede activa.
      </p>

      {pendiente && (
        <div className="bg-amber-950/20 border border-amber-500/40 rounded-[3px] px-3 py-2">
          <p className="text-amber-400 text-[11px] font-bold">
            ⏳ Solicitud pendiente: {pendiente.diasSolicitados.join(" y ") || "sin días"} — esperando
            aprobación del coordinador.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {DIAS_SEMANA.map((dia) => {
          const activo = dias.includes(dia);
          return (
            <button
              key={dia}
              onClick={() => toggleDia(dia)}
              className={`px-3 py-2 rounded-[3px] text-[11px] font-black tracking-widest uppercase transition ${
                activo
                  ? "bg-marca-rojo text-marca-textofuerte"
                  : "bg-marca-fondo border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
              }`}
            >
              {dia}
            </button>
          );
        })}
      </div>

      <button
        onClick={enviar}
        disabled={enviando}
        className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
      >
        {enviando ? "Enviando..." : "Solicitar cambio de descanso"}
      </button>

      {mensaje && (
        <p className={`text-xs font-bold ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
