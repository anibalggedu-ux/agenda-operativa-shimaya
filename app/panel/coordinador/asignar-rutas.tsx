"use client";

import { useEffect, useMemo, useState } from "react";
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
import { AREAS_RUTA } from "./constantes";
import { formatearFechaLegible, formatearHora, hoyPeru } from "@/lib/fechas";
import SelectorGrid from "./selector-grid";

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

function Marcacion({ hora, ubicacion }: { hora: string | null; ubicacion: string | null }) {
  if (!hora) return <span className="text-slate-600">sin marcar</span>;
  if (!ubicacion) return <span className="text-slate-300">{formatearHora(hora)}</span>;
  return (
    <a
      href={ubicacion}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 hover:text-cyan-300 underline font-bold"
    >
      {formatearHora(hora)}
    </a>
  );
}

export default function AsignarRutas() {
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasica[]>([]);
  const [rutas, setRutas] = useState<RutaActiva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [tiendaId, setTiendaId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyPeru());

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
    if (estado.exito) {
      cargarTodo();
      setUsuarioId(null);
      setTiendaId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    await eliminarRutaActiva(id);
    setRutas((prev) => prev.filter((r) => r.id !== id));
  }

  const asignadosEnFecha = useMemo(() => {
    const usuariosSet = new Set<string>();
    const tiendasSet = new Set<string>();
    rutas
      .filter((r) => r.fechaPlanificada === fecha)
      .forEach((r) => {
        usuariosSet.add(r.usuarioId);
        tiendasSet.add(r.tiendaId);
      });
    return { usuariosSet, tiendasSet };
  }, [rutas, fecha]);

  const opcionesUsuarios = useMemo(
    () =>
      usuarios.map((u) => ({
        id: u.id,
        titulo: u.nombre,
        subtitulo: u.rol,
        destacado: asignadosEnFecha.usuariosSet.has(u.id),
        etiquetaDestacado: "Ya asignado",
      })),
    [usuarios, asignadosEnFecha]
  );

  const opcionesTiendas = useMemo(
    () =>
      tiendas.map((t) => ({
        id: t.id,
        titulo: t.nombre,
        destacado: asignadosEnFecha.tiendasSet.has(t.id),
        etiquetaDestacado: "Ya cubierta",
      })),
    [tiendas, asignadosEnFecha]
  );

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
        <h3 className="text-xs font-black tracking-widest text-slate-300">NUEVA ASIGNACIÓN</h3>

        <input type="hidden" name="usuarioId" value={usuarioId ?? ""} />
        <input type="hidden" name="tiendaId" value={tiendaId ?? ""} />

        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Fecha planificada
          </label>
          <input
            type="date"
            name="fechaPlanificada"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full sm:w-56 p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-2">
            Usuario{" "}
            <span className="text-slate-600 normal-case font-normal">
              (verde = ya tiene ruta esta fecha)
            </span>
          </label>
          <SelectorGrid
            opciones={opcionesUsuarios}
            seleccionadoId={usuarioId}
            onSeleccionar={setUsuarioId}
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-2">
            Tienda{" "}
            <span className="text-slate-600 normal-case font-normal">
              (verde = ya cubierta esta fecha)
            </span>
          </label>
          <SelectorGrid
            opciones={opcionesTiendas}
            seleccionadoId={tiendaId}
            onSeleccionar={setTiendaId}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Área (opcional)
            </label>
            <select
              name="area"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            >
              <option value="">Selecciona...</option>
              {AREAS_RUTA.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
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
                className="flex items-center justify-between bg-[#0f111a] border border-slate-800 rounded-xl p-4 gap-3"
              >
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">
                    {r.usuarioNombre} → {r.tiendaNombre}
                  </p>
                  <p className="text-slate-500 text-[11px] capitalize mt-1">
                    {formatearFechaLegible(r.fechaPlanificada)}
                    {r.area ? " · " + r.area : ""}
                    {r.enfoque ? " · " + r.enfoque : ""}
                  </p>
                  <p className="text-[11px] mt-1">
                    <span className="text-slate-500">Ingreso:</span>{" "}
                    <Marcacion hora={r.horaIngreso} ubicacion={r.ubicacionIngreso} />
                    <span className="text-slate-600 mx-2">·</span>
                    <span className="text-slate-500">Salida:</span>{" "}
                    <Marcacion hora={r.horaSalida} ubicacion={r.ubicacionSalida} />
                  </p>
                </div>
                <button
                  onClick={() => handleEliminar(r.id)}
                  className="text-red-400 hover:text-red-300 text-[11px] font-bold uppercase shrink-0"
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
