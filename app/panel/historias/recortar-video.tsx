"use client";

import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, Send } from "lucide-react";
import { recortarVideoEnNavegador } from "@/lib/recortar-video-cliente";
import { publicarVideoDirecto, subirVideoOriginalParaRecorte, pedirRecorteEnServidor } from "./subir-video";

const EMOJIS_HISTORIA = ["👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐"];
const TEXTO_MAXIMO = 200;
const DURACION_MAXIMA_VIDEO_SEG = 30;

function formatSeg(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Para un video más largo de 30 segundos: se elige qué tramo de hasta 30s
// usar (arrastrando el bloque sobre la línea de tiempo, como en WhatsApp) y
// se intenta recortar ahí mismo en el celular; si el navegador no puede
// (algunos iPhone viejos), se manda el original completo al servidor para
// que lo recorte allá -- ver subir-video.ts y /api/historias/recortar-video.
export default function RecortarVideo({
  archivo,
  duracionTotal,
  onCancelar,
  onPublicado,
}: {
  archivo: File;
  duracionTotal: number;
  onCancelar: () => void;
  onPublicado: () => void;
}) {
  const ventana = Math.min(DURACION_MAXIMA_VIDEO_SEG, duracionTotal);
  const [inicio, setInicio] = useState(0);
  const fin = Math.min(inicio + ventana, duracionTotal);

  const [texto, setTexto] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [estado, setEstado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const previewUrlRef = useRef<string>();
  if (!previewUrlRef.current) previewUrlRef.current = URL.createObjectURL(archivo);
  const previewUrl = previewUrlRef.current;

  const videoRef = useRef<HTMLVideoElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const arrastrandoRef = useRef(false);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = inicio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moverInicio(nuevoInicio: number) {
    const limitado = Math.max(0, Math.min(nuevoInicio, duracionTotal - ventana));
    setInicio(limitado);
    if (videoRef.current) videoRef.current.currentTime = limitado;
  }

  function alSoltar(e: React.PointerEvent) {
    arrastrandoRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function alArrastrar(e: React.PointerEvent) {
    if (!arrastrandoRef.current || !barraRef.current || duracionTotal <= 0) return;
    const rect = barraRef.current.getBoundingClientRect();
    const deltaSeg = (e.movementX / rect.width) * duracionTotal;
    moverInicio(inicio + deltaSeg);
  }

  function agregarEmoji(emoji: string) {
    setTexto((t) => (t.length + emoji.length <= TEXTO_MAXIMO ? t + emoji : t));
  }

  async function publicar() {
    setMensaje(null);
    setPublicando(true);
    setProgreso(0);
    const textoLimpio = texto.trim();
    try {
      let recortadoEnCelular = false;
      setEstado("Recortando en tu celular...");
      try {
        const recortado = await recortarVideoEnNavegador(archivo, inicio, fin);
        setEstado("Subiendo...");
        await publicarVideoDirecto(recortado, recortado.type || "video/webm", textoLimpio, setProgreso);
        recortadoEnCelular = true;
      } catch {
        // El celular no pudo recortarlo directo -- se sigue con el
        // respaldo del servidor, sin mostrarlo como un error real.
      }

      if (!recortadoEnCelular) {
        setEstado("Tu celular no puede recortarlo directo -- lo vamos a procesar en el servidor (tarda un poco más)...");
        setProgreso(0);
        const blobPath = await subirVideoOriginalParaRecorte(archivo, archivo.type || "video/mp4", setProgreso);
        setEstado("Recortando en el servidor...");
        await pedirRecorteEnServidor(blobPath, inicio, fin, textoLimpio);
      }

      onPublicado();
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo publicar el video.");
    } finally {
      setPublicando(false);
      setEstado(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-bold">Elige qué parte usar</p>
          <button
            onClick={onCancelar}
            disabled={publicando}
            className="text-white/70 hover:text-white disabled:opacity-40"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <video ref={videoRef} src={previewUrl} muted playsInline className="w-full max-h-[35vh] rounded-[3px] bg-black" />

        <div className="space-y-1.5">
          <div
            ref={barraRef}
            className="relative h-4 bg-white/15 rounded-full touch-none select-none"
            onPointerMove={alArrastrar}
            onPointerUp={alSoltar}
          >
            <div
              className="absolute top-0 h-4 bg-marca-rojo rounded-full cursor-grab active:cursor-grabbing"
              style={{
                left: `${(inicio / duracionTotal) * 100}%`,
                width: `${(ventana / duracionTotal) * 100}%`,
              }}
              onPointerDown={(e) => {
                arrastrandoRef.current = true;
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
          </div>
          <p className="text-center text-marca-tenue text-[11px] font-bold">
            {formatSeg(inicio)} – {formatSeg(fin)} de {formatSeg(duracionTotal)} · arrastra para elegir el tramo
          </p>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAXIMO))}
          placeholder="Escribe un pie de foto (opcional)..."
          rows={2}
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
          <div className="space-y-1.5">
            {estado && <p className="text-marca-tenue text-[11px]">{estado}</p>}
            <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div className="h-full bg-marca-rojo transition-[width]" style={{ width: `${Math.round(progreso * 100)}%` }} />
            </div>
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
          <Send className="w-4 h-4" /> {publicando ? "Publicando..." : "Publicar video"}
        </button>
      </div>
    </div>
  );
}
