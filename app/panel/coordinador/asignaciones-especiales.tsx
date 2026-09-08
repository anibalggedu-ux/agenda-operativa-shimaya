"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerUsuariosYTiendas,
  obtenerAsignacionesEspeciales,
  crearAsignacionEspecial,
  eliminarAsignacionEspecial,
  type UsuarioBasico,
  type AsignacionEspecial,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";

const TIPOS = ["Vacaciones", "Permiso", "Descanso Médico", "Misión Especial"] as const;

const ESTILOS_TIPO: Record<string, string> = {
  Vacaciones: "text-cyan-400 border-cyan-500/40 bg-cyan-950/20",
  Permiso: "text-yellow-400 border-yellow-500/40 bg-yellow-950/20",
  "Descanso Médico": "text-red-400 border-red-500/40 bg-red-950/20",
  "Misión Especial": "text-purple-400 border-purple-500/40 bg-purple-950/20",
};

const estadoInicial: ResultadoAccion = { exito: false };

function BotonRegistrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
    >
      {pending ? "Registrando..." : "Registrar asignación"}
    </button>
  );
}

export default function AsignacionesEspeciales() {
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionEspecial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [estado, formAction] = useFormState(crearAsignacionEspecial, estadoInicial);

  function cargarTodo() {
    setCargando(true);
    Promise.all([obtenerUsuariosYTiendas(), obtenerAsignacionesEspeciales()])
      .then(([{ usuarios }, asignaciones]) => {
        setUsuarios(usuarios);
        setAsignaciones(asignaciones);
      })
      .catch((e) => setError(e.message || "Error al cargar datos."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    if (estado.exito) cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    await eliminarAsignacionEspecial(id);
    setAsignaciones((prev) => prev.filter((a) => a.id !== id));
  }

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando asignaciones...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-[#0f111a] border-2 border-red-500/30 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-slate-300">
          NUEVA ASIGNACIÓN ESPECIAL
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Usuario
            </label>
            <select
              name="usuarioId"
              required
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            >
              <option value="">Selecciona...</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.rol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Tipo
            </label>
            <select
              name="tipo"
              required
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            >
              <option value="">Selecciona...</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Desde
            </label>
            <input
              type="date"
              name="fechaInicio"
              required
              defaultValue={hoyPeru()}
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Hasta
            </label>
            <input
              type="date"
              name="fechaFin"
              required
              defaultValue={hoyPeru()}
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Motivo (opcional)
            </label>
            <input
              name="motivo"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
              placeholder="Detalle breve..."
            />
          </div>
        </div>

        <BotonRegistrar />

        {estado.mensaje && (
          <p
            className={`text-xs font-bold text-center ${
              estado.exito ? "text-green-400" : "text-yellow-400"
            }`}
          >
            {estado.mensaje}
          </p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-black tracking-widest text-slate-300 mb-3">
          VIGENTES / PRÓXIMAS ({asignaciones.length})
        </h3>
        {asignaciones.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No hay asignaciones especiales registradas.</p>
        ) : (
          <div className="space-y-2">
            {asignaciones.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between border rounded-xl p-4 ${
                  ESTILOS_TIPO[a.tipo] || "border-slate-800 bg-[#0f111a] text-white"
                }`}
              >
                <div>
                  <p className="font-bold text-sm text-white">
                    {a.usuarioNombre} — {a.tipo}
                  </p>
                  <p className="text-[11px] opacity-80 capitalize mt-1">
                    {formatearFechaLegible(a.fechaInicio)} → {formatearFechaLegible(a.fechaFin)}
                    {a.motivo ? " · " + a.motivo : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleEliminar(a.id)}
                  className="text-red-300 hover:text-red-200 text-[11px] font-bold uppercase shrink-0 ml-3"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
