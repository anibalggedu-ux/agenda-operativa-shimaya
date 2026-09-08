"use client";

import { useEffect, useState } from "react";
import {
  obtenerDescansosUsuarios,
  actualizarDiasDescanso,
  type UsuarioDescanso,
} from "./actions";
import { MAX_DIAS_DESCANSO } from "./constantes";
import { DIAS_SEMANA } from "@/lib/fechas";

const ABREVIATURA: Record<string, string> = {
  DOMINGO: "D",
  LUNES: "L",
  MARTES: "M",
  MIERCOLES: "X",
  JUEVES: "J",
  VIERNES: "V",
  SABADO: "S",
};

export default function DescansosSemanales() {
  const [filas, setFilas] = useState<UsuarioDescanso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Record<string, string>>({});

  useEffect(() => {
    obtenerDescansosUsuarios()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar los descansos."))
      .finally(() => setCargando(false));
  }, []);

  async function handleToggle(usuarioId: string, dia: string) {
    const fila = filas.find((f) => f.usuarioId === usuarioId);
    if (!fila) return;

    const yaTiene = fila.diasDescanso.includes(dia);
    let nuevos: string[];
    if (yaTiene) {
      nuevos = fila.diasDescanso.filter((d) => d !== dia);
    } else {
      if (fila.diasDescanso.length >= MAX_DIAS_DESCANSO) {
        setMensaje((prev) => ({
          ...prev,
          [usuarioId]: `Máximo ${MAX_DIAS_DESCANSO} días de descanso.`,
        }));
        return;
      }
      nuevos = [...fila.diasDescanso, dia];
    }

    setFilas((prev) =>
      prev.map((f) => (f.usuarioId === usuarioId ? { ...f, diasDescanso: nuevos } : f))
    );
    setMensaje((prev) => ({ ...prev, [usuarioId]: "" }));

    const resultado = await actualizarDiasDescanso(usuarioId, nuevos);
    if (!resultado.exito) {
      setFilas((prev) =>
        prev.map((f) => (f.usuarioId === usuarioId ? { ...f, diasDescanso: fila.diasDescanso } : f))
      );
      setMensaje((prev) => ({ ...prev, [usuarioId]: resultado.mensaje || "No se pudo guardar." }));
    }
  }

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando descansos...</p>;
  }
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h3 className="text-xs font-black tracking-widest text-slate-300 mb-1">
        DESCANSOS SEMANALES
      </h3>
      <p className="text-slate-500 text-[11px] mb-3">
        Hasta {MAX_DIAS_DESCANSO} días fijos de descanso por semana, por persona.
      </p>
      <div className="space-y-2">
        {filas.map((f) => (
          <div
            key={f.usuarioId}
            className="flex items-center justify-between flex-wrap gap-3 bg-[#0f111a] border border-slate-800 rounded-xl p-3"
          >
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{f.usuarioNombre}</p>
              <p className="text-slate-500 text-[11px] uppercase">{f.rol}</p>
              {mensaje[f.usuarioId] && (
                <p className="text-yellow-400 text-[11px] font-bold mt-1">{mensaje[f.usuarioId]}</p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {DIAS_SEMANA.map((dia) => {
                const activo = f.diasDescanso.includes(dia);
                return (
                  <button
                    key={dia}
                    title={dia}
                    onClick={() => handleToggle(f.usuarioId, dia)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition ${
                      activo
                        ? "bg-indigo-600 text-white"
                        : "bg-[#0d1117] border border-slate-800 text-slate-500 hover:border-indigo-500"
                    }`}
                  >
                    {ABREVIATURA[dia]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
