"use client";

import { useEffect, useState } from "react";
import {
  obtenerUsuariosBasicos,
  obtenerAsistenciaParaCorregir,
  actualizarAsistencia,
  eliminarAsistencia,
  obtenerReportesParaCorregir,
  actualizarReporteRegistro,
  eliminarReporteRegistro,
  obtenerAsignacionesEspecialesParaCorregir,
  eliminarAsignacionEspecialRegistro,
  obtenerComunicadosParaCorregir,
  eliminarComunicado,
  obtenerTiendasConUbicacion,
  actualizarUbicacionTienda,
  type UsuarioBasicoRegistro,
  type AsistenciaCorregible,
  type ReporteCorregible,
  type AsignacionEspecialCorregible,
  type ComunicadoCorregible,
  type TiendaUbicacion,
} from "./actions";
import { hoyPeru, sumarDias, formatearFechaLegible } from "@/lib/fechas";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

const clasesInputChico =
  "p-2 bg-marca-superficie2 border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function BotonEliminar({
  onClick,
  cargando,
}: {
  onClick: () => void;
  cargando: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      className="border border-marca-rojo/40 text-marca-rojoclaro hover:bg-marca-rojo/10 disabled:opacity-50 font-black py-1.5 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
    >
      {cargando ? "..." : "Eliminar"}
    </button>
  );
}

