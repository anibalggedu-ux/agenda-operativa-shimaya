"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, AlertTriangle, Trash2 } from "lucide-react";
import { obtenerFeedHistorias, crearHistoria, eliminarHistoria, type GrupoHistorias } from "./actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";

// Mismo set en el compositor (pie de foto) y, más adelante, en las
// reacciones que deja el resto del equipo sobre una historia ya publicada.
const EMOJIS_HISTORIA = ["👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐"];
const TEXTO_MAXIMO = 200;

function VisorHistorias({
  grupo,
  indiceInicial,
  miUsuarioId,
  onCerrar,
  onEliminada,
}: {
  grupo: GrupoHistorias;
  indiceInicial: number;
  miUsuarioId: string;
  onCerrar: () => void;
  onEliminada: () => void;
}) {
  const [indice, setIndice] = useState(indiceInicial);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const historia = grupo.historias[indice];
  const esPropia = grupo.usuarioId === miUsuarioId;

  async function confirmarBorrado() {
    setEliminando(true);
    setMensaje(null);
    const resultado = await eliminarHistoria(historia.id);
    if (resultado.exito) {
      onEliminada();
    } else {
      setMensaje(resultado.mensaje || "No se pudo borrar la foto.");
      setEliminando(false);
      setConfirmando(false);
    }
  }

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
          <div className="flex items-center gap-3">
            {esPropia && (
              <button
                onClick={() => setConfirmando(true)}
                className="text-white/70 hover:text-marca-rojoclaro"
                aria-label="Borrar esta foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onCerrar} className="text-white/70 hover:text-white" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <img
            src={historia.url}
            alt={`Historia de ${grupo.nombre}`}
            className="w-full max-h-[70vh] object-contain rounded-[3px] bg-black"
          />
          {historia.texto && (
            <p className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-white text-sm font-semibold px-3 pt-6 pb-3 rounded-b-[3px]">
              {historia.texto}
            </p>
          )}

          {confirmando && (
            <div
              className="absolute inset-0 bg-black/85 flex items-center justify-center rounded-[3px] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-marca-superficie2 border border-marca-borde rounded-[3px] p-4 space-y-3 max-w-xs text-center">
                <p className="text-marca-texto text-sm font-bold">¿Borrar esta foto?</p>
                <p className="text-marca-tenue text-xs">Se elimina para todo el equipo y no se puede deshacer.</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={eliminando}
                    className="flex-1 min-h-[40px] border border-marca-borde text-marca-texto text-xs font-bold rounded-[3px] disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarBorrado}
                    disabled={eliminando}
                    className="flex-1 min-h-[40px] bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte text-xs font-black rounded-[3px] disabled:opacity-60"
                  >
                    {eliminando ? "Borrando..." : "Sí, borrar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

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

function ComposerHistoria({
  foto,
  onCancelar,
  onPublicar,
  publicando,
  mensaje,
}: {
  foto: string;
  onCancelar: () => void;
  onPublicar: (texto: string) => void;
  publicando: boolean;
  mensaje: string | null;
}) {
  const [texto, setTexto] = useState("");

  function agregarEmoji(emoji: string) {
    setTexto((t) => (t.length + emoji.length <= TEXTO_MAXIMO ? t + emoji : t));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-bold">Nueva historia</p>
          <button
            onClick={onCancelar}
            disabled={publicando}
            className="text-white/70 hover:text-white disabled:opacity-40"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <img src={foto} alt="Foto a publicar" className="w-full max-h-[50vh] object-contain rounded-[3px] bg-black" />

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAXIMO))}
          placeholder="Escribe un pie de foto (opcional)..."
          rows={2}
          className="w-full bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3 py-2 text-sm text-marca-texto placeholder:text-marca-tenue resize-none"
        />
        <p className="text-right text-[10px] text-marca-tenue -mt-2">{texto.length}/{TEXTO_MAXIMO}</p>

        <div className="flex flex-wrap gap-2">
          {EMOJIS_HISTORIA.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => agregarEmoji(emoji)}
              className="w-9 h-9 flex items-center justify-center text-lg bg-marca-superficie2 border border-marca-borde rounded-full hover:border-marca-rojoclaro transition"
            >
              {emoji}
            </button>
          ))}
        </div>

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <button
          type="button"
          onClick={() => onPublicar(texto)}
          disabled={publicando}
          className="w-full min-h-[48px] bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-60 text-marca-textofuerte font-black text-sm rounded-[3px] transition"
        >
          {publicando ? "Publicando..." : "Publicar historia"}
        </button>
      </div>
    </div>
  );
}

export default function HistoriasFeed({ miUsuarioId }: { miUsuarioId: string }) {
  const [grupos, setGrupos] = useState<GrupoHistorias[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrador, setBorrador] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
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
      const foto = await comprimirFotoComoBase64(archivo, 1280, 0.75);
      setBorrador(foto);
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
    }
  }

  async function publicar(texto: string) {
    if (!borrador) return;
    setMensaje(null);
    setPublicando(true);
    try {
      const resultado = await crearHistoria(borrador, texto);
      if (resultado.exito) {
        setBorrador(null);
        cargar();
      } else {
        setMensaje(resultado.mensaje || "No se pudo publicar la foto.");
      }
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo publicar la foto.");
    } finally {
      setPublicando(false);
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
          className="shrink-0 flex flex-col items-center gap-1 w-16"
        >
          <span className="w-14 h-14 rounded-full border-2 border-dashed border-marca-rojo/50 flex items-center justify-center text-marca-rojoclaro">
            <Plus className="w-5 h-5" />
          </span>
          <span className="text-[10px] text-marca-tenue truncate w-full text-center">Publicar</span>
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

      {mensaje && !borrador && (
        <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
        </p>
      )}

      {grupos.length === 0 && (
        <p className="text-marca-tenue text-[11px]">Nadie ha publicado historias todavía — sé el primero.</p>
      )}

      {borrador && (
        <ComposerHistoria
          foto={borrador}
          onCancelar={() => {
            setBorrador(null);
            setMensaje(null);
          }}
          onPublicar={publicar}
          publicando={publicando}
          mensaje={mensaje}
        />
      )}

      {visor && (
        <VisorHistorias
          grupo={visor.grupo}
          indiceInicial={visor.indice}
          miUsuarioId={miUsuarioId}
          onCerrar={() => setVisor(null)}
          onEliminada={() => {
            setVisor(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
