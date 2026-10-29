"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, MapPin, TreePalm, Megaphone, Flame, Check, Pencil, Calendar, CircleCheck, Clock, Navigation, LocateFixed, Camera, MessageSquareWarning } from "lucide-react";
import {
  obtenerResumenPersonal,
  obtenerResumenOperativo,
  marcarAlertaAtendida,
  obtenerPedirUbicacion,
  marcarMiUbicacion,
  type ResumenPersonal,
  type ResumenOperativo,
} from "./resumen-dia-actions";
import { recalcularEtaConUbicacion } from "./supervisor/actions";
import { obtenerUbicacionActual } from "@/lib/geolocalizacion";
import { formatearFechaLegible, formatearHora, esTemporadaHalloween, esTemporadaVerano, hoyPeru, horaPeru } from "@/lib/fechas";
import { reproducirSonidoFantasma, reproducirSonidoVerano, reproducirAlPrimerToque } from "@/lib/sonido";
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
      className={`shrink-0 w-[150px] rounded-[3px] p-2.5 border text-left ${
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
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4">
      <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-3 flex items-center gap-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-marca-rojoclaro">
        {icono} {titulo}
      </h4>
      {children}
    </div>
  );
}

function TarjetaAncha({ icono, etiqueta, valor }: { icono: ReactNode; etiqueta: string; valor: string }) {
  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-3 flex items-center justify-between flex-wrap gap-2">
      <span className="text-marca-tenue text-[10px] uppercase font-bold flex items-center gap-2 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-marca-rojoclaro">
        {icono} {etiqueta}
      </span>
      <span className="text-marca-textofuerte font-bold text-xs sm:text-sm capitalize">{valor}</span>
    </div>
  );
}

export default function ResumenDelDia({
  nombre,
  rol,
  children,
  ocultarTarjetas,
}: {
  nombre: string;
  rol: string;
  // Contenido que va justo debajo del saludo y la fecha, antes de los
  // cuadros de estadísticas -- ej. la fila de Historias del equipo.
  children?: ReactNode;
  // true en pestañas como Mi Galería, que ya arman su propio resumen y no
  // necesitan repetir clima/ruta/reportes/racha/comunicados/mapas acá.
  ocultarTarjetas?: boolean;
}) {
  const esOperativo = rol === "coordinador" || rol === "gerente";
  const [personal, setPersonal] = useState<ResumenPersonal | null>(null);
  const [operativo, setOperativo] = useState<ResumenOperativo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [errorAtender, setErrorAtender] = useState<string | null>(null);
  const [reintentoCarga, setReintentoCarga] = useState(0);
  type CuadroExpandible = "criticas" | "tiendasHoy" | "especiales" | "comunicados";
  const [cuadroAbierto, setCuadroAbierto] = useState<CuadroExpandible | null>(null);

  function alternarCuadro(cuadro: CuadroExpandible) {
    setCuadroAbierto((actual) => (actual === cuadro ? null : cuadro));
  }

  // ETA recalculada con el GPS actual (a pedido, botón "Actualizar con mi
  // ubicación") — reemplaza en pantalla el valor por defecto calculado desde
  // el domicilio, sin pedir permiso de ubicación solo por abrir Inicio.
  const [etaEnVivo, setEtaEnVivo] = useState<{ minutos: number | null; km: number | null; cargando: boolean; error: string | null } | null>(null);

  async function actualizarEtaConUbicacion() {
    if (!personal?.rutaHoyTiendaId) return;
    setEtaEnVivo({ minutos: null, km: null, cargando: true, error: null });
    try {
      const coords = await obtenerUbicacionActual();
      const resultado = await recalcularEtaConUbicacion(personal.rutaHoyTiendaId, coords.lat, coords.lng);
      setEtaEnVivo({
        minutos: resultado.etaMinutos,
        km: resultado.etaKm,
        cargando: false,
        error: resultado.etaMinutos === null ? "No se pudo calcular desde tu ubicación." : null,
      });
    } catch (err: any) {
      setEtaEnVivo({ minutos: null, km: null, cargando: false, error: err?.message || "No se pudo obtener tu ubicación." });
    }
  }

  useEffect(() => {
    setCargando(true);
    setErrorCarga(false);
    const promesa = esOperativo ? obtenerResumenOperativo() : obtenerResumenPersonal();
    promesa
      .then((r: any) => (esOperativo ? setOperativo(r) : setPersonal(r)))
      .catch(() => setErrorCarga(true))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esOperativo, reintentoCarga]);

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

  // Botón "Marcar mi ubicación" -- solo aparece mientras el backend diga que
  // hace falta (usuarios.pedir_ubicacion), y se oculta solo apenas se marca
  // con éxito. Ver resumen-dia-actions.ts.
  const [pedirUbicacion, setPedirUbicacion] = useState(false);
  const [marcandoUbicacion, setMarcandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);

  useEffect(() => {
    obtenerPedirUbicacion()
      .then(setPedirUbicacion)
      .catch(() => {});
  }, []);

  async function handleMarcarUbicacion() {
    setMarcandoUbicacion(true);
    setErrorUbicacion(null);
    try {
      const coords = await obtenerUbicacionActual();
      const resultado = await marcarMiUbicacion(coords.lat, coords.lng);
      if (resultado.exito) setPedirUbicacion(false);
      else setErrorUbicacion(resultado.mensaje || "No se pudo guardar tu ubicación.");
    } catch (err: any) {
      setErrorUbicacion(err?.message || "No se pudo obtener tu ubicación.");
    } finally {
      setMarcandoUbicacion(false);
    }
  }

  useEffect(() => {
    const hora = Number(horaPeru().slice(0, 2));
    setSaludo(hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches");
    const hoy = hoyPeru();
    setFechaHoy(`${formatearFechaLegible(hoy)} de ${hoy.slice(0, 4)}`);
  }, []);

  // Ambientación de Halloween (24-31 de octubre) o de verano (nov-mar): solo
  // visual/sonora, un toque único al abrir Inicio -- nunca cambia datos ni
  // comportamiento. Nunca están activas a la vez (ver esTemporadaHalloween/
  // esTemporadaVerano en lib/fechas.ts).
  const [halloween, setHalloween] = useState(false);
  const [verano, setVerano] = useState(false);
  useEffect(() => {
    setHalloween(esTemporadaHalloween());
    setVerano(esTemporadaVerano());
  }, []);
  useEffect(() => {
    if (halloween) {
      reproducirAlPrimerToque(() => reproducirSonidoFantasma());
    } else if (verano) {
      reproducirAlPrimerToque(() => reproducirSonidoVerano());
    }
  }, [halloween, verano]);

  const temporadaActiva = halloween || verano;
  const emojiSaludo = halloween
    ? saludo === "Buenos días"
      ? "🎃"
      : saludo === "Buenas tardes"
        ? "🦇"
        : "👻"
    : verano
      ? saludo === "Buenos días"
        ? "☀️"
        : saludo === "Buenas tardes"
          ? "🏖️"
          : "🌴"
      : "👋";
  const separadorSaludo = halloween && saludo === "Buenas noches" ? "... si te atreves," : ",";

  // Toca para encender: un toque en el emoji del saludo suelta un chispazo
  // de partículas (naranjas en Halloween, coral en verano) alrededor -- puro
  // detalle, no bloquea nada.
  type Chispa = { id: number; dx: number; dy: number };
  const [chispas, setChispas] = useState<Chispa[]>([]);
  function tocarEmoji() {
    if (halloween) reproducirSonidoFantasma();
    else if (verano) reproducirSonidoVerano();
    const nuevas: Chispa[] = Array.from({ length: 10 }).map((_, i) => {
      const angulo = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const vel = 16 + Math.random() * 12;
      return { id: Date.now() + i, dx: Math.cos(angulo) * vel, dy: Math.sin(angulo) * vel };
    });
    setChispas(nuevas);
    window.setTimeout(() => setChispas([]), 650);
  }

  // Truco o trato del día (Halloween) / Especial de verano del día: una vez
  // por día de la temporada activa (guardado en localStorage, es solo una
  // conveniencia de este celular, no un dato real) aparece una frase de la
  // casa al abrir Inicio.
  const FRASES_TRATO = [
    "🎃 Hoy hasta los fantasmas llegan temprano a su tienda.",
    "🦇 Que ningún duende te robe el break de hoy.",
    "👻 Marca tu salida -- ni los fantasmas se quedan atrapados en una tienda.",
    "🍬 Un checklist completo hoy ahuyenta cualquier mal espíritu.",
  ];
  const FRASES_VERANO = [
    "☀️ Hidrátate seguido en ruta -- hoy toca calor fuerte en la costa.",
    "🧴 Aplica protector solar antes de salir a ruta.",
    "🏖️ Marca tu salida antes de que se ponga el sol -- ni en la playa se olvida.",
    "🍍 Un checklist completo hoy es la mejor excusa para un refresco después.",
  ];
  const [trato, setTrato] = useState<string | null>(null);
  useEffect(() => {
    if (!temporadaActiva) return;
    try {
      const hoy = hoyPeru();
      const clave = halloween ? "shimaya_trato_fecha" : "shimaya_verano_fecha";
      const visto = localStorage.getItem(clave);
      if (visto !== hoy) {
        const frases = halloween ? FRASES_TRATO : FRASES_VERANO;
        setTrato(frases[Math.floor(Math.random() * frases.length)]);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halloween, verano]);
  function cerrarTrato() {
    setTrato(null);
    try {
      localStorage.setItem(halloween ? "shimaya_trato_fecha" : "shimaya_verano_fecha", hoyPeru());
    } catch {}
  }

  if (cargando) {
    return <div className="mb-6 h-20 bg-marca-superficie border border-marca-borde rounded-[3px] animate-pulse" />;
  }

  if (errorCarga) {
    return (
      <div className="mb-6 bg-advertencia/10 border border-advertencia/40 rounded-[3px] p-3.5 flex items-center justify-between gap-3">
        <p className="text-advertencia text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> No se pudo cargar tu resumen de Inicio.
        </p>
        <button
          type="button"
          onClick={() => setReintentoCarga((n) => n + 1)}
          className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-advertencia border border-advertencia/40 rounded-[3px] px-2.5 py-1.5 hover:bg-advertencia/10 transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="relative mb-3 overflow-hidden">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-marca-textofuerte">
          {saludo}
          {separadorSaludo} <span className="text-marca-rojoclaro italic">{primerNombre}</span>{" "}
          {temporadaActiva ? (
            <span className="relative inline-block">
              <button
                type="button"
                onClick={tocarEmoji}
                aria-label="Tocar"
                className="align-middle leading-none"
              >
                {emojiSaludo}
              </button>
              {chispas.map((c) => (
                <span
                  key={c.id}
                  aria-hidden
                  className={halloween ? "chispa" : "chispa-verano"}
                  style={{
                    // @ts-expect-error variables CSS propias, leídas solo por el keyframe
                    "--chispa-dx": `${c.dx}px`,
                    "--chispa-dy": `${c.dy}px`,
                  }}
                />
              ))}
            </span>
          ) : (
            emojiSaludo
          )}
        </h2>
        <p className="text-marca-tenue text-xs capitalize">{fechaHoy}</p>
      </div>

      {pedirUbicacion && (
        <div className="mb-3 bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-3.5 space-y-2">
          <p className="text-marca-texto text-xs font-semibold flex items-start gap-2">
            <LocateFixed className="w-3.5 h-3.5 shrink-0 mt-0.5 text-marca-rojoclaro" />
            <span>
              Ayúdanos a corregir tu domicilio registrado: cuando llegues a tu casa hoy, toca el
              botón para guardar tu ubicación real.
            </span>
          </p>
          <button
            type="button"
            onClick={handleMarcarUbicacion}
            disabled={marcandoUbicacion}
            className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 rounded-[3px] text-xs tracking-widest uppercase transition flex items-center justify-center gap-1.5"
          >
            <MapPin className="w-4 h-4" /> {marcandoUbicacion ? "Guardando..." : "Marcar mi ubicación"}
          </button>
          {errorUbicacion && <p className="text-marca-rojoclaro text-[11px] font-bold">{errorUbicacion}</p>}
        </div>
      )}

      {children && <div className="mb-3">{children}</div>}

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
        <div className="mb-3 bg-advertencia/10 border border-advertencia/40 rounded-[3px] p-2.5 flex items-center justify-between gap-2">
          <p className="text-advertencia text-xs font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorAtender}
          </p>
          <button
            onClick={() => setErrorAtender(null)}
            className="shrink-0 text-[10px] font-bold text-advertencia/70 hover:text-advertencia"
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
                  onClick={() => {
                    if (window.confirm(`¿Marcar como atendida la alerta de ${a.usuarioNombre}? Deja de avisar mientras no vuelva a pasar.`)) {
                      handleAtenderAlerta(a.usuarioId, a.tipo);
                    }
                  }}
                  className="shrink-0 text-[10px] font-bold text-marca-tenue hover:text-exito border border-marca-borde hover:border-exito/40 rounded-[3px] px-2 py-1 transition whitespace-nowrap flex items-center gap-1"
                  title="Ya tomé acción — dejar de avisar mientras no vuelva a pasar"
                >
                  <Check className="w-3 h-3" /> Atendido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {esOperativo && operativo && operativo.tardanzasConJustificativo.length > 0 && (
        <div className="mb-3 bg-marca-superficie border border-marca-borde rounded-[3px] p-3.5 space-y-2">
          <p className="text-marca-tenue text-[10px] uppercase font-bold flex items-center gap-1.5">
            <MessageSquareWarning className="w-3.5 h-3.5 text-marca-rojoclaro" /> Tardanzas justificadas de hoy (
            {operativo.tardanzasConJustificativo.length})
          </p>
          <div className="space-y-1.5">
            {operativo.tardanzasConJustificativo.map((t, i) => (
              <div key={i} className="bg-marca-fondo border border-marca-borde rounded-[3px] p-2">
                <p className="text-marca-texto text-xs">
                  <span className="font-bold">{t.usuarioNombre}</span>{" "}
                  <span className="text-marca-tenue uppercase text-[10px]">
                    ({t.tipo === "ingreso" ? "ingreso" : "break"})
                  </span>
                  {t.fotoUrl && (
                    <a
                      href={t.fotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 inline-flex text-marca-tenue hover:text-marca-rojoclaro"
                      title="Ver foto"
                    >
                      <Camera className="w-3 h-3" />
                    </a>
                  )}
                </p>
                <p className="text-marca-tenue text-[11px] mt-0.5">{t.texto}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {trato && (
        <div className="mb-3 bg-marca-superficie/60 border border-marca-borde rounded-[3px] px-3 py-2 flex items-center gap-2.5">
          <span aria-hidden className="text-sm leading-none">{halloween ? "🍬" : "🍹"}</span>
          <p className="text-marca-tenue text-[11px] flex-1">{trato}</p>
          <button
            type="button"
            onClick={cerrarTrato}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-marca-tenue hover:text-marca-texto transition rounded-[3px] px-1"
          >
            Listo
          </button>
        </div>
      )}

      {!ocultarTarjetas && (
      <div className="space-y-2">
        {/* Carrusel horizontal (desliza) en vez de grid -- antes ocupaba 2 o
            3 filas completas en el celular. */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            </>
          )}

          {!esOperativo && personal && (
            <>
              {personal.climaActual && (
                <div
                  className={`shrink-0 w-[150px] rounded-[3px] p-2.5 border ${
                    personal.climaActual.riesgo
                      ? "bg-advertencia/10 border-advertencia/40"
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
                      personal.climaActual.riesgo ? "text-advertencia" : "text-marca-textofuerte"
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
                className={`shrink-0 w-[150px] rounded-[3px] p-2.5 border ${
                  personal.rutaHoyEstado === "pendiente"
                    ? "bg-marca-rojo/10 border-marca-rojo/40"
                    : "bg-marca-superficie border-marca-borde"
                } ${personal.rutaHoyNombre ? "borde-dorado-animado" : ""}`}
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
                          ? "bg-advertencia/15 text-advertencia"
                          : "bg-exito/15 text-exito"
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
                valorClase={personal.rachaActual > 0 ? "text-exito" : undefined}
                extra={personal.rachaActual > 0 ? "sigue así" : "marca a tiempo"}
              />
              <Tarjeta
                icono={<Megaphone className="w-4 h-4" />}
                etiqueta="Comunicados recientes"
                valor={String(personal.comunicadosRecientes)}
                extra={personal.ultimoComunicadoTipo ?? "sin novedades"}
              />
            </>
          )}
        </div>

        {/* Bloques anchos y detalle expandido -- fuera del carrusel, a lo
            ancho de la pantalla. */}
        {esOperativo && operativo && (
          <>
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
                          t.reportada ? "text-exito" : "text-advertencia"
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
            {personal.rutaHoyGoogleMapsUrl && (
              <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                  <span className="relative w-4 h-4 shrink-0 flex items-center justify-center">
                    {/* Anillo tipo radar mientras la ETA viene de tu GPS en vivo
                        (no del domicilio) — ver .ping-ubicacion en globals.css. */}
                    {etaEnVivo?.minutos !== null && etaEnVivo?.minutos !== undefined && (
                      <span className="ping-ubicacion w-2 h-2 left-1/2 top-1/2" />
                    )}
                    <Navigation className="w-4 h-4 text-marca-rojoclaro relative" />
                  </span>
                  <div>
                    <p className="text-xs">
                      <span className="text-marca-tenue">Camino a </span>
                      <span className="text-marca-textofuerte font-bold">{personal.rutaHoyNombre}</span>
                      {etaEnVivo?.cargando ? (
                        <span className="text-marca-tenue text-[10.5px]"> — calculando desde tu ubicación...</span>
                      ) : etaEnVivo?.minutos !== null && etaEnVivo?.minutos !== undefined ? (
                        <>
                          <span className="text-marca-tenue"> — </span>
                          <span className="font-mono text-marca-textofuerte font-semibold">{etaEnVivo.minutos} min</span>
                          {etaEnVivo.km !== null && (
                            <span className="text-marca-tenue"> · {etaEnVivo.km} km</span>
                          )}
                          <span className="text-marca-tenue text-[10.5px]"> (desde tu ubicación actual)</span>
                        </>
                      ) : etaEnVivo?.error ? (
                        <span className="text-marca-rojoclaro text-[10.5px]"> — {etaEnVivo.error}</span>
                      ) : (
                        personal.rutaHoyEtaMinutos !== null && (
                          <>
                            <span className="text-marca-tenue"> — </span>
                            <span className="font-mono text-marca-textofuerte font-semibold">
                              {personal.rutaHoyEtaMinutos} min
                            </span>
                            {personal.rutaHoyEtaKm !== null && (
                              <span className="text-marca-tenue"> · {personal.rutaHoyEtaKm} km</span>
                            )}
                            <span className="text-marca-tenue text-[10.5px]"> (tráfico en tiempo real desde tu domicilio)</span>
                          </>
                        )
                      )}
                    </p>
                    {personal.rutaHoyTiendaId && (
                      <button
                        type="button"
                        onClick={actualizarEtaConUbicacion}
                        disabled={etaEnVivo?.cargando}
                        className="flex items-center gap-1.5 mt-1 text-[10.5px] text-marca-rojoclaro font-bold uppercase tracking-wide hover:text-marca-rojo transition disabled:opacity-60"
                      >
                        <LocateFixed className="w-3 h-3" />
                        {etaEnVivo?.cargando ? "Ubicando..." : "Actualizar con mi ubicación"}
                      </button>
                    )}
                  </div>
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
      )}
    </div>
  );
}
