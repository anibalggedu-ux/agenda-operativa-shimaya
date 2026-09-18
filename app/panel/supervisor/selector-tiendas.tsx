"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Circle, AlertTriangle, Zap, MapPin, DoorOpen, Camera, CircleCheck, Lock, BedDouble, Navigation } from "lucide-react";
import {
  obtenerTiendasClasificadas,
  enviarReporte,
  editarReporte,
  obtenerTodasLasTiendas,
  autoasignarTienda,
  marcarLlegadaTienda,
  marcarSalidaTienda,
  type TiendaClasificada,
  type ResultadoReporte,
  type TiendaBasicaBitacora,
} from "./actions";
import {
  formatearFechaLegible,
  formatearHora,
  horaPeru,
  diaLaboralPeru,
  esMadrugadaPeru,
} from "@/lib/fechas";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { reproducirSonidoExito } from "@/lib/sonido";
import { obtenerUbicacionActual } from "@/lib/geolocalizacion";

const ESTILOS_URGENCIA: Record<
  TiendaClasificada["urgencia"],
  { icono: ReactNode; borde: string; fondo: string; texto: string; etiqueta: string }
> = {
  HOY: {
    icono: <Circle className="w-3 h-3 fill-current" />,
    borde: "border-emerald-500",
    fondo: "bg-emerald-950/30",
    texto: "text-emerald-400",
    etiqueta: "HOY",
  },
  MANANA: {
    icono: <Circle className="w-3 h-3 fill-current" />,
    borde: "border-amber-500/60",
    fondo: "bg-amber-950/20",
    texto: "text-amber-400",
    etiqueta: "MAÑANA",
  },
  AYER: {
    icono: <AlertTriangle className="w-3 h-3" />,
    borde: "border-marca-borde",
    fondo: "bg-marca-superficie2",
    texto: "text-marca-tenue",
    etiqueta: "AYER",
  },
  ANTES_DE_AYER: {
    icono: <AlertTriangle className="w-3 h-3" />,
    borde: "border-marca-rojo",
    fondo: "bg-marca-rojo/15",
    texto: "text-marca-rojoclaro",
    etiqueta: "ANTES DE AYER",
  },
};
const estadoInicialReporte: ResultadoReporte = { exito: false };

function BotonEnviar({ esEdicion }: { esEdicion: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Guardando..." : esEdicion ? "Guardar cambios" : "Enviar Reporte"}
    </button>
  );
}

