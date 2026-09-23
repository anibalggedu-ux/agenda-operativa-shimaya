"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, MapPin, Camera, DoorOpen, AlertTriangle } from "lucide-react";
import {
  obtenerEventosDeHoyParaMi,
  marcarLlegadaEvento,
  marcarSalidaEvento,
  type EventoDeHoy,
} from "./anuncios-actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { obtenerUbicacionActual } from "@/lib/geolocalizacion";
import { reproducirSonidoExito } from "@/lib/sonido";
import { formatearHora } from "@/lib/fechas";
import { agregarMarcacionPendiente, pareceFallaDeConexion } from "@/lib/cola-marcaciones";

// Tarjeta independiente para marcar entrada/salida a un anuncio/evento del
// día (ej. una reunión en otra sede) — no toca la asignación de tienda del
// día, y estos check-in/out también suman kilómetros por su cuenta.
function TarjetaEvento({ evento, onMarcado }: { evento: EventoDeHoy; onMarcado: () => void }) {
  type Paso = "comprimiendo" | "ubicando" | "subiendo";
  const [paso, setPaso] = useState<Paso | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ tipo: "llegada" | "salida"; foto: string; horaCapturadaMs: number } | null>(
    null
  );
  const inputLlegada = useRef<HTMLInputElement>(null);
  const inputSalida = useRef<HTMLInputElement>(null);

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
      setMensaje(err?.message || "Ocurrió un error.");
      setPaso(null);
      return;
    }

    try {
      setPaso("subiendo");
      const resultado =
        tipo === "llegada"
          ? await marcarLlegadaEvento(evento.comunicadoId, coords.lat, coords.lng, foto, horaCapturadaMs)
          : await marcarSalidaEvento(evento.comunicadoId, coords.lat, coords.lng, foto, horaCapturadaMs);

      if (resultado.exito) {
        setPendiente(null);
        reproducirSonidoExito();
        onMarcado();
      } else {
        setMensaje(resultado.mensaje || `No se pudo registrar la ${tipo}.`);
      }
    } catch (err: any) {
      if (pareceFallaDeConexion(err)) {
        agregarMarcacionPendiente({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          accion: tipo === "llegada" ? "llegada-evento" : "salida-evento",
          comunicadoId: evento.comunicadoId,
          foto,
          lat: coords.lat,
          lng: coords.lng,
          horaCapturadaMs,
          etiqueta: `${tipo === "llegada" ? "Llegada" : "Salida"} — ${evento.mensaje}`,
        });
        setPendiente(null);
        setMensaje("Sin señal — tu marcación quedó guardada en el celular y se enviará sola cuando vuelva la conexión.");
      } else {
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

  return (
    <div className="bg-marca-superficie border border-marca-rojo/30 rounded-[3px] p-4 space-y-2">
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

      <p className="text-[10px] font-black uppercase tracking-widest text-marca-rojoclaro">{evento.tipo}</p>
      <p className="text-marca-textofuerte text-sm font-bold">{evento.mensaje}</p>
      <a
        href={`https://www.google.com/maps?q=${encodeURIComponent(evento.ubicacion)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-marca-tenue hover:text-marca-textofuerte underline text-[11px] font-bold"
      >
        <MapPin className="w-3 h-3" /> {evento.ubicacion} — Ver en Maps
      </a>

      <div className="pt-1 space-y-1.5">
        {evento.horaLlegada ? (
          <p className="flex items-center gap-1 text-[10.5px] text-marca-tenue">
            <MapPin className="w-3 h-3" /> Llegada:{" "}
            {evento.ubicacionLlegadaMapa ? (
              <a
                href={evento.ubicacionLlegadaMapa}
                target="_blank"
                rel="noopener noreferrer"
                className="text-marca-texto font-bold underline"
              >
                {formatearHora(evento.horaLlegada)}
              </a>
            ) : (
              <span className="text-marca-texto font-bold">{formatearHora(evento.horaLlegada)}</span>
            )}
            {evento.fotoLlegadaUrl && (
              <a href={evento.fotoLlegadaUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex">
                <Camera className="w-3 h-3" />
              </a>
            )}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => inputLlegada.current?.click()}
            disabled={ocupado}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-60 text-marca-textofuerte font-black text-sm rounded-[3px] px-4 transition"
          >
            {paso ? (
              ETIQUETA_PASO[paso]
            ) : (
              <>
                <Camera className="w-4 h-4" /> Marcar llegada al evento
              </>
            )}
          </button>
        )}

        {evento.horaLlegada && !evento.horaSalida && (
          <button
            type="button"
            onClick={() => inputSalida.current?.click()}
            disabled={ocupado}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 border border-marca-rojo/50 text-marca-rojoclaro hover:bg-marca-rojo/10 disabled:opacity-60 font-black text-sm rounded-[3px] px-4 transition"
          >
            {paso ? (
              ETIQUETA_PASO[paso]
            ) : (
              <>
                <Camera className="w-4 h-4" /> Marcar salida del evento
              </>
            )}
          </button>
        )}

        {evento.horaSalida && (
          <p className="flex items-center gap-1 text-[10.5px] text-marca-tenue">
            <DoorOpen className="w-3 h-3" /> Salida:{" "}
            {evento.ubicacionSalidaMapa ? (
              <a
                href={evento.ubicacionSalidaMapa}
                target="_blank"
                rel="noopener noreferrer"
                className="text-marca-texto font-bold underline"
              >
                {formatearHora(evento.horaSalida)}
              </a>
            ) : (
              <span className="text-marca-texto font-bold">{formatearHora(evento.horaSalida)}</span>
            )}
            {evento.fotoSalidaUrl && (
              <a href={evento.fotoSalidaUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex">
                <Camera className="w-3 h-3" />
              </a>
            )}
          </p>
        )}
      </div>

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

export default function EventosDeHoy() {
  const [eventos, setEventos] = useState<EventoDeHoy[]>([]);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    obtenerEventosDeHoyParaMi()
      .then(setEventos)
      .catch(() => setEventos([]))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  if (cargando || eventos.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
        <Calendar className="w-3.5 h-3.5 text-marca-rojoclaro" /> EVENTOS DE HOY
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {eventos.map((e) => (
          <TarjetaEvento key={e.comunicadoId} evento={e} onMarcado={cargar} />
        ))}
      </div>
    </div>
  );
}
