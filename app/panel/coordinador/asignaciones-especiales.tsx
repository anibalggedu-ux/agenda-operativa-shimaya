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
import SelectorGrid from "./selector-grid";

const TIPOS = ["Vacaciones", "Permiso", "Descanso Médico", "Misión Especial"] as const;

const ESTILOS_TIPO: Record<string, string> = {
  Vacaciones: "text-sky-400 border-sky-500/40 bg-sky-950/20",
  Permiso: "text-amber-400 border-amber-500/40 bg-amber-950/20",
  "Descanso Médico": "text-orange-400 border-orange-500/40 bg-orange-950/20",
  "Misión Especial": "text-violet-400 border-violet-500/40 bg-violet-950/20",
};

const estadoInicial: ResultadoAccion = { exito: false };

function BotonRegistrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
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

  const [usuarioId, setUsuarioId] = useState<string | null>(null);

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
    if (estado.exito) {
      cargarTodo();
      setUsuarioId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    await eliminarAsignacionEspecial(id);
    setAsignaciones((prev) => prev.filter((a) => a.id !== id));
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando asignaciones...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          NUEVA ASIGNACIÓN ESPECIAL
        </h3>

        <input type="hidden" name="usuarioId" value={usuarioId ?? ""} />

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Usuario
          </label>
          <SelectorGrid
            opciones={usuarios.map((u) => ({ id: u.id, titulo: u.nombre, subtitulo: u.rol }))}
            seleccionadoId={usuarioId}
            onSeleccionar={setUsuarioId}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Tipo
            </label>
            <select
              name="tipo"
              required
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Desde
            </label>
            <input
              type="date"
              name="fechaInicio"
              required
              defaultValue={hoyPeru()}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            />
          </div>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Hasta
            </label>
            <input
              type="date"
              name="fechaFin"
              required
              defaultValue={hoyPeru()}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Motivo (opcional)
            </label>
            <input
              name="motivo"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Detalle breve..."
            />
          </div>
        </div>

        <BotonRegistrar />

        {estado.mensaje && (
          <p
            className={`text-xs font-bold text-center ${
              estado.exito ? "text-emerald-400" : "text-marca-rojoclaro"
            }`}
          >
            {estado.mensaje}
          </p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
          VIGENTES / PRÓXIMAS ({asignaciones.length})
        </h3>
        {asignaciones.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">No hay asignaciones especiales registradas.</p>
        ) : (
          <div className="space-y-2">
            {asignaciones.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between border rounded-[3px] p-4 ${
                  ESTILOS_TIPO[a.tipo] || "border-marca-borde bg-marca-superficie text-marca-textofuerte"
                }`}
              >
                <div>
                  <p className="font-bold text-sm text-marca-textofuerte">
                    {a.usuarioNombre} — {a.tipo}
                  </p>
                  <p className="text-[11px] opacity-80 capitalize mt-1">
                    {formatearFechaLegible(a.fechaInicio)} → {formatearFechaLegible(a.fechaFin)}
                    {a.motivo ? " · " + a.motivo : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleEliminar(a.id)}
                  className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0 ml-3"
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
