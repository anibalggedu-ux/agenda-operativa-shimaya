"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, MapPin, TreePalm, Megaphone, Flame, Check, Pencil, Calendar, CircleCheck, Clock, Navigation } from "lucide-react";
import {
  obtenerResumenPersonal,
  obtenerResumenOperativo,
  marcarAlertaAtendida,
  type ResumenPersonal,
  type ResumenOperativo,
} from "./resumen-dia-actions";
import { formatearFechaLegible, formatearHora } from "@/lib/fechas";
import type { AlertaPuntualidad } from "@/lib/puntualidad";

// Arma las frases de alerta de puntualidad de una persona — puede haber más
// de una a la vez (ej. llegó tarde hoy Y además lleva racha).
function mensajesAlertaPuntualidad(a: AlertaPuntualidad): string[] {
  const mensajes: string[] = [];
  if (a.estadoHoy === "pendiente_tarde") {
    mensajes.push("Todavía no marca su llegada hoy y ya pasó su hora límite.");
  } else if (a.estadoHoy === "tarde" && a.horaIngresoHoy) {
    mensajes.push(`Hoy llegó tarde — marcó a las ${formatearHora(a.horaIngresoHoy)}.`);
  }
  if (a.rachaTardanzas >= 2) {
    mensajes.push(`Lleva ${a.rachaTardanzas} días seguidos llegando tarde o sin marcar entrada.`);
  }
  if (a.rachaSinSalida >= 1 && a.fechaSinSalida) {
    mensajes.push(
      a.rachaSinSalida === 1
        ? `No registró su salida el ${formatearFechaLegible(a.fechaSinSalida)}.`
        : `No registra su salida desde hace ${a.rachaSinSalida} días (${formatearFechaLegible(a.fechaSinSalida)}).`
    );
  }
  return mensajes;
}

function Tarjeta({
  icono,
  etiqueta,
  valor,
  extra,
  valorClase,
  destacada,
  expandible,
  abierta,
  onClick,
}: {
  icono: ReactNode;
  etiqueta: string;
  valor: string;
  extra?: string;
  valorClase?: string;
  destacada?: boolean;
  // Cuadros con más detalle atrás (ej. la lista completa de tiendas, no solo
  // las primeras 2) se pueden tocar para desplegarlo debajo del grid.
  expandible?: boolean;
  abierta?: boolean;
  onClick?: () => void;
}) {
  const Contenedor = expandible ? "button" : "div";
  return (
    <Contenedor
      type={expandible ? "button" : undefined}
      onClick={onClick}
      className={`rounded-[3px] p-2.5 border text-left w-full ${
        destacada ? "bg-marca-rojo/10 border-marca-rojo/40" : "bg-marca-superficie border-marca-borde"
      } ${expandible ? `transition hover:border-marca-rojo/50 ${abierta ? "ring-2 ring-marca-rojo/60" : ""}` : ""}`}
    >
      <p className="mb-1 leading-none flex items-center justify-between text-marca-rojoclaro [&>span>svg]:w-4 [&>span>svg]:h-4">
        <span>{icono}</span>
        {expandible && (
          <span className="text-marca-tenue text-[10px]">{abierta ? "▲" : "▼"}</span>
        )}
      </p>
      <p className="text-marca-tenue text-[9px] uppercase font-bold mb-0.5 leading-tight">{etiqueta}</p>
      <p className={`font-display text-base font-semibold leading-tight ${valorClase ?? "text-marca-textofuerte"}`}>
        {valor}
      </p>
      {extra && <p className="text-marca-tenue text-[9.5px] mt-0.5 leading-snug">{extra}</p>}
    </Contenedor>
  );
}

// Panel de detalle que se despliega debajo del grid cuando se toca un
// cuadro expandible — mismo lugar para los 4, para no repetir el mismo
// contenedor 4 veces.
function PanelDetalle({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="col-span-2 lg:col-span-4 bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3 flex items-center gap-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-marca-rojoclaro">
        {icono} {titulo}
      </h4>
      {children}
    </div>
  );
}

