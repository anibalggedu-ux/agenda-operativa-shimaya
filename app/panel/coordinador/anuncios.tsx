"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerComunicados,
  crearComunicado,
  eliminarComunicado,
  type Comunicado,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const estadoInicial: ResultadoAccion = { exito: false };

function BotonPublicar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Publicando..." : "Publicar anuncio"}
    </button>
  );
}

function TarjetaAnuncio({
  c,
  onEliminar,
}: {
  c: Comunicado;
  onEliminar: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-start justify-between bg-marca-superficie border rounded-[3px] p-4 ${
        c.vigente ? "border-marca-borde" : "border-marca-borde/50 opacity-60"
      }`}
    >
      <div className="min-w-0">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
          {c.tipo}
        </p>
        <p className="text-marca-textofuerte text-sm mt-1">{c.mensaje}</p>
        {c.fechaEvento && (
          <p className="text-marca-textofuerte text-[11px] font-bold mt-2">
            📅 Evento: {formatearFechaLegible(c.fechaEvento)}
          </p>
        )}
        {c.ubicacion && (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-marca-tenue hover:text-marca-textofuerte underline text-[11px] font-bold mt-1"
          >
            📍 {c.ubicacion} — Ver en Maps
          </a>
        )}
        <p className="text-marca-tenue text-[11px] capitalize mt-2">
          {formatearFechaLegible(c.fecha)}
          {c.autor ? " · " + c.autor : ""}
        </p>
      </div>
      <button
        onClick={() => onEliminar(c.id)}
        className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0 ml-3"
      >
        Eliminar
      </button>
    </div>
  );
}

export default function Anuncios() {
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const [estado, formAction] = useFormState(crearComunicado, estadoInicial);

  function cargar() {
    setCargando(true);
    obtenerComunicados()
      .then(setComunicados)
      .catch((e) => setError(e.message || "Error al cargar anuncios."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (estado.exito) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    await eliminarComunicado(id);
    setComunicados((prev) => prev.filter((c) => c.id !== id));
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando anuncios...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  const vigentes = comunicados.filter((c) => c.vigente);
  const historicos = comunicados.filter((c) => !c.vigente);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          NUEVO ANUNCIO
        </h3>

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Tipo
          </label>
          <input
            name="tipo"
            required
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            placeholder="Ej: Reunión, Aviso general, Cumpleaños..."
          />
        </div>

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Mensaje
          </label>
          <textarea
            name="mensaje"
            required
            rows={3}
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            placeholder="Escribe el anuncio..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Fecha del evento (opcional)
            </label>
            <input
              type="date"
              name="fechaEvento"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            />
            <p className="text-marca-tenue text-[10px] mt-1">
              Si la pones, el anuncio desaparece automáticamente al día siguiente del evento
              (queda guardado como histórico).
            </p>
          </div>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Ubicación exacta (opcional)
            </label>
            <input
              name="ubicacion"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Ej: Av 28 de julio 1445, Miraflores"
            />
            <p className="text-marca-tenue text-[10px] mt-1">
              Se mostrará como link directo a Google Maps.
            </p>
          </div>
        </div>

        <BotonPublicar />

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
          ANUNCIOS VIGENTES ({vigentes.length})
        </h3>
        {vigentes.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">No hay anuncios vigentes.</p>
        ) : (
          <div className="space-y-2">
            {vigentes.map((c) => (
              <TarjetaAnuncio key={c.id} c={c} onEliminar={handleEliminar} />
            ))}
          </div>
        )}
      </div>

      {historicos.length > 0 && (
        <div>
          <button
            onClick={() => setVerHistorico((v) => !v)}
            className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase tracking-widest mb-3"
          >
            {verHistorico ? "▾" : "▸"} Histórico de eventos vencidos ({historicos.length})
          </button>
          {verHistorico && (
            <div className="space-y-2">
              {historicos.map((c) => (
                <TarjetaAnuncio key={c.id} c={c} onEliminar={handleEliminar} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
