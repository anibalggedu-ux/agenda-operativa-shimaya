"use client";

import { useEffect, useState } from "react";
import { obtenerMiPerfil, actualizarMiDescanso } from "./actions";
import { DIAS_SEMANA } from "@/lib/fechas";

const MAX_DIAS = 2;

export default function MiDescanso() {
  const [dias, setDias] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    obtenerMiPerfil()
      .then((perfil) => setDias(perfil.diasDescanso))
      .finally(() => setCargando(false));
  }, []);

  function toggleDia(dia: string) {
    setMensaje(null);
    setDias((prev) => {
      if (prev.includes(dia)) return prev.filter((d) => d !== dia);
      if (prev.length >= MAX_DIAS) return prev;
      return [...prev, dia];
    });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const resultado = await actualizarMiDescanso(dias);
    setMensaje(resultado.mensaje || (resultado.exito ? "Guardado." : "No se pudo guardar."));
    setGuardando(false);
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
        Elige hasta {MAX_DIAS} día(s) de descanso fijo por semana.
      </p>

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
        onClick={guardar}
        disabled={guardando}
        className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
      >
        {guardando ? "Guardando..." : "Guardar descanso"}
      </button>

      {mensaje && <p className="text-marca-rojoclaro text-xs font-bold">{mensaje}</p>}
    </div>
  );
}
