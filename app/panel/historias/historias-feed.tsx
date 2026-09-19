"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { obtenerFeedHistorias, crearHistoria, type GrupoHistorias } from "./actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";

function VisorHistorias({
  grupo,
  indiceInicial,
  onCerrar,
}: {
  grupo: GrupoHistorias;
  indiceInicial: number;
  onCerrar: () => void;
}) {
  const [indice, setIndice] = useState(indiceInicial);
  const historia = grupo.historias[indice];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 mb-2">
          {grupo.historias.map((_, i) => (
            <span
              key={i}
              className={`h-0.5 flex-1 rounded ${i <= indice ? "bg-marca-rojoclaro" : "bg-white/25"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-white text-sm font-bold">
            {grupo.nombre} <span className="text-white/50 font-normal text-xs capitalize">· {grupo.rol}</span>
          </p>
          <button onClick={onCerrar} className="text-white/70 hover:text-white" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <img
          src={historia.url}
          alt={`Historia de ${grupo.nombre}`}
          className="w-full max-h-[70vh] object-contain rounded-[3px] bg-black"
        />

        <div className="flex justify-between mt-2 text-xs font-bold">
          <button
            disabled={indice === 0}
            onClick={() => setIndice((i) => i - 1)}
            className="text-white/70 hover:text-white disabled:opacity-30 disabled:hover:text-white/70"
          >
            ← Anterior
          </button>
          <button
            disabled={indice === grupo.historias.length - 1}
            onClick={() => setIndice((i) => i + 1)}
            className="text-white/70 hover:text-white disabled:opacity-30 disabled:hover:text-white/70"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoriasFeed() {
  const [grupos, setGrupos] = useState<GrupoHistorias[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ grupo: GrupoHistorias; indice: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function cargar() {
    obtenerFeedHistorias()
      .then(setGrupos)
      .catch(() => setGrupos([]))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    setMensaje(null);
    try {
      setSubiendo(true);
      const foto = await comprimirFotoComoBase64(archivo, 1280, 0.75);
      const resultado = await crearHistoria(foto);
      if (resultado.exito) {
        cargar();
      } else {
        setMensaje(resultado.mensaje || "No se pudo publicar la foto.");
      }
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  if (cargando) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">HISTORIAS DEL EQUIPO</h3>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleArchivo}
      />

      <div className="flex gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="shrink-0 flex flex-col items-center gap-1 w-16"
        >
          <span className="w-14 h-14 rounded-full border-2 border-dashed border-marca-rojo/50 flex items-center justify-center text-marca-rojoclaro disabled:opacity-60">
            {subiendo ? "…" : <Plus className="w-5 h-5" />}
          </span>
          <span className="text-[10px] text-marca-tenue truncate w-full text-center">
            {subiendo ? "Subiendo" : "Publicar"}
          </span>
        </button>

        {grupos.map((g) => (
          <button
            key={g.usuarioId}
            type="button"
            onClick={() => setVisor({ grupo: g, indice: g.historias.length - 1 })}
            className="shrink-0 flex flex-col items-center gap-1 w-16"
          >
            <span className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-marca-rojo to-marca-rojoclaro">
              <span
                className="block w-full h-full rounded-full bg-cover bg-center border-2 border-marca-fondo"
                style={{ backgroundImage: `url(${g.historias[g.historias.length - 1].url})` }}
              />
            </span>
            <span className="text-[10px] text-marca-texto truncate w-full text-center">
              {g.nombre.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {mensaje && (
        <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
        </p>
      )}

      {grupos.length === 0 && (
        <p className="text-marca-tenue text-[11px]">Nadie ha publicado historias todavía — sé el primero.</p>
      )}

      {visor && (
        <VisorHistorias grupo={visor.grupo} indiceInicial={visor.indice} onCerrar={() => setVisor(null)} />
      )}
    </div>
  );
}
