"use client";

import { useEffect, useState } from "react";
import {
  obtenerEstadoAsistenciaHoy,
  obtenerAmbiguedadSalida,
  marcarIngreso,
  marcarSalida,
} from "./gps-actions";
import { formatearHora, formatearFechaLegible } from "@/lib/fechas";

type Coordenadas = { lat: number; lng: number };

export default function GpsMarcador() {
  const [horaIngreso, setHoraIngreso] = useState<string | null>(null);
  const [horaSalida, setHoraSalida] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [preguntaFecha, setPreguntaFecha] = useState<{ hoy: string; ayer: string } | null>(null);

  useEffect(() => {
    obtenerEstadoAsistenciaHoy()
      .then((estado) => {
        setHoraIngreso(estado.horaIngreso);
        setHoraSalida(estado.horaSalida);
      })
      .finally(() => setCargando(false));
  }, []);

  function obtenerUbicacion(): Promise<Coordenadas> {
    return new Promise<Coordenadas>(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Tu navegador no soporta ubicación."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (posicion) {
          resolve({
            lat: posicion.coords.latitude,
            lng: posicion.coords.longitude,
          });
        },
        function () {
          reject(new Error("No se pudo obtener tu ubicación. Revisa los permisos del navegador."));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function handleIngreso() {
    setProcesando(true);
    setMensaje(null);
    try {
      const coords = await obtenerUbicacion();
      const resultado = await marcarIngreso(coords.lat, coords.lng);
      if (resultado.exito) {
        setHoraIngreso(resultado.hora || null);
        setMensaje("Ingreso registrado correctamente.");
      } else {
        setMensaje(resultado.mensaje || "Ocurrió un error.");
      }
    } catch (e: any) {
      setMensaje(e && e.message ? e.message : "Ocurrió un error.");
    } finally {
      setProcesando(false);
    }
  }

  async function handleSalida() {
    setProcesando(true);
    setMensaje(null);
    try {
      const ambiguedad = await obtenerAmbiguedadSalida();
      if (ambiguedad.ambiguo) {
        // Pasada la medianoche no se sabe si esta salida cierra el turno de
        // hoy o el de ayer — se le pregunta al colaborador antes de marcar.
        setPreguntaFecha({ hoy: ambiguedad.hoy, ayer: ambiguedad.ayer });
        setProcesando(false);
        return;
      }
      await confirmarSalida();
    } catch (e: any) {
      setMensaje(e && e.message ? e.message : "Ocurrió un error.");
      setProcesando(false);
    }
  }

  async function confirmarSalida(fechaElegida?: string) {
    setPreguntaFecha(null);
    setProcesando(true);
    setMensaje(null);
    try {
      const coords = await obtenerUbicacion();
      const resultado = await marcarSalida(coords.lat, coords.lng, fechaElegida);
      if (resultado.exito) {
        setHoraSalida(resultado.hora || null);
        setMensaje("Salida registrada correctamente.");
      } else {
        setMensaje(resultado.mensaje || "Ocurrió un error.");
      }
    } catch (e: any) {
      setMensaje(e && e.message ? e.message : "Ocurrió un error.");
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando estado de asistencia...</p>;
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        📍 REGISTRO DE ASISTENCIA
      </h3>

      <div className="flex gap-3 text-xs">
        <div className="flex-1 bg-marca-fondo rounded-[3px] p-3 border border-marca-borde">
          <p className="text-marca-tenue uppercase font-bold text-[10px]">Ingreso</p>
          <p className="text-marca-textofuerte font-black text-lg mt-1">
            {horaIngreso ? formatearHora(horaIngreso) : "—"}
          </p>
        </div>
        <div className="flex-1 bg-marca-fondo rounded-[3px] p-3 border border-marca-borde">
          <p className="text-marca-tenue uppercase font-bold text-[10px]">Salida</p>
          <p className="text-marca-textofuerte font-black text-lg mt-1">
            {horaSalida ? formatearHora(horaSalida) : "—"}
          </p>
        </div>
      </div>

      {preguntaFecha ? (
        <div className="bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-4 space-y-3">
          <p className="text-marca-rojoclaro text-xs font-bold text-center">
            Ya pasó la medianoche — ¿esta salida pertenece al turno de hoy o al de ayer?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => confirmarSalida(preguntaFecha.hoy)}
              disabled={procesando}
              className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-40 text-marca-textofuerte font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              Hoy ({formatearFechaLegible(preguntaFecha.hoy)})
            </button>
            <button
              onClick={() => confirmarSalida(preguntaFecha.ayer)}
              disabled={procesando}
              className="flex-1 bg-marca-superficie2 border border-marca-borde hover:border-marca-rojo/40 disabled:opacity-40 text-marca-texto font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              Ayer ({formatearFechaLegible(preguntaFecha.ayer)})
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleIngreso}
            disabled={procesando || !!horaIngreso}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
          >
            {procesando ? "..." : "Marcar Ingreso"}
          </button>
          <button
            onClick={handleSalida}
            disabled={procesando || !horaIngreso || !!horaSalida}
            className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-40 disabled:cursor-not-allowed text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
          >
            {procesando ? "..." : "Marcar Salida"}
          </button>
        </div>
      )}

      {mensaje && (
        <p className="text-marca-rojoclaro text-xs font-bold text-center">{mensaje}</p>
      )}
    </div>
  );
}