function TarjetaAncha({ icono, etiqueta, valor }: { icono: ReactNode; etiqueta: string; valor: string }) {
  return (
    <div className="col-span-2 lg:col-span-4 bg-marca-superficie border border-marca-borde rounded-[3px] p-3 flex items-center justify-between flex-wrap gap-2">
      <span className="text-marca-tenue text-[10px] uppercase font-bold flex items-center gap-2 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-marca-rojoclaro">
        {icono} {etiqueta}
      </span>
      <span className="text-marca-textofuerte font-bold text-xs sm:text-sm capitalize">{valor}</span>
    </div>
  );
}

export default function ResumenDelDia({ nombre, rol }: { nombre: string; rol: string }) {
  const esOperativo = rol === "coordinador" || rol === "gerente";
  const [personal, setPersonal] = useState<ResumenPersonal | null>(null);
  const [operativo, setOperativo] = useState<ResumenOperativo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorAtender, setErrorAtender] = useState<string | null>(null);
  type CuadroExpandible = "criticas" | "tiendasHoy" | "especiales" | "comunicados";
  const [cuadroAbierto, setCuadroAbierto] = useState<CuadroExpandible | null>(null);

  function alternarCuadro(cuadro: CuadroExpandible) {
    setCuadroAbierto((actual) => (actual === cuadro ? null : cuadro));
  }

  useEffect(() => {
    setCargando(true);
    const promesa = esOperativo ? obtenerResumenOperativo() : obtenerResumenPersonal();
    promesa
      .then((r: any) => (esOperativo ? setOperativo(r) : setPersonal(r)))
      .catch(() => {})
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esOperativo]);

  function ordenarAlertas(alertas: ResumenOperativo["alertasPuntualidad"]) {
    return [...alertas].sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "tardanza" ? -1 : 1;
      return b.severidad - a.severidad;
    });
  }

  async function handleAtenderAlerta(usuarioId: string, tipo: "tardanza" | "salida") {
    const alertaRemovida = operativo?.alertasPuntualidad.find((a) => a.usuarioId === usuarioId && a.tipo === tipo) ?? null;

    setErrorAtender(null);
    setOperativo((prev) =>
      prev
        ? { ...prev, alertasPuntualidad: prev.alertasPuntualidad.filter((a) => !(a.usuarioId === usuarioId && a.tipo === tipo)) }
        : prev
    );

    const resultado = await marcarAlertaAtendida(usuarioId, tipo).catch(() => ({
      exito: false as const,
      mensaje: "No se pudo conectar con el servidor.",
    }));

    // Si falló, se restaura la alerta — sin esto, la UI queda mostrando que
    // se atendió aunque el servidor nunca lo haya guardado.
    if (!resultado.exito && alertaRemovida) {
      setOperativo((prev) =>
        prev ? { ...prev, alertasPuntualidad: ordenarAlertas([...prev.alertasPuntualidad, alertaRemovida]) } : prev
      );
      setErrorAtender(`No se pudo marcar como atendida la alerta de ${alertaRemovida.usuarioNombre}. Intenta de nuevo.`);
    }
  }

  const primerNombre = nombre.split(" ")[0];
  const [saludo, setSaludo] = useState("Hola");
  const [fechaHoy, setFechaHoy] = useState("");

  useEffect(() => {
    const hora = new Date().getHours();
    setSaludo(hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches");
    setFechaHoy(
      new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    );
  }, []);

  if (cargando) {
    return <div className="mb-6 h-20 bg-marca-superficie border border-marca-borde rounded-[3px] animate-pulse" />;
  }

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-marca-textofuerte">
          {saludo}, <span className="text-marca-rojoclaro italic">{primerNombre}</span> 👋
        </h2>
        <p className="text-marca-tenue text-xs capitalize">{fechaHoy}</p>
      </div>

      {!esOperativo &&
        personal &&
        (() => {
          const mensajes = mensajesAlertaPuntualidad(personal.alertaPuntualidad);
          if (mensajes.length === 0) return null;
          return (
            <div className="mb-3 bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-3.5 space-y-1">
              {mensajes.map((m, i) => (
                <p key={i} className="text-marca-texto text-xs font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-marca-rojoclaro" />
                  <span>{m}</span>
                </p>
              ))}
            </div>
          );
        })()}

      {esOperativo && errorAtender && (
        <div className="mb-3 bg-amber-950/20 border border-amber-500/40 rounded-[3px] p-2.5 flex items-center justify-between gap-2">
          <p className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorAtender}
          </p>
          <button
            onClick={() => setErrorAtender(null)}
            className="shrink-0 text-[10px] font-bold text-amber-400/70 hover:text-amber-300"
          >
            Cerrar
          </button>
        </div>
      )}

      {esOperativo && operativo && operativo.alertasPuntualidad.length > 0 && (
        <div className="mb-3 bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-3.5 space-y-2">
          <p className="text-marca-tenue text-[10px] uppercase font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-marca-rojoclaro" /> Alertas de puntualidad (
            {operativo.alertasPuntualidad.length})
          </p>
          <div className="space-y-1.5">
            {operativo.alertasPuntualidad.map((a) => (
              <div
                key={`${a.usuarioId}-${a.tipo}`}
                className="flex items-start justify-between gap-2 bg-marca-fondo/40 rounded-[3px] p-2"
              >
                <p className="text-marca-texto text-xs min-w-0">
                  <span className="font-bold">{a.usuarioNombre}</span>{" "}
                  <span className="text-marca-tenue uppercase text-[10px]">({a.rol})</span> — {a.mensaje}
                </p>
                <button
                  onClick={() => handleAtenderAlerta(a.usuarioId, a.tipo)}
                  className="shrink-0 text-[10px] font-bold text-marca-tenue hover:text-emerald-400 border border-marca-borde hover:border-emerald-500/40 rounded-[3px] px-2 py-1 transition whitespace-nowrap flex items-center gap-1"
                  title="Ya tomé acción — dejar de avisar mientras no vuelva a pasar"
                >
                  <Check className="w-3 h-3" /> Atendido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {esOperativo && operativo && (
          <>
            <Tarjeta
              icono={<AlertTriangle className="w-4 h-4" />}
              etiqueta="Tiendas en acción inmediata"
              valor={String(operativo.tiendasCriticas.length)}
              valorClase={operativo.tiendasCriticas.length > 0 ? "text-marca-rojoclaro" : undefined}
              destacada={operativo.tiendasCriticas.length > 0}
              extra={
                operativo.tiendasCriticas.length > 0
                  ? operativo.tiendasCriticas
                      .slice(0, 2)
                      .map((t) => `${t.nombre} — ${t.porcentaje}%`)
                      .join(" · ")
                  : "Ninguna por ahora"
              }
              expandible={operativo.tiendasCriticas.length > 0}
              abierta={cuadroAbierto === "criticas"}
              onClick={() => alternarCuadro("criticas")}
            />
            <Tarjeta
              icono={<MapPin className="w-4 h-4" />}
              etiqueta="Tiendas de hoy"
              valor={`${operativo.reportadasHoy} / ${operativo.visitasHoy}`}
              extra={`reportadas / asignadas hoy (de ${operativo.totalTiendas})`}
              expandible={operativo.tiendasDeHoyDetalle.length > 0}
              abierta={cuadroAbierto === "tiendasHoy"}
              onClick={() => alternarCuadro("tiendasHoy")}
            />
            <Tarjeta
              icono={<TreePalm className="w-4 h-4" />}
              etiqueta="Asignación especial hoy"
              valor={String(operativo.asignacionesEspecialesHoyTotal)}
              extra={
                operativo.asignacionEspecialHoy
                  ? `${operativo.asignacionEspecialHoy.nombre} — ${operativo.asignacionEspecialHoy.tipo}`
                  : "Nadie hoy"
              }
              expandible={operativo.asignacionesEspecialesHoy.length > 0}
              abierta={cuadroAbierto === "especiales"}
              onClick={() => alternarCuadro("especiales")}
            />
            <Tarjeta
              icono={<Megaphone className="w-4 h-4" />}
              etiqueta="Comunicados (7 días)"
              valor={String(operativo.comunicadosSemana)}
              extra="enviados al equipo"
              expandible={operativo.comunicadosDetalle.length > 0}
              abierta={cuadroAbierto === "comunicados"}
              onClick={() => alternarCuadro("comunicados")}
            />
            {operativo.rachaTop && (
              <TarjetaAncha
                icono={<Flame className="w-4 h-4" />}
                etiqueta="Racha más alta del equipo"
                valor={`${operativo.rachaTop.nombre} — ${operativo.rachaTop.racha} día${
                  operativo.rachaTop.racha === 1 ? "" : "s"
                }`}
              />
            )}

            {cuadroAbierto === "criticas" && (
              <PanelDetalle icono={<AlertTriangle />} titulo="TIENDAS EN ACCIÓN INMEDIATA">
                <div className="space-y-1.5">
                  {operativo.tiendasCriticas.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-marca-fondo border border-marca-rojo/30 rounded-[3px] px-3 py-2"
                    >
                      <span className="text-marca-texto text-sm">{t.nombre}</span>
                      <span className="text-marca-rojoclaro font-black text-xs">{t.porcentaje}%</span>
                    </div>
                  ))}
                </div>
              </PanelDetalle>
            )}

            {cuadroAbierto === "tiendasHoy" && (
              <PanelDetalle icono={<MapPin />} titulo="TIENDAS CON RUTA ASIGNADA HOY">
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {operativo.tiendasDeHoyDetalle.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2"
                    >
                      <span className="text-marca-texto text-sm">{t.tiendaNombre}</span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 [&>svg]:w-3 [&>svg]:h-3 ${
                          t.reportada ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {t.reportada ? <CircleCheck /> : <Clock />} {t.reportada ? "Reportada" : "Pendiente"}
                      </span>
                    </div>
                  ))}
                </div>
              </PanelDetalle>
            )}

            {cuadroAbierto === "especiales" && (
              <PanelDetalle icono={<TreePalm />} titulo="ASIGNACIÓN ESPECIAL HOY">
                <div className="space-y-1.5">
                  {operativo.asignacionesEspecialesHoy.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2"
                    >
                      <span className="text-marca-texto text-sm">{a.nombre}</span>
                      <span className="text-marca-tenue text-[11px] uppercase">{a.tipo}</span>
                    </div>
                  ))}
                </div>
              </PanelDetalle>
            )}

            {cuadroAbierto === "comunicados" && (
              <PanelDetalle icono={<Megaphone />} titulo="COMUNICADOS (ÚLTIMOS 7 DÍAS)">
                <div className="space-y-1.5">
                  {operativo.comunicadosDetalle.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2"
                    >
                      <span className="text-marca-texto text-sm">{c.tipo}</span>
                      <span className="text-marca-tenue text-[11px] capitalize">
                        {formatearFechaLegible(c.fecha.slice(0, 10))}
                      </span>
                    </div>
                  ))}
                </div>
              </PanelDetalle>
            )}
          </>
        )}

        {!esOperativo && personal && (
          <>
            {personal.climaActual && (
              <div
                className={`rounded-[3px] p-2.5 border ${
                  personal.climaActual.riesgo
                    ? "bg-amber-950/20 border-amber-500/40"
                    : "bg-marca-superficie border-marca-borde"
                }`}
              >
                <p className="text-sm mb-1 leading-none">{personal.climaActual.icono}</p>
                <p className="text-marca-tenue text-[9px] uppercase font-bold mb-0.5 leading-tight">
                  Clima {personal.climaActual.tempActual !== null ? "ahora" : "hoy"} ·{" "}
                  {personal.climaActual.zonaNombre}
                </p>
                <p
                  className={`font-display text-base font-semibold leading-tight ${
                    personal.climaActual.riesgo ? "text-amber-400" : "text-marca-textofuerte"
                  }`}
                >
                  {personal.climaActual.tempActual !== null
                    ? `${personal.climaActual.tempActual}°C`
                    : `${personal.climaActual.tempMax}° / ${personal.climaActual.tempMin}°`}
                </p>
                <p className="text-marca-tenue text-[9.5px] mt-0.5 leading-snug">
                  {personal.climaActual.avisoTexto ?? personal.climaActual.descripcion}
                </p>
              </div>
            )}
            <div
              className={`rounded-[3px] p-2.5 border ${
                personal.rutaHoyEstado === "pendiente"
                  ? "bg-marca-rojo/10 border-marca-rojo/40"
                  : "bg-marca-superficie border-marca-borde"
              }`}
            >
              <p className="mb-1 leading-none">
                <MapPin className="w-4 h-4 text-marca-rojoclaro" />
              </p>
              <p className="text-marca-tenue text-[9px] uppercase font-bold mb-0.5 leading-tight">Tu ruta de hoy</p>
              {personal.rutaHoyNombre ? (
                <>
                  <p className="font-display text-sm font-semibold leading-tight text-marca-textofuerte">
                    {personal.rutaHoyNombre}
                  </p>
                  {personal.rutaHoyExtra > 0 && (
                    <p className="text-marca-tenue text-[9.5px]">+{personal.rutaHoyExtra} más</p>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 mt-1.5 text-[9.5px] font-bold px-2 py-0.5 rounded-full [&>svg]:w-3 [&>svg]:h-3 ${
                      personal.rutaHoyEstado === "pendiente"
                        ? "bg-amber-950/30 text-amber-400"
                        : "bg-emerald-950/30 text-emerald-400"
                    }`}
                  >
                    {personal.rutaHoyEstado === "pendiente" ? <Clock /> : <CircleCheck />}{" "}
                    {personal.rutaHoyEstado === "pendiente" ? "Pendiente" : "Reportado"}
                  </span>
                </>
              ) : (
                <p className="text-marca-tenue text-xs italic">Sin asignación</p>
              )}
            </div>
            <Tarjeta
              icono={<Pencil className="w-4 h-4" />}
              etiqueta="Reportes editables"
              valor={String(personal.reportesEditables)}
              extra="dentro de las 48h"
            />
            <Tarjeta
              icono={<Flame className="w-4 h-4" />}
              etiqueta="Racha de puntualidad"
              valor={personal.rachaActual > 0 ? `${personal.rachaActual} día${personal.rachaActual === 1 ? "" : "s"}` : "—"}
              valorClase={personal.rachaActual > 0 ? "text-emerald-400" : undefined}
              extra={personal.rachaActual > 0 ? "sigue así" : "marca a tiempo"}
            />
            <Tarjeta
              icono={<Megaphone className="w-4 h-4" />}
              etiqueta="Comunicados recientes"
              valor={String(personal.comunicadosRecientes)}
              extra={personal.ultimoComunicadoTipo ?? "sin novedades"}
            />
            {personal.rutaHoyGoogleMapsUrl && (
              <div className="col-span-2 lg:col-span-4 bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                  <Navigation className="w-4 h-4 text-marca-rojoclaro shrink-0" />
                  <p className="text-xs">
                    <span className="text-marca-tenue">Camino a </span>
                    <span className="text-marca-textofuerte font-bold">{personal.rutaHoyNombre}</span>
                    {personal.rutaHoyEtaMinutos !== null && (
                      <>
                        <span className="text-marca-tenue"> — </span>
                        <span className="font-mono text-marca-textofuerte font-semibold">
                          {personal.rutaHoyEtaMinutos} min
                        </span>
                        {personal.rutaHoyEtaKm !== null && (
                          <span className="text-marca-tenue"> · {personal.rutaHoyEtaKm} km</span>
                        )}
                        <span className="text-marca-tenue text-[10.5px]"> (tráfico en tiempo real)</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={personal.rutaHoyGoogleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 border border-marca-borde hover:border-marca-rojoclaro/50 text-marca-tenue hover:text-marca-texto text-[10.5px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-[3px] transition"
                  >
                    <MapPin className="w-3 h-3" /> Google Maps
                  </a>
                  {personal.rutaHoyWazeUrl && (
                    <a
                      href={personal.rutaHoyWazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 border border-marca-borde hover:border-marca-rojoclaro/50 text-marca-tenue hover:text-marca-texto text-[10.5px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-[3px] transition"
                    >
                      <MapPin className="w-3 h-3" /> Waze
                    </a>
                  )}
                </div>
              </div>
            )}
            {personal.proximoEvento && (
              <TarjetaAncha
                icono={<Calendar className="w-4 h-4" />}
                etiqueta="Próximo en tu calendario"
                valor={`${personal.proximoEvento.etiqueta} — ${formatearFechaLegible(personal.proximoEvento.fecha)}`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
