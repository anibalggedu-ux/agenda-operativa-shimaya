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
      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
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
      className={`flex items-start justify-between bg-[#0f111a] border rounded-xl p-4 ${
        c.vigente ? "border-slate-800" : "border-slate-800/50 opacity-60"
      }`}
    >
      <div className="min-w-0">
        <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">
          {c.tipo}
        </p>
        <p className="text-white text-sm mt-1">{c.mensaje}</p>
        {c.fechaEvento && (
          <p className="text-cyan-400 text-[11px] font-bold mt-2">
            📅 Evento: {formatearFechaLegible(c.fechaEvento)}
          </p>
        )}
        {c.ubicacion && (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-cyan-400 hover:text-cyan-300 underline text-[11px] font-bold mt-1"
          >
            📍 {c.ubicacion} — Ver en Maps
          </a>
        )}
        <p className="text-slate-500 text-[11px] capitalize mt-2">
          {formatearFechaLegible(c.fecha)}
          {c.autor ? " · " + c.autor : ""}
        </p>
      </div>
      <button
        onClick={() => onEliminar(c.id)}
        className="text-red-400 hover:text-red-300 text-[11px] font-bold uppercase shrink-0 ml-3"
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
    return <p className="text-slate-500 text-sm animate-pulse">Cargando anuncios...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  const vigentes = comunicados.filter((c) => c.vigente);
  const historicos = comunicados.filter((c) => !c.vigente);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-[#0f111a] border-2 border-red-500/30 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-slate-300">
          NUEVO ANUNCIO
        </h3>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Tipo
          </label>
          <input
            name="tipo"
            required
            className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            placeholder="Ej: Reunión, Aviso general, Cumpleaños..."
          />
        </div>

        <div>
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Mensaje
          </label>
          <textarea
            name="mensaje"
            required
            rows={3}
            className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            placeholder="Escribe el anuncio..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Fecha del evento (opcional)
            </label>
            <input
              type="date"
              name="fechaEvento"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
            />
            <p className="text-slate-600 text-[10px] mt-1">
              Si la pones, el anuncio desaparece automáticamente al día siguiente del evento
              (queda guardado como histórico).
            </p>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
              Ubicación exacta (opcional)
            </label>
            <input
              name="ubicacion"
              className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500"
              placeholder="Ej: Av 28 de julio 1445, Miraflores"
            />
            <p className="text-slate-600 text-[10px] mt-1">
              Se mostrará como link directo a Google Maps.
            </p>
          </div>
        </div>

        <BotonPublicar />

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
          ANUNCIOS VIGENTES ({vigentes.length})
        </h3>
        {vigentes.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No hay anuncios vigentes.</p>
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
            className="text-slate-500 hover:text-slate-300 text-[11px] font-bold uppercase tracking-widest mb-3"
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
