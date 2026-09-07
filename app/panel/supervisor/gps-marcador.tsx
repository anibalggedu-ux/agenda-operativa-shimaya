"use client";

import { useEffect, useState } from "react";
import {
  obtenerEstadoAsistenciaHoy,
  marcarIngreso,
  marcarSalida,
} from "./gps-actions";
import { formatearHora } from "@/lib/fechas";

type Coordenadas = { lat: number; lng: number };

export default function GpsMarcador() {
  const [horaIngreso, setHoraIngreso] = useState<string | null>(null);
  const [horaSalida, setHoraSalida] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

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
      const coords = await obtenerUbicacion();
      const resultado = await marcarSalida(coords.lat, coords.lng);
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
    return <p className="text-slate-500 text-sm animate-pulse">Cargando estado de asistencia...</p>;
  }

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        📍 REGISTRO DE ASISTENCIA
      </h3>

      <div className="flex gap-3 text-xs">
        <div className="flex-1 bg-[#0d1117] rounded-xl p-3 border border-slate-800">
          <p className="text-slate-500 uppercase font-bold text-[10px]">Ingreso</p>
          <p className="text-white font-black text-lg mt-1">
            {horaIngreso ? formatearHora(horaIngreso) : "—"}
          </p>
        </div>
        <div className="flex-1 bg-[#0d1117] rounded-xl p-3 border border-slate-800">
          <p className="text-slate-500 uppercase font-bold text-[10px]">Salida</p>
          <p className="text-white font-black text-lg mt-1">
            {horaSalida ? formatearHora(horaSalida) : "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleIngreso}
          disabled={procesando || !!horaIngreso}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
        >
          {procesando ? "..." : "Marcar Ingreso"}
        </button>
        <button
          onClick={handleSalida}
          disabled={procesando || !horaIngreso || !!horaSalida}
          className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
        >
          {procesando ? "..." : "Marcar Salida"}
        </button>
      </div>

      {mensaje && (
        <p className="text-yellow-400 text-xs font-bold text-center">{mensaje}</p>
      )}
    </div>
  );
}