function SeccionAsistencia() {
  const [usuarios, setUsuarios] = useState<UsuarioBasicoRegistro[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [registros, setRegistros] = useState<AsistenciaCorregible[]>([]);
  const [ediciones, setEdiciones] = useState<Record<string, { ingreso: string; salida: string }>>({});
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosBasicos().then(setUsuarios).catch(() => {});
  }, []);

  function cargar() {
    if (!usuarioId) {
      setRegistros([]);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerAsistenciaParaCorregir(usuarioId, desde, hasta)
      .then((filas) => {
        setRegistros(filas);
        const iniciales: Record<string, { ingreso: string; salida: string }> = {};
        filas.forEach((a) => {
          iniciales[a.id] = {
            ingreso: a.horaIngreso ? a.horaIngreso.slice(0, 5) : "",
            salida: a.horaSalida ? a.horaSalida.slice(0, 5) : "",
          };
        });
        setEdiciones(iniciales);
      })
      .catch((e) => setError(e.message || "Error al cargar las marcaciones."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [usuarioId, desde, hasta]);

  async function handleGuardar(id: string) {
    setGuardandoId(id);
    setError(null);
    const edicion = ediciones[id];
    const resultado = await actualizarAsistencia(
      id,
      edicion?.ingreso ? `${edicion.ingreso}:00` : null,
      edicion?.salida ? `${edicion.salida}:00` : null
    );
    setGuardandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo guardar.");
  }

  async function handleEliminar(id: string, fecha: string) {
    if (
      !window.confirm(
        `¿Eliminar por completo la marcación del ${formatearFechaLegible(fecha)}? No se puede deshacer.`
      )
    )
      return;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarAsistencia(id);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
        ASISTENCIA (MARCACIONES GPS)
      </h4>
      <p className="text-marca-tenue text-[11px] mb-3">
        Corrige la hora de ingreso/salida mal marcada, o elimina el registro completo si fue una
        prueba.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Persona
          </label>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={clasesInput}>
            <option value="">Selecciona...</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.rol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className={clasesInput}
          />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className={clasesInput}
          />
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>}

      {!cargando && usuarioId && registros.length === 0 && (
        <p className="text-marca-tenue text-sm italic">Sin marcaciones en ese rango.</p>
      )}
      {!usuarioId && <p className="text-marca-tenue text-sm italic">Selecciona una persona.</p>}

      {!cargando && registros.length > 0 && (
        <div className="space-y-2">
          {registros.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-end gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div className="text-marca-textofuerte text-xs font-bold capitalize min-w-[120px]">
                {formatearFechaLegible(r.fecha)}
              </div>
              <div>
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Ingreso
                </label>
                <input
                  type="time"
                  value={ediciones[r.id]?.ingreso ?? ""}
                  onChange={(e) =>
                    setEdiciones((prev) => ({
                      ...prev,
                      [r.id]: { ...prev[r.id], ingreso: e.target.value },
                    }))
                  }
                  className={clasesInputChico}
                />
              </div>
              <div>
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Salida
                </label>
                <input
                  type="time"
                  value={ediciones[r.id]?.salida ?? ""}
                  onChange={(e) =>
                    setEdiciones((prev) => ({
                      ...prev,
                      [r.id]: { ...prev[r.id], salida: e.target.value },
                    }))
                  }
                  className={clasesInputChico}
                />
              </div>
              <button
                type="button"
                onClick={() => handleGuardar(r.id)}
                disabled={guardandoId === r.id}
                className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
              >
                {guardandoId === r.id ? "..." : "Guardar"}
              </button>
              <BotonEliminar
                onClick={() => handleEliminar(r.id, r.fecha)}
                cargando={eliminandoId === r.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeccionReportes() {
  const [usuarios, setUsuarios] = useState<UsuarioBasicoRegistro[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [reportes, setReportes] = useState<ReporteCorregible[]>([]);
  const [ediciones, setEdiciones] = useState<Record<string, { observacion: string; actividad: string }>>(
    {}
  );
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosBasicos().then(setUsuarios).catch(() => {});
  }, []);

  function cargar() {
    if (!usuarioId) {
      setReportes([]);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerReportesParaCorregir(usuarioId, desde, hasta)
      .then((filas) => {
        setReportes(filas);
        const iniciales: Record<string, { observacion: string; actividad: string }> = {};
        filas.forEach((r) => {
          iniciales[r.id] = { observacion: r.observacion, actividad: r.actividad ?? "" };
        });
        setEdiciones(iniciales);
      })
      .catch((e) => setError(e.message || "Error al cargar los reportes."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [usuarioId, desde, hasta]);

  async function handleGuardar(id: string) {
    setGuardandoId(id);
    setError(null);
    const edicion = ediciones[id];
    const resultado = await actualizarReporteRegistro(
      id,
      edicion?.observacion ?? "",
      edicion?.actividad ?? ""
    );
    setGuardandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo guardar.");
  }

  async function handleEliminar(id: string, tienda: string, fecha: string) {
    if (
      !window.confirm(
        `¿Eliminar el reporte de ${tienda} del ${formatearFechaLegible(fecha)}? No se puede deshacer.`
      )
    )
      return;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarReporteRegistro(id);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
        REPORTES DE BITÁCORA
      </h4>
      <p className="text-marca-tenue text-[11px] mb-3">
        Corrige la observación/actividad de un reporte, o elimínalo si fue una prueba.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Persona
          </label>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={clasesInput}>
            <option value="">Selecciona...</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.rol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className={clasesInput}
          />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className={clasesInput}
          />
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>}

      {!cargando && usuarioId && reportes.length === 0 && (
        <p className="text-marca-tenue text-sm italic">Sin reportes en ese rango.</p>
      )}
      {!usuarioId && <p className="text-marca-tenue text-sm italic">Selecciona una persona.</p>}

      {!cargando && reportes.length > 0 && (
        <div className="space-y-3">
          {reportes.map((r) => (
            <div key={r.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-marca-textofuerte text-xs font-bold capitalize">
                  {r.tiendaNombre} · {formatearFechaLegible(r.fecha)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGuardar(r.id)}
                    disabled={guardandoId === r.id}
                    className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-1.5 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                  >
                    {guardandoId === r.id ? "..." : "Guardar"}
                  </button>
                  <BotonEliminar
                    onClick={() => handleEliminar(r.id, r.tiendaNombre, r.fecha)}
                    cargando={eliminandoId === r.id}
                  />
                </div>
              </div>
              <textarea
                value={ediciones[r.id]?.observacion ?? ""}
                onChange={(e) =>
                  setEdiciones((prev) => ({
                    ...prev,
                    [r.id]: { ...prev[r.id], observacion: e.target.value },
                  }))
                }
                rows={2}
                className={clasesInput}
                placeholder="Observación"
              />
              <input
                value={ediciones[r.id]?.actividad ?? ""}
                onChange={(e) =>
                  setEdiciones((prev) => ({
                    ...prev,
                    [r.id]: { ...prev[r.id], actividad: e.target.value },
                  }))
                }
                className={clasesInput}
                placeholder="Actividad (opcional)"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeccionAsignacionesEspeciales() {
  const [filas, setFilas] = useState<AsignacionEspecialCorregible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerAsignacionesEspecialesParaCorregir()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar las asignaciones especiales."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleEliminar(id: string, etiqueta: string) {
    if (!window.confirm(`¿Eliminar "${etiqueta}"? No se puede deshacer.`)) return;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarAsignacionEspecialRegistro(id);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  if (cargando) {
    return (
      <p className="text-marca-tenue text-sm animate-pulse">Cargando asignaciones especiales...</p>
    );
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
        ASIGNACIONES ESPECIALES
      </h4>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay asignaciones especiales registradas.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between flex-wrap gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div>
                <p className="text-marca-textofuerte font-bold text-sm">
                  {f.usuarioNombre} — {f.tipo}
                </p>
                <p className="text-marca-tenue text-[11px] font-data">
                  {formatearFechaLegible(f.fechaInicio)} → {formatearFechaLegible(f.fechaFin)}
                  {f.motivo ? ` · ${f.motivo}` : ""}
                </p>
              </div>
              <BotonEliminar
                onClick={() => handleEliminar(f.id, `${f.tipo} de ${f.usuarioNombre}`)}
                cargando={eliminandoId === f.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeccionComunicados() {
  const [filas, setFilas] = useState<ComunicadoCorregible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerComunicadosParaCorregir()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar los comunicados."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleEliminar(id: string, tipo: string) {
    if (!window.confirm(`¿Eliminar el comunicado "${tipo}"? No se puede deshacer.`)) return;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarComunicado(id);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando comunicados...</p>;
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3">COMUNICADOS</h4>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay comunicados publicados.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between flex-wrap gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div className="min-w-0">
                <p className="text-marca-textofuerte font-bold text-sm">{c.tipo}</p>
                <p className="text-marca-tenue text-[11px] mt-0.5 truncate">{c.mensaje}</p>
                <p className="text-marca-tenue text-[11px] font-data mt-0.5">
                  {formatearFechaLegible(c.fecha)}
                  {c.autor ? ` · ${c.autor}` : ""}
                </p>
              </div>
              <BotonEliminar
                onClick={() => handleEliminar(c.id, c.tipo)}
                cargando={eliminandoId === c.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeccionUbicacionTiendas() {
  const [tiendas, setTiendas] = useState<TiendaUbicacion[]>([]);
  const [ediciones, setEdiciones] = useState<Record<string, { lat: string; lon: string }>>({});
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerTiendasConUbicacion()
      .then((filas) => {
        setTiendas(filas);
        const iniciales: Record<string, { lat: string; lon: string }> = {};
        filas.forEach((t) => {
          iniciales[t.id] = { lat: t.lat?.toString() ?? "", lon: t.lon?.toString() ?? "" };
        });
        setEdiciones(iniciales);
      })
      .catch((e) => setError(e.message || "Error al cargar las tiendas."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleGuardar(id: string) {
    setGuardandoId(id);
    setError(null);
    setMensajes((prev) => ({ ...prev, [id]: "" }));
    const edicion = ediciones[id];
    const lat = edicion?.lat.trim() ? Number(edicion.lat) : null;
    const lon = edicion?.lon.trim() ? Number(edicion.lon) : null;
    const resultado = await actualizarUbicacionTienda(id, lat, lon);
    setGuardandoId(null);
    if (resultado.exito) setMensajes((prev) => ({ ...prev, [id]: "Guardado." }));
    else setError(resultado.mensaje || "No se pudo guardar.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tiendas...</p>;
  }

  const sinUbicacion = tiendas.filter((t) => t.lat === null);
  const conUbicacion = tiendas.filter((t) => t.lat !== null);

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
        ⛅ UBICACIÓN DE TIENDAS (CLIMA)
      </h4>
      <p className="text-marca-tenue text-[11px] mb-3">
        Guarda la latitud/longitud de cada tienda para que aparezca el pronóstico del clima en la
        Bitácora, el Resumen del Día y las rutas asignadas. Búscalas en Google Maps: clic derecho
        sobre el punto exacto → copiar las coordenadas. Mientras una tienda no tenga ubicación, no
        se muestra clima para ella — no afecta nada más.
      </p>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}

      {sinUbicacion.length > 0 && (
        <p className="text-[11px] text-marca-tenue mb-3">
          Sin ubicación aún:{" "}
          <span className="text-marca-textofuerte font-bold">
            {sinUbicacion.map((t) => t.nombre).join(", ")}
          </span>
        </p>
      )}

      <div className="space-y-2">
        {[...conUbicacion, ...sinUbicacion].map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-end gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
          >
            <div className="text-marca-textofuerte text-xs font-bold min-w-[130px]">{t.nombre}</div>
            <div>
              <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                Latitud
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={ediciones[t.id]?.lat ?? ""}
                onChange={(e) =>
                  setEdiciones((prev) => ({ ...prev, [t.id]: { ...prev[t.id], lat: e.target.value } }))
                }
                placeholder="-12.1080"
                className={`${clasesInputChico} w-32`}
              />
            </div>
            <div>
              <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                Longitud
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={ediciones[t.id]?.lon ?? ""}
                onChange={(e) =>
                  setEdiciones((prev) => ({ ...prev, [t.id]: { ...prev[t.id], lon: e.target.value } }))
                }
                placeholder="-77.0000"
                className={`${clasesInputChico} w-32`}
              />
            </div>
            <button
              type="button"
              onClick={() => handleGuardar(t.id)}
              disabled={guardandoId === t.id}
              className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
            >
              {guardandoId === t.id ? "..." : "Guardar"}
            </button>
            {mensajes[t.id] && <span className="text-emerald-400 text-[11px] font-bold">{mensajes[t.id]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MantenimientoDatos() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
          🛠 MANTENIMIENTO DE DATOS
        </h3>
        <p className="text-marca-tenue text-[11px]">
          Corrige marcaciones mal registradas o elimina información cargada de prueba. Estas
          acciones no se pueden deshacer.
        </p>
      </div>
      <SeccionUbicacionTiendas />
      <SeccionAsistencia />
      <SeccionReportes />
      <SeccionAsignacionesEspeciales />
      <SeccionComunicados />
    </div>
  );
}
