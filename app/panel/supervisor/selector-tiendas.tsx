"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Circle, AlertTriangle, Zap, MapPin, DoorOpen, Camera, CircleCheck, Lock, BedDouble, Navigation, LocateFixed } from "lucide-react";
import {
  obtenerTiendasClasificadas,
  enviarReporte,
  editarReporte,
  obtenerTodasLasTiendas,
  autoasignarTienda,
  marcarLlegadaTienda,
  marcarSalidaTienda,
  recalcularEtaConUbicacion,
  type TiendaClasificada,
  type ResultadoReporte,
  type TiendaBasicaBitacora,
} from "./actions";
import {
  formatearFechaLegible,
  formatearHora,
  horaPeru,
  hoyPeru,
  diaLaboralPeru,
  esMadrugadaPeru,
} from "@/lib/fechas";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { reproducirSonidoAlerta, reproducirSonidoExito } from "@/lib/sonido";
import { obtenerUbicacionActual } from "@/lib/geolocalizacion";
import { agregarMarcacionPendiente, pareceFallaDeConexion } from "@/lib/cola-marcaciones";
import { distanciaMetros, UMBRAL_LEJOS_METROS } from "@/lib/distancia-recta";

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
  const [fecha, setFecha] = useState<"hoy" | "manana">("hoy");
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
    const resultado = await autoasignarTienda(tiendaId, fecha === "manana");
    setEnviando(false);
    setMensaje({ texto: resultado.mensaje ?? "", exito: resultado.exito });
    if (resultado.exito) {
      setTiendaId("");
      setFecha("hoy");
      onAsignado();
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 bg-marca-superficie border border-marca-rojo/45 text-marca-rojoclaro rounded-full pl-2 pr-4 py-2 text-[11.5px] font-black tracking-wide hover:border-marca-rojo transition"
      >
        <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-marca-rojo/20">
          <Zap className="w-[11px] h-[11px]" />
        </span>
        Autoasignarme tienda
      </button>
    );
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4 space-y-3">
      <p className="text-marca-tenue text-[11px]">
        Úsalo cuando el coordinador te cambió la ruta a último momento y aún no lo actualizó en el
        sistema. Le llega un aviso automático — no necesitas esperar aprobación para reportar.
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
        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 w-[118px] shrink-0">
              <span className="text-marca-tenue text-[9.5px] font-black uppercase tracking-wider">Fecha</span>
              <select
                value={fecha}
                onChange={(e) => setFecha(e.target.value as "hoy" | "manana")}
                className="w-full p-2.5 bg-marca-fondo border border-marca-rojo/40 rounded-[3px] text-marca-rojoclaro font-bold text-xs outline-none focus:border-marca-rojoclaro"
              >
                <option value="hoy">Hoy</option>
                <option value="manana">Mañana</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-marca-tenue text-[9.5px] font-black uppercase tracking-wider">Tienda</span>
              <select
                value={tiendaId}
                onChange={(e) => setTiendaId(e.target.value)}
                disabled={cargandoTiendas}
                className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro disabled:opacity-50"
              >
                <option value="">{cargandoTiendas ? "Cargando tiendas..." : "Selecciona una tienda..."}</option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleAsignar}
              disabled={enviando || cargandoTiendas}
              className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
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
// Check dorado que se dibuja de un trazo (ver .trazo-check en globals.css),
// justo al confirmar una marcación de llegada o salida.
function TrazoCheckDorado() {
  return (
    <svg viewBox="0 0 24 24" className="trazo-check marcado w-3 h-3 shrink-0" aria-hidden>
      <path
        d="M4 12.5 L9.5 18 L20 5.5"
        fill="none"
        stroke="rgb(var(--marca-oro))"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Aviso (nunca bloquea la marcación) cuando el GPS capturado quedó a más de
// UMBRAL_LEJOS_METROS de la tienda — puede ser una marcación equivocada, o
// simplemente el GPS fallando dentro de un edificio o estacionamiento.
function AvisoUbicacionLejos({ metros }: { metros: number }) {
  const texto = metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${metros} m`;
  return (
    <p className="flex items-start gap-1.5 bg-amber-950/20 border border-amber-500/40 rounded-[3px] p-2.5 text-amber-400 text-[11px] leading-snug">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        Tu ubicación quedó a <b>{texto}</b> de la tienda. Puede ser que tu GPS haya fallado — si estás seguro que
        marcaste en la tienda correcta, no hace falta hacer nada.
      </span>
    </p>
  );
}

function MarcadoVisitaTienda({
  tienda,
  onMarcado,
  permitirJustificativo,
}: {
  tienda: TiendaClasificada;
  onMarcado: () => void;
  // true cuando esta tarjeta es la que va a fijar el ingreso general del
  // día y ya pasó la hora límite de la persona (ver mostrarJustificativoTardanza
  // en supervisor/actions.ts) -- muestra el campo opcional de justificativo.
  permitirJustificativo: boolean;
}) {
  type Paso = "comprimiendo" | "ubicando" | "subiendo";
  const [paso, setPaso] = useState<Paso | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [justificativo, setJustificativo] = useState("");
  // La foto ya comprimida queda guardada acá hasta que el envío salga bien.
  // Antes la foto y el GPS se pedían juntos con Promise.all: si el GPS
  // fallaba, se descartaba la foto recién tomada y había que volver a abrir
  // la cámara. Ahora se puede reintentar solo la ubicación y el envío.
  const [pendiente, setPendiente] = useState<{ tipo: "llegada" | "salida"; foto: string; horaCapturadaMs: number } | null>(
    null
  );
  const inputLlegada = useRef<HTMLInputElement>(null);
  const inputSalida = useRef<HTMLInputElement>(null);
  // Fecha elegida por la persona cuando marca salida de madrugada (ver
  // confirmarDiaSalida más abajo) -- se guarda acá porque se decide al abrir
  // la cámara, pero recién hace falta al enviar la marcación (handleFoto).
  const fechaSalidaElegidaRef = useRef<string | null>(null);
  // Trazo dorado que se dibuja solo, justo al confirmar la marcación (no en
  // cada recarga en que ya venga marcada de antes).
  const [marcadoRecien, setMarcadoRecien] = useState<"llegada" | "salida" | null>(null);
  // Aviso (no bloquea nada) cuando el GPS de la marcación quedó lejos de la
  // dirección registrada de la tienda — puede ser una marcación equivocada
  // o simplemente el GPS fallando dentro de un edificio.
  const [avisoLejos, setAvisoLejos] = useState<{ tipo: "llegada" | "salida"; metros: number } | null>(null);

  const ETIQUETA_PASO: Record<Paso, string> = {
    comprimiendo: "Preparando la foto...",
    ubicando: "Obteniendo tu ubicación...",
    subiendo: "Enviando (no cierres la app)...",
  };

  async function enviarMarcacion(tipo: "llegada" | "salida", foto: string, horaCapturadaMs: number) {
    let coords: { lat: number; lng: number };
    try {
      setPaso("ubicando");
      coords = await obtenerUbicacionActual();
    } catch (err: any) {
      reproducirSonidoAlerta();
      setMensaje(err?.message || "Ocurrió un error.");
      setPaso(null);
      return;
    }

    try {
      setPaso("subiendo");
      const resultado =
        tipo === "llegada"
          ? await marcarLlegadaTienda(
              tienda.rutaActivaId,
              tienda.reporteId,
              coords.lat,
              coords.lng,
              foto,
              horaCapturadaMs,
              justificativo.trim() || undefined
            )
          : await marcarSalidaTienda(
              tienda.rutaActivaId,
              tienda.reporteId,
              coords.lat,
              coords.lng,
              foto,
              horaCapturadaMs,
              fechaSalidaElegidaRef.current ?? undefined
            );

      if (resultado.exito) {
        setPendiente(null);
        reproducirSonidoExito();
        setMarcadoRecien(tipo);
        window.setTimeout(() => setMarcadoRecien(null), 900);
        if (tienda.tiendaLat !== null && tienda.tiendaLon !== null) {
          const metros = distanciaMetros(coords.lat, coords.lng, tienda.tiendaLat, tienda.tiendaLon);
          setAvisoLejos(metros > UMBRAL_LEJOS_METROS ? { tipo, metros } : null);
        } else {
          setAvisoLejos(null);
        }
        onMarcado();
      } else {
        reproducirSonidoAlerta();
        setMensaje(resultado.mensaje || `No se pudo registrar la ${tipo}.`);
      }
    } catch (err: any) {
      if (pareceFallaDeConexion(err)) {
        // Sin señal (típico en los estacionamientos subterráneos) -- queda
        // en la cola del celular y el indicador global la reenvía sola con
        // la hora de este intento en cuanto vuelva la conexión.
        agregarMarcacionPendiente({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          accion: tipo === "llegada" ? "llegada-tienda" : "salida-tienda",
          rutaActivaId: tienda.rutaActivaId,
          reporteId: tienda.reporteId,
          foto,
          lat: coords.lat,
          lng: coords.lng,
          horaCapturadaMs,
          justificativoTardanza: tipo === "llegada" ? justificativo.trim() || undefined : undefined,
          fechaAsistenciaElegida: tipo === "salida" ? fechaSalidaElegidaRef.current ?? undefined : undefined,
          etiqueta: `${tipo === "llegada" ? "Llegada" : "Salida"} — ${tienda.tiendaNombre}`,
        });
        setPendiente(null);
        reproducirSonidoAlerta();
        setMensaje("Sin señal — tu marcación quedó guardada en el celular y se enviará sola cuando vuelva la conexión.");
      } else {
        reproducirSonidoAlerta();
        setMensaje(err?.message || "Ocurrió un error.");
      }
    } finally {
      setPaso(null);
    }
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>, tipo: "llegada" | "salida") {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const horaCapturadaMs = Date.now();
    setMensaje(null);
    try {
      setPaso("comprimiendo");
      const foto = await comprimirFotoComoBase64(archivo);
      setPendiente({ tipo, foto, horaCapturadaMs });
      await enviarMarcacion(tipo, foto, horaCapturadaMs);
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
      setPaso(null);
    }
  }

  async function reintentar() {
    if (!pendiente) return;
    setMensaje(null);
    await enviarMarcacion(pendiente.tipo, pendiente.foto, pendiente.horaCapturadaMs);
  }

  const ocupado = paso !== null;

  // Llegar a una tienda después de medianoche es raro (normalmente es la
  // SALIDA la que cruza la medianoche, ver confirmarDiaSalida) pero igual se
  // avisa antes de abrir la cámara para que no sea una sorpresa ver el
  // registro con la fecha del turno anterior.
  function confirmarTurnoDeMadrugada(): boolean {
    if (!esMadrugadaPeru()) return true;
    return window.confirm(
      `Son las ${horaPeru().slice(0, 5)}.\n\n` +
        `Esta marcación se va a registrar como parte del turno del ${formatearFechaLegible(
          diaLaboralPeru()
        )}, no del día de hoy.\n\n¿Es correcto?`
    );
  }

  // Salir de la tienda después de medianoche es habitual (turno que se
  // extiende, cierre tardío) -- en vez de asumir en automático a qué día
  // pertenece, se le pregunta directamente: ¿es el turno que recién está
  // cerrando, o ya es un día nuevo que empezó? La respuesta se guarda en
  // fechaSalidaElegidaRef y viaja con la marcación (ver enviarMarcacion).
  function confirmarDiaSalida(): string | null {
    if (!esMadrugadaPeru()) return diaLaboralPeru();
    const esTurnoQueCierra = window.confirm(
      `Son las ${horaPeru().slice(0, 5)}.\n\n` +
        `¿Esta salida pertenece al turno del ${formatearFechaLegible(diaLaboralPeru())} (el que recién está cerrando)?\n\n` +
        `Aceptar = sí, ese turno.\nCancelar = no, ya es un día nuevo (${formatearFechaLegible(hoyPeru())}).`
    );
    return esTurnoQueCierra ? diaLaboralPeru() : hoyPeru();
  }

  function abrirCamara(input: React.RefObject<HTMLInputElement>, tipo: "llegada" | "salida") {
    if (tipo === "llegada") {
      if (!confirmarTurnoDeMadrugada()) return;
    } else {
      fechaSalidaElegidaRef.current = confirmarDiaSalida();
    }
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
          {marcadoRecien === "llegada" && <TrazoCheckDorado />}
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
      ) : null}
      {avisoLejos?.tipo === "llegada" && <AvisoUbicacionLejos metros={avisoLejos.metros} />}
      {!tienda.horaLlegada && (
        <>
          {permitirJustificativo && (
            <div className="mb-1">
              <label className="block text-marca-tenue text-[9.5px] uppercase font-bold mb-1">
                Justificativo de tardanza (opcional)
              </label>
              <textarea
                value={justificativo}
                onChange={(e) => setJustificativo(e.target.value)}
                disabled={ocupado}
                rows={2}
                className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-xs outline-none focus:border-marca-rojoclaro disabled:opacity-50"
                placeholder="Ej: tráfico, trámite médico, falla del bus... (déjalo vacío si no aplica)"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => abrirCamara(inputLlegada, "llegada")}
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
        </>
      )}

      {tienda.horaLlegada && !tienda.horaSalidaTienda && (
        <button
          type="button"
          onClick={() => abrirCamara(inputSalida, "salida")}
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
          {marcadoRecien === "salida" && <TrazoCheckDorado />}
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
      {avisoLejos?.tipo === "salida" && <AvisoUbicacionLejos metros={avisoLejos.metros} />}

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
  const [mostrarJustificativoTardanza, setMostrarJustificativoTardanza] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<TiendaClasificada | null>(null);
  const [observacion, setObservacion] = useState("");
  const [actividad, setActividad] = useState("");

  // ETA recalculada con el GPS actual (a pedido, con el botón "Actualizar
  // con mi ubicación") — reemplaza en pantalla, solo para esa tarjeta, el
  // valor por defecto que viene calculado desde el domicilio.
  type EtaEnVivo = { minutos: number | null; km: number | null; cargando: boolean; error: string | null };
  const [etaEnVivo, setEtaEnVivo] = useState<Record<string, EtaEnVivo>>({});

  async function actualizarEtaConUbicacion(tienda: TiendaClasificada) {
    setEtaEnVivo((prev) => ({ ...prev, [tienda.id]: { minutos: null, km: null, cargando: true, error: null } }));
    try {
      const coords = await obtenerUbicacionActual();
      const resultado = await recalcularEtaConUbicacion(tienda.tiendaId, coords.lat, coords.lng);
      setEtaEnVivo((prev) => ({
        ...prev,
        [tienda.id]: {
          minutos: resultado.etaMinutos,
          km: resultado.etaKm,
          cargando: false,
          error: resultado.etaMinutos === null ? "No se pudo calcular desde tu ubicación." : null,
        },
      }));
    } catch (err: any) {
      setEtaEnVivo((prev) => ({
        ...prev,
        [tienda.id]: { minutos: null, km: null, cargando: false, error: err?.message || "No se pudo obtener tu ubicación." },
      }));
    }
  }

  const [estadoNuevo, formActionNuevo] = useFormState(enviarReporte, estadoInicialReporte);
  const [estadoEditar, formActionEditar] = useFormState(editarReporte, estadoInicialReporte);

  const esEdicion = !!seleccionada?.reporteId;
  const estadoActivo = esEdicion ? estadoEditar : estadoNuevo;

  function cargar() {
    setCargando(true);
    obtenerTiendasClasificadas()
      .then(({ tiendas, diaDescansoFijo, mostrarJustificativoTardanza }) => {
        setTiendas(tiendas);
        setDiaDescanso(diaDescansoFijo);
        setMostrarJustificativoTardanza(mostrarJustificativoTardanza);
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

  // Si el reporte no se pudo enviar, alerta (el mensaje ya se muestra).
  useEffect(() => {
    if (estadoNuevo.mensaje && !estadoNuevo.exito) reproducirSonidoAlerta();
  }, [estadoNuevo]);
  useEffect(() => {
    if (estadoEditar.mensaje && !estadoEditar.exito) reproducirSonidoAlerta();
  }, [estadoEditar]);

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

                    {(() => {
                      const enVivo = etaEnVivo[tienda.id];
                      if (!enVivo && tienda.etaMinutos === null) return null;
                      return (
                        <div className="flex items-center gap-2 mt-2 rounded-[3px] px-2.5 py-1.5 border border-marca-rojo/30 bg-marca-rojo/5">
                          <Navigation className="w-3.5 h-3.5 text-marca-rojoclaro shrink-0" />
                          <p className="text-[10.5px] font-bold text-marca-texto">
                            {enVivo?.cargando ? (
                              <span className="text-marca-tenue font-normal">Calculando desde tu ubicación...</span>
                            ) : enVivo?.minutos !== null && enVivo?.minutos !== undefined ? (
                              <>
                                <span className="font-mono text-marca-textofuerte">{enVivo.minutos} min</span>
                                {enVivo.km !== null && (
                                  <span className="text-marca-tenue font-normal"> · {enVivo.km} km</span>
                                )}
                                <span className="text-marca-tenue font-normal"> — desde tu ubicación actual</span>
                              </>
                            ) : enVivo?.error ? (
                              <span className="text-marca-rojoclaro font-normal">{enVivo.error}</span>
                            ) : (
                              <>
                                <span className="font-mono text-marca-textofuerte">{tienda.etaMinutos} min</span>
                                {tienda.etaKm !== null && (
                                  <span className="text-marca-tenue font-normal"> · {tienda.etaKm} km</span>
                                )}
                                <span className="text-marca-tenue font-normal"> — estimado con tráfico desde tu domicilio</span>
                              </>
                            )}
                          </p>
                        </div>
                      );
                    })()}
                    {tienda.urgencia === "HOY" && !tienda.horaLlegada && (
                      <button
                        type="button"
                        onClick={() => actualizarEtaConUbicacion(tienda)}
                        disabled={etaEnVivo[tienda.id]?.cargando}
                        className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-marca-rojoclaro font-bold uppercase tracking-wide hover:text-marca-rojo transition disabled:opacity-60"
                      >
                        <LocateFixed className="w-3 h-3" />
                        {etaEnVivo[tienda.id]?.cargando ? "Ubicando..." : "Actualizar con mi ubicación"}
                      </button>
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
                      <MarcadoVisitaTienda
                        tienda={tienda}
                        onMarcado={cargar}
                        permitirJustificativo={mostrarJustificativoTardanza && !tienda.horaLlegada}
                      />
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
