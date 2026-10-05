"use client";

import { useState } from "react";
import { X, AlertTriangle, Send } from "lucide-react";
import { publicarVideoDirecto } from "./subir-video";
import TextareaMenciones from "./textarea-menciones";

const EMOJIS_HISTORIA = ["👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐"];
const TEXTO_MAXIMO = 200;

export default function ComposerVideoHistoria({
  archivo,
  previewUrl,
  onCancelar,
  onPublicado,
}: {
  archivo: File;
  previewUrl: string;
  onCancelar: () => void;
  onPublicado: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function agregarEmoji(emoji: string) {
    setTexto((t) => (t.length + emoji.length <= TEXTO_MAXIMO ? t + emoji : t));
  }

  async function publicar() {
    setMensaje(null);
    setPublicando(true);
    setProgreso(0);
    try {
      await publicarVideoDirecto(archivo, archivo.type || "video/mp4", texto.trim(), setProgreso);
      onPublicado();
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo publicar el video.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-bold">Nuevo video</p>
          <button
            onClick={onCancelar}
            disabled={publicando}
            className="text-white/70 hover:text-white disabled:opacity-40"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <video src={previewUrl} controls playsInline className="w-full max-h-[45vh] rounded-[3px] bg-black" />

        <TextareaMenciones
          value={texto}
          onChange={setTexto}
          placeholder="Escribe un pie de foto (opcional)... usa @ para etiquetar a alguien"
          rows={2}
          maxLength={TEXTO_MAXIMO}
          disabled={publicando}
          className="w-full bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3 py-2 text-sm text-marca-texto placeholder:text-marca-tenue resize-none disabled:opacity-60"
        />
        <p className="text-right text-[10px] text-marca-tenue -mt-2">
          {texto.length}/{TEXTO_MAXIMO}
        </p>

        <div className="flex flex-wrap gap-2">
          {EMOJIS_HISTORIA.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => agregarEmoji(emoji)}
              disabled={publicando}
              className="w-9 h-9 flex items-center justify-center text-lg bg-marca-superficie2 border border-marca-borde rounded-full hover:border-marca-rojoclaro transition disabled:opacity-40"
            >
              {emoji}
            </button>
          ))}
        </div>

        {publicando && (
          <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
            <div className="h-full bg-marca-rojo transition-[width]" style={{ width: `${Math.round(progreso * 100)}%` }} />
          </div>
        )}

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <button
          type="button"
          onClick={publicar}
          disabled={publicando}
          className="w-full min-h-[48px] bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-white font-black text-sm rounded-[3px] flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />{" "}
          {publicando ? (progreso > 0 ? `Subiendo... ${Math.round(progreso * 100)}%` : "Preparando...") : "Publicar video"}
        </button>
      </div>
    </div>
  );
}
