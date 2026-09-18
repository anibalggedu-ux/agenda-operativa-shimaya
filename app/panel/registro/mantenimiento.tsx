"use client";

import { useEffect, useState } from "react";
import { CloudSun, Home, Timer, FileText, TreePalm, Megaphone, Store, Search, ClipboardList, Car, MapPin } from "lucide-react";
import {
  obtenerUsuariosBasicos,
  obtenerAsistenciaParaCorregir,
  actualizarAsistencia,
  eliminarAsistencia,
  obtenerReportesParaCorregir,
  actualizarReporteRegistro,
  eliminarReporteRegistro,
  obtenerMarcacionesTiendaParaCorregir,
  liberarMarcacionTienda,
  obtenerAsignacionesEspecialesParaCorregir,
  eliminarAsignacionEspecialRegistro,
  obtenerComunicadosParaCorregir,
  eliminarComunicado,
  obtenerAuditoriasParaCorregir,
  eliminarAuditoriaRegistro,
  obtenerChecklistsVisitaParaCorregir,
  eliminarChecklistVisitaRegistro,
  crearTienda,
  obtenerTiendasConUbicacion,
  actualizarUbicacionTienda,
  actualizarNombreTienda,
  eliminarTienda,
  actualizarEsProvincia,
  geocodificarUbicacionTienda,
  obtenerColaboradoresConDireccion,
  geocodificarDireccionColaborador,
  type UsuarioBasicoRegistro,
  type AsistenciaCorregible,
  type ReporteCorregible,
  type MarcacionTiendaCorregible,
  type AsignacionEspecialCorregible,
  type ComunicadoCorregible,
  type AuditoriaCorregible,
  type ChecklistVisitaCorregible,
  type TiendaUbicacion,
  type ColaboradorDireccion,
} from "./actions";
import { hoyPeru, sumarDias, formatearFechaLegible } from "@/lib/fechas";
import SeccionColapsable from "../seccion-colapsable";
import KilometrosVista from "../kilometros-vista";

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
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosBasicos()
      .then(setUsuarios)
      .catch((e) => setError(e.message || "No se pudo cargar la lista de personas."));
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
      edicion?.salida ? `${edicion.salida}:00` : null,
      motivos[id]
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
    const resultado = await eliminarAsistencia(id, motivos[id]);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  return (
    <>
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
              <div className="min-w-[160px] flex-1">
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={motivos[r.id] ?? ""}
                  onChange={(e) => setMotivos((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Ej. Olvidó marcar, se corrige con su hora real"
                  className={clasesInputChico + " w-full"}
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
    </>
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
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosBasicos()
      .then(setUsuarios)
      .catch((e) => setError(e.message || "No se pudo cargar la lista de personas."));
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
      edicion?.actividad ?? "",
      motivos[id]
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
    const resultado = await eliminarReporteRegistro(id, motivos[id]);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  return (
    <>
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
              <input
                value={motivos[r.id] ?? ""}
                onChange={(e) => setMotivos((prev) => ({ ...prev, [r.id]: e.target.value }))}
                className={clasesInput}
                placeholder="Motivo del cambio (opcional)"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Distinta de SeccionAsistencia: esa corrige el ingreso/salida GENERAL del
// día; esta libera la marcación de llegada/salida a UNA tienda puntual (con
// su foto), sin borrar la asignación ni el reporte con su observación --
// para cuando alguien marcó la tienda equivocada (ej. debía haber usado la
// tarjeta de "Eventos de hoy" en vez de su tienda asignada).
function SeccionMarcacionesTienda() {
  const [usuarios, setUsuarios] = useState<UsuarioBasicoRegistro[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [marcaciones, setMarcaciones] = useState<MarcacionTiendaCorregible[]>([]);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [liberandoClave, setLiberandoClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerUsuariosBasicos()
      .then(setUsuarios)
      .catch((e) => setError(e.message || "No se pudo cargar la lista de personas."));
  }, []);

  function cargar() {
    if (!usuarioId) {
      setMarcaciones([]);
      return;
    }
    setCargando(true);
    setError(null);
    obtenerMarcacionesTiendaParaCorregir(usuarioId, desde, hasta)
      .then(setMarcaciones)
      .catch((e) => setError(e.message || "Error al cargar las marcaciones."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [usuarioId, desde, hasta]);

  async function handleLiberar(m: MarcacionTiendaCorregible, parte: "llegada" | "salida") {
    const etiquetaParte = parte === "llegada" ? "llegada" : "salida";
    if (
      !window.confirm(
        `¿Liberar la marcación de ${etiquetaParte} en ${m.tiendaNombre} del ${formatearFechaLegible(
          m.fecha
        )}? La foto de esa marcación se pierde; la ${
          m.estado === "Reportado" ? "observación del reporte" : "asignación"
        } no se toca.`
      )
    )
      return;
    const clave = `${m.id}-${parte}`;
    setLiberandoClave(clave);
    setError(null);
    const resultado = await liberarMarcacionTienda(m.tabla, m.id, parte, motivos[m.id]);
    setLiberandoClave(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo liberar la marcación.");
  }

  return (
    <>
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

      {!cargando && usuarioId && marcaciones.length === 0 && (
        <p className="text-marca-tenue text-sm italic">Sin marcaciones de tienda en ese rango.</p>
      )}
      {!usuarioId && <p className="text-marca-tenue text-sm italic">Selecciona una persona.</p>}

      {!cargando && marcaciones.length > 0 && (
        <div className="space-y-2">
          {marcaciones.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-end gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div className="min-w-[160px]">
                <p className="text-marca-textofuerte text-xs font-bold capitalize">
                  {m.tiendaNombre} · {formatearFechaLegible(m.fecha)}
                </p>
                <p className="text-marca-tenue text-[10px] uppercase">{m.estado}</p>
              </div>
              {m.horaLlegada && (
                <button
                  type="button"
                  onClick={() => handleLiberar(m, "llegada")}
                  disabled={liberandoClave === `${m.id}-llegada`}
                  className="border border-marca-rojo/40 text-marca-rojoclaro hover:bg-marca-rojo/10 disabled:opacity-50 font-black py-1.5 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                >
                  {liberandoClave === `${m.id}-llegada` ? "..." : `Liberar llegada (${m.horaLlegada.slice(0, 5)})`}
                </button>
              )}
              {m.horaSalida && (
                <button
                  type="button"
                  onClick={() => handleLiberar(m, "salida")}
                  disabled={liberandoClave === `${m.id}-salida`}
                  className="border border-marca-rojo/40 text-marca-rojoclaro hover:bg-marca-rojo/10 disabled:opacity-50 font-black py-1.5 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
                >
                  {liberandoClave === `${m.id}-salida` ? "..." : `Liberar salida (${m.horaSalida.slice(0, 5)})`}
                </button>
              )}
              <div className="min-w-[160px] flex-1">
                <input
                  type="text"
                  value={motivos[m.id] ?? ""}
                  onChange={(e) => setMotivos((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="Motivo (opcional)"
                  className={clasesInputChico + " w-full"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
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
    const motivo = window.prompt("Motivo (opcional):") ?? undefined;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarAsignacionEspecialRegistro(id, motivo);
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
    <>
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
    </>
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
    const motivo = window.prompt("Motivo (opcional):") ?? undefined;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarComunicado(id, motivo);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando comunicados...</p>;
  }

  return (
    <>
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
    </>
  );
}

function SeccionAuditorias() {
  const [filas, setFilas] = useState<AuditoriaCorregible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerAuditoriasParaCorregir()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar las auditorías."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleEliminar(id: string, etiqueta: string) {
    if (!window.confirm(`¿Eliminar la auditoría "${etiqueta}"? No se puede deshacer.`)) return;
    const motivo = window.prompt("Motivo (opcional):") ?? undefined;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarAuditoriaRegistro(id, motivo);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando auditorías...</p>;
  }

  return (
    <>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay auditorías registradas.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between flex-wrap gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div>
                <p className="text-marca-textofuerte font-bold text-sm">
                  {f.tiendaNombre} — {f.supervisorNombre}
                </p>
                <p className="text-marca-tenue text-[11px] font-data">
                  {formatearFechaLegible(f.fecha)} · {f.porcentaje}% · {f.clasificacion}
                </p>
              </div>
              <BotonEliminar
                onClick={() => handleEliminar(f.id, `${f.tiendaNombre} — ${f.supervisorNombre}`)}
                cargando={eliminandoId === f.id}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SeccionChecklistsVisita() {
  const [filas, setFilas] = useState<ChecklistVisitaCorregible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerChecklistsVisitaParaCorregir()
      .then(setFilas)
      .catch((e) => setError(e.message || "Error al cargar los checklists."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleEliminar(id: string, etiqueta: string) {
    if (!window.confirm(`¿Eliminar el checklist "${etiqueta}"? No se puede deshacer.`)) return;
    const motivo = window.prompt("Motivo (opcional):") ?? undefined;
    setEliminandoId(id);
    setError(null);
    const resultado = await eliminarChecklistVisitaRegistro(id, motivo);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setError(resultado.mensaje || "No se pudo eliminar.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando checklists...</p>;
  }

  return (
    <>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay checklists de visita registrados.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between flex-wrap gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
            >
              <div>
                <p className="text-marca-textofuerte font-bold text-sm">
                  {f.tiendaNombre} — {f.usuarioNombre}
                </p>
                <p className="text-marca-tenue text-[11px] font-data">
                  {formatearFechaLegible(f.fecha)}
                  {f.porcentaje !== null ? ` · ${f.porcentaje}% · ${f.clasificacion}` : ""}
                </p>
              </div>
              <BotonEliminar
                onClick={() => handleEliminar(f.id, `${f.tiendaNombre} — ${f.usuarioNombre}`)}
                cargando={eliminandoId === f.id}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function NuevaTienda({ onCreada }: { onCreada: () => void }) {
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);

  async function handleCrear() {
    if (!nombre.trim()) {
      setMensaje({ texto: "Escribe el nombre de la tienda.", exito: false });
      return;
    }
    setCreando(true);
    setMensaje(null);
    const resultado = await crearTienda(nombre, direccion);
    setCreando(false);
    setMensaje({ texto: resultado.mensaje || "", exito: resultado.exito });
    if (resultado.exito) {
      setNombre("");
      setDireccion("");
      onCreada();
    }
  }

  return (
    <div className="bg-marca-fondo border border-marca-rojo/30 rounded-[3px] p-3 mb-3">
      <p className="text-marca-tenue text-[10px] uppercase font-bold mb-2">+ Nueva tienda</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. CENTRO DE DISTRIBUCION"
            className={clasesInputChico + " w-full"}
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Dirección (opcional)
          </label>
          <input
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Ej. Gamma 219, Callao"
            className={clasesInputChico + " w-full"}
          />
        </div>
        <button
          type="button"
          onClick={handleCrear}
          disabled={creando}
          className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
        >
          {creando ? "Creando..." : "Crear tienda"}
        </button>
      </div>
      {mensaje && (
        <p className={`text-[11px] font-bold mt-2 ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

function SeccionUbicacionTiendas() {
  const [tiendas, setTiendas] = useState<TiendaUbicacion[]>([]);
  const [direcciones, setDirecciones] = useState<Record<string, string>>({});
  const [manuales, setManuales] = useState<Record<string, { lat: string; lon: string }>>({});
  const [cargando, setCargando] = useState(true);
  const [buscandoId, setBuscandoId] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});

  function cargar() {
    setCargando(true);
    obtenerTiendasConUbicacion()
      .then((filas) => {
        setTiendas(filas);
        const dir: Record<string, string> = {};
        const man: Record<string, { lat: string; lon: string }> = {};
        filas.forEach((t) => {
          dir[t.id] = t.direccion ?? "";
          man[t.id] = { lat: t.lat?.toString() ?? "", lon: t.lon?.toString() ?? "" };
        });
        setDirecciones(dir);
        setManuales(man);
      })
      .catch((e) => setErrores({ _global: e.message || "Error al cargar las tiendas." }))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleBuscar(id: string) {
    setBuscandoId(id);
    setErrores((prev) => ({ ...prev, [id]: "" }));
    setMensajes((prev) => ({ ...prev, [id]: "" }));
    const resultado = await geocodificarUbicacionTienda(id, direcciones[id] ?? "");
    setBuscandoId(null);
    if (resultado.exito) {
      setMensajes((prev) => ({ ...prev, [id]: `Encontrada: ${resultado.direccionEncontrada}` }));
      setManuales((prev) => ({
        ...prev,
        [id]: { lat: resultado.lat?.toString() ?? "", lon: resultado.lon?.toString() ?? "" },
      }));
    } else {
      setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo buscar." }));
    }
  }

  async function handleGuardarManual(id: string) {
    setGuardandoId(id);
    setErrores((prev) => ({ ...prev, [id]: "" }));
    setMensajes((prev) => ({ ...prev, [id]: "" }));
    const edicion = manuales[id];
    const lat = edicion?.lat.trim() ? Number(edicion.lat) : null;
    const lon = edicion?.lon.trim() ? Number(edicion.lon) : null;
    const resultado = await actualizarUbicacionTienda(id, lat, lon);
    setGuardandoId(null);
    if (resultado.exito) setMensajes((prev) => ({ ...prev, [id]: "Guardado." }));
    else setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo guardar." }));
  }

  async function handleToggleProvincia(id: string, valorActual: boolean) {
    setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, esProvincia: !valorActual } : t)));
    const resultado = await actualizarEsProvincia(id, !valorActual);
    if (!resultado.exito) {
      setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, esProvincia: valorActual } : t)));
      setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo guardar." }));
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tiendas...</p>;
  }

  const sinUbicacion = tiendas.filter((t) => t.lat === null);
  const conUbicacion = tiendas.filter((t) => t.lat !== null);

  return (
    <>
      <NuevaTienda onCreada={cargar} />

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
          <div key={t.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3 space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-marca-textofuerte text-xs font-bold min-w-[130px]">{t.nombre}</div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Dirección exacta
                </label>
                <input
                  type="text"
                  value={direcciones[t.id] ?? ""}
                  onChange={(e) => setDirecciones((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  placeholder="Ej. Av. Aviación 2405, San Borja"
                  className={clasesInputChico + " w-full"}
                />
              </div>
              <button
                type="button"
                onClick={() => handleBuscar(t.id)}
                disabled={buscandoId === t.id}
                className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
              >
                {buscandoId === t.id ? "Buscando..." : "Buscar"}
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Latitud (manual)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manuales[t.id]?.lat ?? ""}
                  onChange={(e) =>
                    setManuales((prev) => ({ ...prev, [t.id]: { ...prev[t.id], lat: e.target.value } }))
                  }
                  placeholder="-12.1080"
                  className={`${clasesInputChico} w-32`}
                />
              </div>
              <div>
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Longitud (manual)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manuales[t.id]?.lon ?? ""}
                  onChange={(e) =>
                    setManuales((prev) => ({ ...prev, [t.id]: { ...prev[t.id], lon: e.target.value } }))
                  }
                  placeholder="-77.0000"
                  className={`${clasesInputChico} w-32`}
                />
              </div>
              <button
                type="button"
                onClick={() => handleGuardarManual(t.id)}
                disabled={guardandoId === t.id}
                className="border border-marca-borde text-marca-tenue hover:text-marca-texto disabled:opacity-50 font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
              >
                {guardandoId === t.id ? "..." : "Guardar manual"}
              </button>
              {mensajes[t.id] && <span className="text-emerald-400 text-[11px] font-bold">{mensajes[t.id]}</span>}
              {errores[t.id] && <span className="text-marca-rojoclaro text-[11px] font-bold">{errores[t.id]}</span>}
            </div>

            <label className="flex items-center gap-2 text-[11px] text-marca-tenue cursor-pointer pt-1 border-t border-marca-borde/60">
              <input
                type="checkbox"
                checked={t.esProvincia}
                onChange={() => handleToggleProvincia(t.id, t.esProvincia)}
                className="accent-marca-rojo"
              />
              <span>
                🏆 Es de provincia (viaje aéreo — no calcular km real, 1 km fijo por visita, suma copa en la
                vitrina de trofeos)
              </span>
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

function SeccionDireccionColaboradores() {
  const [filas, setFilas] = useState<ColaboradorDireccion[]>([]);
  const [direcciones, setDirecciones] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [buscandoId, setBuscandoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});

  function cargar() {
    setCargando(true);
    obtenerColaboradoresConDireccion()
      .then((datos) => {
        setFilas(datos);
        const dir: Record<string, string> = {};
        datos.forEach((c) => (dir[c.id] = c.direccion ?? ""));
        setDirecciones(dir);
      })
      .catch((e) => setErrores({ _global: e.message || "Error al cargar los colaboradores." }))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleBuscar(id: string) {
    setBuscandoId(id);
    setErrores((prev) => ({ ...prev, [id]: "" }));
    setMensajes((prev) => ({ ...prev, [id]: "" }));
    const resultado = await geocodificarDireccionColaborador(id, direcciones[id] ?? "");
    setBuscandoId(null);
    if (resultado.exito) {
      setMensajes((prev) => ({ ...prev, [id]: `Guardada: ${resultado.direccionEncontrada}` }));
      setFilas((prev) =>
        prev.map((c) => (c.id === id ? { ...c, lat: resultado.lat ?? null, lon: resultado.lon ?? null } : c))
      );
    } else {
      setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo buscar." }));
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando colaboradores...</p>;
  }

  return (
    <>
      {errores._global && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{errores._global}</p>}

      <div className="space-y-2">
        {filas.map((c) => (
          <div key={c.id} className="flex flex-wrap items-end gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] p-3">
            <div className="min-w-[150px]">
              <p className="text-marca-textofuerte text-xs font-bold">{c.nombre}</p>
              <p className="text-marca-tenue text-[10px] uppercase">{c.rol}</p>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                Dirección de vivienda
              </label>
              <input
                type="text"
                value={direcciones[c.id] ?? ""}
                onChange={(e) => setDirecciones((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Ej. Jr. Las Camelias 320, Los Olivos"
                className={clasesInputChico + " w-full"}
              />
            </div>
            <button
              type="button"
              onClick={() => handleBuscar(c.id)}
              disabled={buscandoId === c.id}
              className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
            >
              {buscandoId === c.id ? "Buscando..." : "Buscar y guardar"}
            </button>
            {c.lat !== null && !mensajes[c.id] && (
              <span className="text-marca-tenue text-[11px]">Ya tiene ubicación guardada</span>
            )}
            {mensajes[c.id] && <span className="text-emerald-400 text-[11px] font-bold">{mensajes[c.id]}</span>}
            {errores[c.id] && <span className="text-marca-rojoclaro text-[11px] font-bold">{errores[c.id]}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function SeccionTiendas() {
  const [tiendas, setTiendas] = useState<TiendaUbicacion[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});

  function cargar() {
    setCargando(true);
    obtenerTiendasConUbicacion()
      .then((filas) => {
        setTiendas(filas);
        const n: Record<string, string> = {};
        filas.forEach((t) => (n[t.id] = t.nombre));
        setNombres(n);
      })
      .catch((e) => setErrores({ _global: e.message || "Error al cargar las tiendas." }))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleRenombrar(id: string) {
    setGuardandoId(id);
    setErrores((prev) => ({ ...prev, [id]: "" }));
    setMensajes((prev) => ({ ...prev, [id]: "" }));
    const resultado = await actualizarNombreTienda(id, nombres[id] ?? "");
    setGuardandoId(null);
    if (resultado.exito) {
      setMensajes((prev) => ({ ...prev, [id]: "Renombrada." }));
      cargar();
    } else {
      setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo renombrar." }));
    }
  }

  async function handleEliminar(id: string, nombre: string) {
    if (
      !window.confirm(
        `¿Eliminar la tienda "${nombre}"? Solo funciona si nunca tuvo reportes, rutas ni auditorías. No se puede deshacer.`
      )
    )
      return;
    setEliminandoId(id);
    setErrores((prev) => ({ ...prev, [id]: "" }));
    const resultado = await eliminarTienda(id);
    setEliminandoId(null);
    if (resultado.exito) cargar();
    else setErrores((prev) => ({ ...prev, [id]: resultado.mensaje || "No se pudo eliminar." }));
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tiendas...</p>;
  }

  return (
    <>
      {errores._global && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{errores._global}</p>}
      <div className="space-y-2">
        {tiendas.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-end gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
          >
            <div className="flex-1 min-w-[180px]">
              <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Nombre</label>
              <input
                value={nombres[t.id] ?? ""}
                onChange={(e) => setNombres((prev) => ({ ...prev, [t.id]: e.target.value }))}
                className={clasesInputChico + " w-full"}
              />
            </div>
            <button
              type="button"
              onClick={() => handleRenombrar(t.id)}
              disabled={guardandoId === t.id}
              className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-3 rounded-[3px] text-[10px] tracking-widest uppercase transition"
            >
              {guardandoId === t.id ? "..." : "Guardar"}
            </button>
            <BotonEliminar onClick={() => handleEliminar(t.id, t.nombre)} cargando={eliminandoId === t.id} />
            {mensajes[t.id] && <span className="text-emerald-400 text-[11px] font-bold">{mensajes[t.id]}</span>}
            {errores[t.id] && (
              <span className="text-marca-rojoclaro text-[11px] font-bold w-full">{errores[t.id]}</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function SeccionKilometros() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -30));
  const [hasta, setHasta] = useState(hoyPeru());

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
      <KilometrosVista desde={desde} hasta={hasta} mostrarDetalle />
    </div>
  );
}

export function BloqueUbicacionTiendas() {
  return (
    <SeccionColapsable
      titulo="Ubicación de tiendas (clima)"
      icono={<CloudSun />}
      descripcion="Dirección/coordenadas por tienda para que aparezca el pronóstico del clima."
    >
      <SeccionUbicacionTiendas />
    </SeccionColapsable>
  );
}

export function BloqueDireccionColaboradores() {
  return (
    <SeccionColapsable
      titulo="Dirección de colaboradores"
      icono={<Home />}
      descripcion="Dirección de vivienda de cada colaborador, para el futuro contador de kilómetros."
    >
      <SeccionDireccionColaboradores />
    </SeccionColapsable>
  );
}

export function BloqueAsistencia() {
  return (
    <SeccionColapsable
      titulo="Asistencia (marcaciones GPS)"
      icono={<Timer />}
      descripcion="Corrige la hora de ingreso/salida, o elimina el registro si fue una prueba."
    >
      <SeccionAsistencia />
    </SeccionColapsable>
  );
}

export function BloqueReportes() {
  return (
    <SeccionColapsable
      titulo="Reportes de bitácora"
      icono={<FileText />}
      descripcion="Corrige la observación/actividad de un reporte, o elimínalo."
    >
      <SeccionReportes />
    </SeccionColapsable>
  );
}

export function BloqueMarcacionesTienda() {
  return (
    <SeccionColapsable
      titulo="Marcaciones de llegada/salida a tienda"
      icono={<MapPin />}
      descripcion="Libera la marcación (con foto) de una tienda puntual, sin borrar la asignación ni el reporte — para cuando se marcó la tienda equivocada."
    >
      <SeccionMarcacionesTienda />
    </SeccionColapsable>
  );
}

export function BloqueAsignacionesEspeciales() {
  return (
    <SeccionColapsable
      titulo="Asignaciones especiales"
      icono={<TreePalm />}
      descripcion="Elimina asignaciones especiales cargadas de prueba."
    >
      <SeccionAsignacionesEspeciales />
    </SeccionColapsable>
  );
}

export function BloqueComunicados() {
  return (
    <SeccionColapsable titulo="Comunicados" icono={<Megaphone />} descripcion="Elimina publicaciones de prueba.">
      <SeccionComunicados />
    </SeccionColapsable>
  );
}

export function BloqueTiendas() {
  return (
    <SeccionColapsable
      titulo="Tiendas (nombre)"
      icono={<Store />}
      descripcion="Corrige el nombre de una tienda, o elimina una que nunca se usó."
    >
      <SeccionTiendas />
    </SeccionColapsable>
  );
}

export function BloqueAuditorias() {
  return (
    <SeccionColapsable
      titulo="Auditorías"
      icono={<Search />}
      descripcion="Elimina auditorías cargadas de prueba."
    >
      <SeccionAuditorias />
    </SeccionColapsable>
  );
}

export function BloqueChecklistsVisita() {
  return (
    <SeccionColapsable
      titulo="Checklists de rutina de visita"
      icono={<ClipboardList />}
      descripcion="Elimina checklists de rutina de visita cargados de prueba."
    >
      <SeccionChecklistsVisita />
    </SeccionColapsable>
  );
}

export function BloqueKilometros() {
  return (
    <SeccionColapsable
      titulo="Kilómetros recorridos"
      icono={<Car />}
      descripcion="Distancia y tiempo real por calles entre cada colaborador y las tiendas que visitó, por trayecto — útil para reembolsos de movilidad."
    >
      <SeccionKilometros />
    </SeccionColapsable>
  );
}