function AsignarmeTienda({ onAsignado }: { onAsignado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tiendas, setTiendas] = useState<TiendaBasicaBitacora[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);
  const [cargandoTiendas, setCargandoTiendas] = useState(false);
  const [errorTiendas, setErrorTiendas] = useState<string | null>(null);

  function cargarTiendas() {
    setCargandoTiendas(true);
    setErrorTiendas(null);
    obtenerTodasLasTiendas()
      .then(setTiendas)
      .catch((e) => setErrorTiendas(e?.message || "No se pudo cargar la lista de tiendas."))
      .finally(() => setCargandoTiendas(false));
  }

  useEffect(() => {
    if (abierto && tiendas.length === 0 && !cargandoTiendas && !errorTiendas) {
      cargarTiendas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tiendas.length]);

  async function handleAsignar() {
    if (!tiendaId) {
      setMensaje({ texto: "Selecciona una tienda.", exito: false });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const resultado = await autoasignarTienda(tiendaId);
    setEnviando(false);
    setMensaje({ texto: resultado.mensaje ?? "", exito: resultado.exito });
    if (resultado.exito) {
      setTiendaId("");
      onAsignado();
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-black uppercase tracking-widest hover:text-marca-rojo transition"
      >
        <Zap className="w-3 h-3" /> ¿Te cambiaron la ruta de último momento? Asígnate una tienda
      </button>
    );
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4 space-y-3">
      <p className="text-marca-tenue text-[11px]">
        Úsalo cuando el coordinador te cambió la ruta a último momento y aún no lo actualizó en el
        sistema. Se asigna para hoy y le llega un aviso automático — no necesitas esperar
        aprobación para reportar.
      </p>
      {errorTiendas ? (
        <div className="bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-xs font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> {errorTiendas}
          </p>
          <div className="flex gap-2">
            <button
              onClick={cargarTiendas}
              className="text-marca-rojoclaro text-[11px] font-black uppercase tracking-widest hover:text-marca-rojo transition"
            >
              Reintentar
            </button>
            <button
              onClick={() => setAbierto(false)}
              className="text-marca-tenue text-[11px] font-bold uppercase"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select
            value={tiendaId}
            onChange={(e) => setTiendaId(e.target.value)}
            disabled={cargandoTiendas}
            className="flex-1 min-w-[180px] p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro disabled:opacity-50"
          >
            <option value="">{cargandoTiendas ? "Cargando tiendas..." : "Selecciona una tienda..."}</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={handleAsignar}
            disabled={enviando || cargandoTiendas}
            className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
          >
            {enviando ? "Asignando..." : "Asignarme"}
          </button>
          <button
            onClick={() => {
              setAbierto(false);
              setMensaje(null);
            }}
            className="text-marca-tenue text-[11px] font-bold uppercase"
          >
            Cancelar
          </button>
        </div>
      )}
      {mensaje && (
        <p className={`text-xs font-bold ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

// Marcación de llegada/salida a UNA tienda en particular (con foto y
// ubicación) — para cuando el día tiene varias rutas asignadas y hace falta
// dejar constancia de cada visita por separado, no solo el ingreso/salida
// general del día.
function MarcadoVisitaTienda({
  tienda,
  onMarcado,
}: {
  tienda: TiendaClasificada;
  onMarcado: () => void;
}) {
  type Paso = "comprimiendo" | "ubicando" | "subiendo";
  const [paso, setPaso] = useState<Paso | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // La foto ya comprimida queda guardada acá hasta que el envío salga bien.
  // Antes la foto y el GPS se pedían juntos con Promise.all: si el GPS
  // fallaba, se descartaba la foto recién tomada y había que volver a abrir
  // la cámara. Ahora se puede reintentar solo la ubicación y el envío.
  const [pendiente, setPendiente] = useState<{ tipo: "llegada" | "salida"; foto: string } | null>(null);
  const inputLlegada = useRef<HTMLInputElement>(null);
  const inputSalida = useRef<HTMLInputElement>(null);

  const ETIQUETA_PASO: Record<Paso, string> = {
    comprimiendo: "Preparando la foto...",
    ubicando: "Obteniendo tu ubicación...",
    subiendo: "Enviando (no cierres la app)...",
  };

  async function enviarMarcacion(tipo: "llegada" | "salida", foto: string) {
    try {
      setPaso("ubicando");
      const coords = await obtenerUbicacionActual();

      setPaso("subiendo");
      const resultado =
        tipo === "llegada"
          ? await marcarLlegadaTienda(tienda.rutaActivaId, tienda.reporteId, coords.lat, coords.lng, foto)
          : await marcarSalidaTienda(tienda.rutaActivaId, tienda.reporteId, coords.lat, coords.lng, foto);

      if (resultado.exito) {
        setPendiente(null);
        reproducirSonidoExito();
        onMarcado();
      } else {
        setMensaje(resultado.mensaje || `No se pudo registrar la ${tipo}.`);
      }
    } catch (err: any) {
      setMensaje(err?.message || "Ocurrió un error.");
    } finally {
      setPaso(null);
    }
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>, tipo: "llegada" | "salida") {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setMensaje(null);
    try {
      setPaso("comprimiendo");
      const foto = await comprimirFotoComoBase64(archivo);
      setPendiente({ tipo, foto });
      await enviarMarcacion(tipo, foto);
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
      setPaso(null);
    }
  }

  async function reintentar() {
    if (!pendiente) return;
    setMensaje(null);
    await enviarMarcacion(pendiente.tipo, pendiente.foto);
  }

  const ocupado = paso !== null;

  // Salir de la tienda después de medianoche es habitual: esa marcación
  // pertenece al turno que recién termina, no al día calendario nuevo. Se
  // avisa antes de abrir la cámara para que no sea una sorpresa al ver el
  // registro con la fecha del día anterior.
  function confirmarTurnoDeMadrugada(): boolean {
    if (!esMadrugadaPeru()) return true;
    return window.confirm(
      `Son las ${horaPeru().slice(0, 5)}.\n\n` +
        `Esta marcación se va a registrar como parte del turno del ${formatearFechaLegible(
          diaLaboralPeru()
        )}, no del día de hoy.\n\n¿Es correcto?`
    );
  }

  function abrirCamara(input: React.RefObject<HTMLInputElement>) {
    if (!confirmarTurnoDeMadrugada()) return;
    input.current?.click();
  }

  return (
    <div className="mt-2 pt-2 border-t border-marca-borde/60 space-y-1">
      <input
        ref={inputLlegada}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFoto(e, "llegada")}
      />
      <input
        ref={inputSalida}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFoto(e, "salida")}
      />

      {tienda.horaLlegada ? (
        <p className="flex items-center gap-1 text-[10.5px] text-marca-tenue">
          <MapPin className="w-3 h-3" /> Llegada:{" "}
          {tienda.ubicacionLlegada ? (
            <a
              href={tienda.ubicacionLlegada}
              target="_blank"
              rel="noopener noreferrer"
              className="text-marca-texto font-bold underline"
            >
              {formatearHora(tienda.horaLlegada)}
            </a>
          ) : (
            <span className="text-marca-texto font-bold">{formatearHora(tienda.horaLlegada)}</span>
          )}
          {tienda.fotoLlegadaUrl && (
            <a href={tienda.fotoLlegadaUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex">
              <Camera className="w-3 h-3" />
            </a>
          )}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => abrirCamara(inputLlegada)}
          disabled={ocupado}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-60 text-marca-textofuerte font-black text-sm rounded-[3px] px-4 transition"
        >
          {paso ? (
            ETIQUETA_PASO[paso]
          ) : (
            <>
              <Camera className="w-4 h-4" /> Marcar llegada a esta tienda
            </>
          )}
        </button>
      )}

      {tienda.horaLlegada && !tienda.horaSalidaTienda && (
        <button
          type="button"
          onClick={() => abrirCamara(inputSalida)}
          disabled={ocupado}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 border border-marca-rojo/50 text-marca-rojoclaro hover:bg-marca-rojo/10 disabled:opacity-60 font-black text-sm rounded-[3px] px-4 transition"
        >
          {paso ? (
            ETIQUETA_PASO[paso]
          ) : (
            <>
              <Camera className="w-4 h-4" /> Marcar salida de la tienda
            </>
          )}
        </button>
      )}

      {tienda.horaSalidaTienda && (
        <p className="flex items-center gap-1 text-[10.5px] text-marca-tenue">
          <DoorOpen className="w-3 h-3" /> Salida:{" "}
          {tienda.ubicacionSalidaTienda ? (
            <a
              href={tienda.ubicacionSalidaTienda}
              target="_blank"
              rel="noopener noreferrer"
              className="text-marca-texto font-bold underline"
            >
              {formatearHora(tienda.horaSalidaTienda)}
            </a>
          ) : (
            <span className="text-marca-texto font-bold">{formatearHora(tienda.horaSalidaTienda)}</span>
          )}
          {tienda.fotoSalidaTiendaUrl && (
            <a href={tienda.fotoSalidaTiendaUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex">
              <Camera className="w-3 h-3" />
            </a>
          )}
        </p>
      )}

      {mensaje && (
        <div className="bg-marca-rojo/10 border border-marca-rojo/40 rounded-[3px] p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-xs font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> {mensaje}
          </p>
          {pendiente && !ocupado && (
            <>
              <p className="text-marca-tenue text-[11px]">
                Tu foto quedó guardada — no hace falta tomarla de nuevo.
              </p>
              <button
                type="button"
                onClick={reintentar}
                className="w-full min-h-[44px] bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black text-xs uppercase tracking-widest rounded-[3px] transition"
              >
                Reintentar envío
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SelectorTiendas({
  supervisorNombre,
  mostrarDescansoFijo = true,
}: {
  supervisorNombre: string;
  // El banner de descanso fijo se oculta cuando el panel ya lo muestra en
  // otro lugar más visible (p. ej. el banner de perfil del Supervisor y del
  // Coordinador), para no repetir la misma información dos veces.
  mostrarDescansoFijo?: boolean;
}) {
  const [tiendas, setTiendas] = useState<TiendaClasificada[] | null>(null);
  const [diaDescanso, setDiaDescanso] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<TiendaClasificada | null>(null);
  const [observacion, setObservacion] = useState("");
  const [actividad, setActividad] = useState("");

  const [estadoNuevo, formActionNuevo] = useFormState(enviarReporte, estadoInicialReporte);
  const [estadoEditar, formActionEditar] = useFormState(editarReporte, estadoInicialReporte);

  const esEdicion = !!seleccionada?.reporteId;
  const estadoActivo = esEdicion ? estadoEditar : estadoNuevo;

  function cargar() {
    setCargando(true);
    obtenerTiendasClasificadas()
      .then(({ tiendas, diaDescansoFijo }) => {
        setTiendas(tiendas);
        setDiaDescanso(diaDescansoFijo);
      })
      .catch((e) => setError(e.message || "Error al cargar tiendas."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estadoNuevo.exito || estadoEditar.exito) {
      setSeleccionada(null);
      setObservacion("");
      setActividad("");
      reproducirSonidoExito();
      cargar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoNuevo.exito, estadoEditar.exito]);

  const grupos = useMemo(() => {
    if (!tiendas) return [];
    const orden: TiendaClasificada["urgencia"][] = [
      "ANTES_DE_AYER",
      "AYER",
      "HOY",
      "MANANA",
    ];
    return orden
      .map((u) => ({ urgencia: u, items: tiendas.filter((t) => t.urgencia === u) }))
      .filter((g) => g.items.length > 0);
  }, [tiendas]);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tus tiendas asignadas...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  if (!tiendas || tiendas.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-marca-tenue text-sm italic">
          No tienes tiendas asignadas ni reportes editables en este momento.
        </p>
        <AsignarmeTienda onAsignado={cargar} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mostrarDescansoFijo && diaDescanso && diaDescanso.length > 0 && (
        <div className="flex items-center gap-1.5 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] px-4 py-2 text-marca-rojoclaro text-xs font-bold">
          <BedDouble className="w-3.5 h-3.5 shrink-0" /> Tu
          {diaDescanso.length > 1 ? "s días de descanso fijos" : " día de descanso fijo"}:{" "}
          {diaDescanso.join(" y ")}
        </div>
      )}

      <AsignarmeTienda onAsignado={cargar} />

      {grupos.map((grupo) => {
        const estilo = ESTILOS_URGENCIA[grupo.urgencia];
        return (
          <div key={grupo.urgencia}>
            <h3 className={`flex items-center gap-1.5 text-xs font-black tracking-widest mb-2 ${estilo.texto}`}>
              {estilo.icono} {estilo.etiqueta}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grupo.items.map((tienda) => {
                const estaSeleccionada = seleccionada?.id === tienda.id;
                const bloqueada = !tienda.puedeReportar;
                return (
                  <div
                    key={tienda.id}
                    className={`rounded-[3px] border-2 p-4 transition ${estilo.borde} ${estilo.fondo} ${
                      estaSeleccionada ? "ring-2 ring-marca-rojo" : ""
                    } ${bloqueada ? "opacity-70" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={bloqueada}
                      onClick={() => {
                        if (bloqueada) return;
                        setSeleccionada(tienda);
                        setObservacion(tienda.observacionActual);
                        setActividad(tienda.actividadActual);
                      }}
                      className={`w-full text-left transition ${bloqueada ? "cursor-default" : "hover:brightness-125"}`}
                    >
                      <p className="font-black text-marca-textofuerte">{tienda.tiendaNombre}</p>
                      <p className="text-[11px] text-marca-tenue capitalize mt-1">
                        {formatearFechaLegible(tienda.fechaPlanificada)}
                      </p>
                      {tienda.autoasignada && (
                        <p className="flex items-center gap-1 text-[10.5px] text-marca-rojoclaro font-bold mt-1">
                          <Zap className="w-3 h-3" /> Auto-asignada
                        </p>
                      )}
                      {tienda.area && (
                        <p className="text-[11px] text-marca-tenue mt-1">
                          {tienda.area}
                          {tienda.enfoque ? ` · ${tienda.enfoque}` : ""}
                        </p>
                      )}
                      {tienda.clima && (
                        <div
                          className={`flex items-center gap-2 mt-2 rounded-[3px] px-2.5 py-1.5 border ${
                            tienda.clima.riesgo
                              ? "bg-amber-950/25 border-amber-500/40"
                              : "bg-marca-fondo/60 border-marca-borde"
                          }`}
                        >
                          <span className="text-base leading-none">{tienda.clima.icono}</span>
                          <div className="min-w-0">
                            <p
                              className={`text-[10.5px] font-bold truncate ${
                                tienda.clima.riesgo ? "text-amber-400" : "text-marca-texto"
                              }`}
                            >
                              {tienda.clima.descripcion} · {tienda.clima.tempMax}°/{tienda.clima.tempMin}°
                            </p>
                            {tienda.clima.avisoTexto && (
                              <p className="text-[10px] text-amber-400/90">{tienda.clima.avisoTexto}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {tienda.reporteId && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold mt-2">
                          <CircleCheck className="w-3.5 h-3.5" /> Reportado — toca para editar
                        </p>
                      )}
                    </button>

                    {tienda.etaMinutos !== null && (
                      <div className="flex items-center gap-2 mt-2 rounded-[3px] px-2.5 py-1.5 border border-marca-rojo/30 bg-marca-rojo/5">
                        <Navigation className="w-3.5 h-3.5 text-marca-rojoclaro shrink-0" />
                        <p className="text-[10.5px] font-bold text-marca-texto">
                          <span className="font-mono text-marca-textofuerte">{tienda.etaMinutos} min</span>
                          {tienda.etaKm !== null && (
                            <span className="text-marca-tenue font-normal"> · {tienda.etaKm} km</span>
                          )}
                          <span className="text-marca-tenue font-normal"> — estimado con tráfico</span>
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <a
                        href={tienda.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 border border-marca-borde hover:border-marca-rojoclaro/50 text-marca-tenue hover:text-marca-texto text-[10.5px] font-bold uppercase tracking-wide py-2 rounded-[3px] transition"
                      >
                        <MapPin className="w-3 h-3" /> Google Maps
                      </a>
                      <a
                        href={tienda.wazeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 border border-marca-borde hover:border-marca-rojoclaro/50 text-marca-tenue hover:text-marca-texto text-[10.5px] font-bold uppercase tracking-wide py-2 rounded-[3px] transition"
                      >
                        <MapPin className="w-3 h-3" /> Waze
                      </a>
                    </div>

                    {bloqueada ? (
                      <p className="flex items-start gap-1.5 mt-2 pt-2 border-t border-marca-borde/60 text-[10.5px] text-marca-tenue">
                        <Lock className="w-3 h-3 mt-0.5 shrink-0" /> Pasaron 48 horas desde que se asignó
                        esta ruta — ya no se puede reportar ni marcar llegada. Queda solo como referencia
                        de qué tienda tenías asignada.
                      </p>
                    ) : (
                      <MarcadoVisitaTienda tienda={tienda} onMarcado={cargar} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {seleccionada && (
        <form
          action={esEdicion ? formActionEditar : formActionNuevo}
          className="bg-marca-superficie border border-marca-rojo/40 rounded-[3px] p-5 space-y-4"
        >
          {esEdicion ? (
            <input type="hidden" name="reporteId" value={seleccionada.reporteId ?? ""} />
          ) : (
            <>
              <input type="hidden" name="rutaActivaId" value={seleccionada.rutaActivaId ?? ""} />
              <input type="hidden" name="tiendaId" value={seleccionada.tiendaId} />
            </>
          )}

          <p className="text-xs text-marca-tenue">
            {esEdicion ? "Editando reporte de" : "Reportando"}:{" "}
            <span className="text-marca-textofuerte font-bold">{seleccionada.tiendaNombre}</span>
          </p>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Observación
            </label>
            <textarea
              name="observacion"
              required
              rows={3}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="¿Qué encontraste en la visita?"
            />
          </div>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Actividad realizada (opcional)
            </label>
            <input
              name="actividad"
              value={actividad}
              onChange={(e) => setActividad(e.target.value)}
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Ej: capacitación de caja, revisión de inventario..."
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSeleccionada(null)}
              className="flex-1 bg-marca-superficie2 border border-marca-borde text-marca-tenue py-3 rounded-[3px] text-xs font-bold uppercase hover:text-marca-texto transition"
            >
              Cancelar
            </button>
            <div className="flex-1">
              <BotonEnviar esEdicion={esEdicion} />
            </div>
          </div>

          {estadoActivo.mensaje && !estadoActivo.exito && (
            <p className="text-marca-rojoclaro text-xs font-bold text-center">
              {estadoActivo.mensaje}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
