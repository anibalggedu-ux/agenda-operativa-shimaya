"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerUsuariosYTiendas,
  obtenerRutasActivas,
  asignarRuta,
  eliminarRutaActiva,
  type UsuarioBasico,
  type TiendaBasica,
  type RutaActiva,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";

const estadoInicial: ResultadoAccion = { exito: false };

function BotonAsignar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
    >
      {pending ? "Asignando..." : "Asignar ruta"}
    </button>
  );
}

export default function AsignarRutas() {
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasica[]>([]);
  const [rutas, setRutas] = useState<RutaActiva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [estado, formAction] = useFormState(asignarRuta, estadoInicial);

  function cargarTodo() {
    setCargando(true);
    Promise.all([obtenerUsuariosYTiendas(), obtenerRutasActivas()])
      .then(([{ usuarios, tiendas }, rutas]) => {
        setUsuarios(usuarios);
        setTiendas(tiendas);
        setRutas(rutas);
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
    await eliminarRutaActiva(id);
    setRutas((prev) => prev.filter((r) => r.id !== id));
  }

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando rutas...</p>;
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
          NUEVA ASIGNACIÓN
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
              Tienda
            </label>
            <select
              name="tiendaId"
              required
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            >
              <option value="">Selecciona...</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Fecha planificada
            </label>
            <input
              type="date"
              name="fechaPlanificada"
              required
              defaultValue={hoyPeru()}
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Área (opcional)
            </label>
            <input
              name="area"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
              placeholder="Ej: Caja, Piso de venta..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Enfoque (opcional)
            </label>
            <input
              name="enfoque"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
              placeholder="Ej: Capacitación de nuevo protocolo..."
            />
          </div>
        </div>

        <BotonAsignar />

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
          RUTAS ACTIVAS ({rutas.length})
        </h3>
        {rutas.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No hay rutas activas asignadas.</p>
        ) : (
          <div className="space-y-2">
            {rutas.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between bg-[#0f111a] border border-slate-800 rounded-xl p-4"
              >
                <div>
                  <p className="text-white font-bold text-sm">
                    {r.usuarioNombre} → {r.tiendaNombre}
                  </p>
                  <p className="text-slate-500 text-[11px] capitalize mt-1">
                    {formatearFechaLegible(r.fechaPlanificada)}
                    {r.area ? " · " + r.area : ""}
                    {r.enfoque ? " · " + r.enfoque : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleEliminar(r.id)}
                  className="text-red-400 hover:text-red-300 text-[11px] font-bold uppercase shrink-0 ml-3"
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
