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
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Asignando..." : "Asignar ruta"}
    </button>
  );
}

function Marcacion({
  hora,
  ubicacion,
  fotoUrl,
}: {
  hora: string | null;
  ubicacion: string | null;
  fotoUrl?: string | null;
}) {
  if (!hora) return <span className="text-marca-tenue">sin marcar</span>;
  return (
    <>
      {ubicacion ? (
        <a
          href={ubicacion}
          target="_blank"
          rel="noopener noreferrer"
          className="text-marca-rojoclaro hover:text-marca-rojo underline font-bold"
        >
          {formatearHora(hora)}
        </a>
      ) : (
        <span className="text-marca-texto">{formatearHora(hora)}</span>
      )}
      {fotoUrl && (
        <a href={fotoUrl} target="_blank" rel="noopener noreferrer" className="ml-1" title="Ver foto">
          📷
        </a>
      )}
    </>
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
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando rutas...</p>;
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
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">NUEVA ASIGNACIÓN</h3>

        <input type="hidden" name="usuarioId" value={usuarioId ?? ""} />
        <input type="hidden" name="tiendaId" value={tiendaId ?? ""} />

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Fecha planificada
          </label>
          <input
            type="date"
            name="fechaPlanificada"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full sm:w-56 p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Usuario{" "}
            <span className="text-marca-tenue/70 normal-case font-normal">
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
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Tienda{" "}
            <span className="text-marca-tenue/70 normal-case font-normal">
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
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Área (opcional)
            </label>
            <select
              name="area"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Enfoque (opcional)
            </label>
            <input
              name="enfoque"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Ej: Capacitación de nuevo protocolo..."
            />
          </div>
        </div>

        <BotonAsignar />

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
          RUTAS ACTIVAS ({rutas.length})
        </h3>
        {rutas.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">No hay rutas activas asignadas.</p>
        ) : (
          <div className="space-y-2">
            {rutas.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between border rounded-[3px] p-4 gap-3 ${
                  r.clima?.riesgo
                    ? "bg-amber-950/15 border-amber-500/40"
                    : "bg-marca-superficie border-marca-borde"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-marca-textofuerte font-bold text-sm truncate">
                    {r.usuarioNombre} → {r.tiendaNombre}
                    {r.autoasignada && (
                      <span className="ml-2 text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
                        ⚡ Auto-asignada
                      </span>
                    )}
                  </p>
                  <p className="text-marca-tenue text-[11px] capitalize mt-1">
                    {formatearFechaLegible(r.fechaPlanificada)}
                    {r.area ? " · " + r.area : ""}
                    {r.enfoque ? " · " + r.enfoque : ""}
                  </p>
                  <p className="text-[11px] mt-1">
                    <span className="text-marca-tenue">Ingreso:</span>{" "}
                    <Marcacion hora={r.horaIngreso} ubicacion={r.ubicacionIngreso} fotoUrl={r.fotoIngresoUrl} />
                    <span className="text-marca-tenue mx-2">·</span>
                    <span className="text-marca-tenue">Salida:</span>{" "}
                    <Marcacion hora={r.horaSalida} ubicacion={r.ubicacionSalida} fotoUrl={r.fotoSalidaUrl} />
                  </p>
                  {r.clima && (
                    <p
                      className={`text-[11px] mt-1.5 font-bold ${
                        r.clima.riesgo ? "text-amber-400" : "text-marca-tenue"
                      }`}
                    >
                      {r.clima.icono} {r.clima.descripcion} · {r.clima.tempMax}°/{r.clima.tempMin}°
                      {r.clima.avisoTexto ? ` — ⚠️ ${r.clima.avisoTexto}` : ""}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleEliminar(r.id)}
                  className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0"
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
