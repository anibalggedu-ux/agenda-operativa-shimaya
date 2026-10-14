"use client";

import { useRef, useState } from "react";
import { X, AlertTriangle, Camera, UserRound, Images, Type, Video as VideoIcon } from "lucide-react";
import { crearHistoria } from "./actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { esTemporadaHalloween } from "@/lib/fechas";
import { reproducirSonidoAlerta } from "@/lib/sonido";
import ComposerTexto from "./composer-texto";
import RecortarFoto from "./recortar-foto";
import ComposerVideoHistoria from "./composer-video";
import RecortarVideo from "./recortar-video";
import TextareaMenciones from "./textarea-menciones";

// Todo el flujo de "publicar una historia nueva" (cámara/selfie/galería/texto/
// video, con su recorte) vive acá, separado del feed -- así tanto
// HistoriasFeed (el "+" sobre la propia miniatura en la fila de historias)
// como MiPerfil (el "+" sobre la foto de perfil) pueden abrir exactamente el
// mismo compositor sin duplicar esta lógica.

// Mismo set en el compositor (pie de foto) y en las reacciones que deja el
// resto del equipo sobre una historia ya publicada (ver historias-feed.tsx).
const EMOJIS_HISTORIA_BASE = [
  "👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐",
  "😢", "😔",
  "😍", "🤩", "💯", "🙏", "😎", "🥳", "😁", "🤔", "👀",
];
// Solo en octubre (ver esTemporadaHalloween) -- el resto del año no aparecen,
// igual que el resto de la ambientación de temporada de la app.
const EMOJIS_HALLOWEEN = ["🎃", "👻", "🦇", "🕷️"];

export function obtenerEmojisHistoria(): string[] {
  return esTemporadaHalloween() ? [...EMOJIS_HISTORIA_BASE, ...EMOJIS_HALLOWEEN] : EMOJIS_HISTORIA_BASE;
}
const TEXTO_MAXIMO = 200;
// Tope de duración de un video de historia -- ver obtenerDuracionVideo.
const DURACION_MAXIMA_VIDEO_SEG = 30;
// Hasta acá se puede elegir un tramo de 30s (ver RecortarVideo); más largo
// que esto, se pide recortarlo desde la galería del celular -- protege el
// respaldo del servidor de tener que procesar archivos enormes.
const DURACION_MAXIMA_ORIGINAL_SEG = 120;
const TAMANO_MAXIMO_ORIGINAL_BYTES = 250 * 1024 * 1024;

export type ItemPublicar = { foto: string; texto: string };

// Lee la duración real del archivo sin subirlo, para poder rechazar uno
// demasiado largo antes de gastar datos móviles. No se recorta ni
// re-codifica el video en el navegador (sería pesado y poco confiable en
// iOS) -- si dura de más, se avisa y la persona lo recorta desde su galería.
function obtenerDuracionVideo(archivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("No se pudo leer el video."));
    };
    video.src = URL.createObjectURL(archivo);
  });
}

function ComposerHistoria({
  fotos,
  onCancelar,
  onPublicar,
  onCambiarFoto,
  publicando,
  mensaje,
  progresoPublicacion,
}: {
  fotos: string[];
  onCancelar: () => void;
  onPublicar: (items: ItemPublicar[]) => void;
  onCambiarFoto: (indice: number, foto: string) => void;
  publicando: boolean;
  mensaje: string | null;
  progresoPublicacion: { actual: number; total: number } | null;
}) {
  const [indice, setIndice] = useState(0);
  const [textos, setTextos] = useState<string[]>(() => fotos.map(() => ""));
  const [recortando, setRecortando] = useState(false);
  const esMultiple = fotos.length > 1;
  const textoActual = textos[indice] ?? "";

  function cambiarTexto(valor: string) {
    setTextos((prev) => {
      const copia = [...prev];
      copia[indice] = valor.slice(0, TEXTO_MAXIMO);
      return copia;
    });
  }

  function agregarEmoji(emoji: string) {
    setTextos((prev) => {
      const copia = [...prev];
      const actual = copia[indice] ?? "";
      if (actual.length + emoji.length <= TEXTO_MAXIMO) copia[indice] = actual + emoji;
      return copia;
    });
  }

  function publicarTodas() {
    onPublicar(fotos.map((foto, i) => ({ foto, texto: textos[i] ?? "" })));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-bold">
            {esMultiple ? `Nueva historia (${indice + 1}/${fotos.length})` : "Nueva historia"}
          </p>
          <button
            onClick={onCancelar}
            disabled={publicando}
            className="text-white/70 hover:text-white disabled:opacity-40"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {esMultiple && (
          <div className="flex gap-1">
            {fotos.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded ${
                  i === indice ? "bg-marca-rojoclaro" : i < indice ? "bg-white/50" : "bg-white/15"
                }`}
              />
            ))}
          </div>
        )}

        <div className="relative">
          <img
            src={fotos[indice]}
            alt="Foto a publicar"
            className="w-full max-h-[45vh] object-contain rounded-[3px] bg-black"
          />
          <button
            type="button"
            onClick={() => setRecortando(true)}
            disabled={publicando}
            className="absolute top-2 right-2 bg-black/60 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-[3px] hover:bg-black/80 disabled:opacity-40"
          >
            Recortar
          </button>
        </div>

        {recortando && (
          <RecortarFoto
            src={fotos[indice]}
            onCancelar={() => setRecortando(false)}
            onConfirmar={(recortada) => {
              onCambiarFoto(indice, recortada);
              setRecortando(false);
            }}
          />
        )}

        <TextareaMenciones
          value={textoActual}
          onChange={cambiarTexto}
          placeholder="Escribe un pie de foto (opcional)... usa @ para etiquetar a alguien"
          rows={2}
          maxLength={TEXTO_MAXIMO}
          className="w-full bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3 py-2 text-sm text-marca-texto placeholder:text-marca-tenue resize-none"
        />
        <p className="text-right text-[10px] text-marca-tenue -mt-2">{textoActual.length}/{TEXTO_MAXIMO}</p>

        <div className="flex flex-wrap gap-2">
          {obtenerEmojisHistoria().map((emoji) => (
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

        {esMultiple && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={indice === 0 || publicando}
              onClick={() => setIndice((i) => i - 1)}
              className="flex-1 min-h-[40px] border border-marca-borde text-marca-texto text-xs font-bold rounded-[3px] disabled:opacity-40"
            >
              ← Foto anterior
            </button>
            <button
              type="button"
              disabled={indice === fotos.length - 1 || publicando}
              onClick={() => setIndice((i) => i + 1)}
              className="flex-1 min-h-[40px] border border-marca-borde text-marca-texto text-xs font-bold rounded-[3px] disabled:opacity-40"
            >
              Siguiente foto →
            </button>
          </div>
        )}

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <button
          type="button"
          onClick={publicarTodas}
          disabled={publicando}
          className="w-full min-h-[48px] bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-60 text-marca-textofuerte font-black text-sm rounded-[3px] transition"
        >
          {publicando
            ? progresoPublicacion
              ? `Publicando ${progresoPublicacion.actual}/${progresoPublicacion.total}...`
              : "Publicando..."
            : esMultiple
              ? `Publicar ${fotos.length} historias`
              : "Publicar historia"}
        </button>
      </div>
    </div>
  );
}

export default function NuevaHistoriaBoton({
  onPublicado,
  children,
}: {
  // Avisa cuando una historia (o varias) se publicó con éxito -- quien monta
  // este componente decide qué refrescar (el feed, la racha, etc.).
  onPublicado?: () => void;
  children: (ctx: { abrir: () => void; publicando: boolean; mensaje: string | null }) => React.ReactNode;
}) {
  const [borradores, setBorradores] = useState<string[] | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [progresoPublicacion, setProgresoPublicacion] = useState<{ actual: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuVideoAbierto, setMenuVideoAbierto] = useState(false);
  const [modoTexto, setModoTexto] = useState(false);
  const [borradorVideo, setBorradorVideo] = useState<{ archivo: File; previewUrl: string } | null>(null);
  const [videoParaRecortar, setVideoParaRecortar] = useState<{ archivo: File; duracionTotal: number } | null>(null);
  const inputTraseraRef = useRef<HTMLInputElement>(null);
  const inputSelfieRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const inputVideoGrabarRef = useRef<HTMLInputElement>(null);
  const inputVideoGaleriaRef = useRef<HTMLInputElement>(null);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (archivos.length === 0) return;

    if (archivos.length > 10) {
      setMensaje("Puedes elegir hasta 10 fotos a la vez.");
      return;
    }

    setMensaje(null);
    try {
      const fotos = await Promise.all(archivos.map((a) => comprimirFotoComoBase64(a, 1280, 0.75)));
      setBorradores(fotos);
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
    }
  }

  async function handleArchivoVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    setMensaje(null);
    try {
      const duracion = await obtenerDuracionVideo(archivo);
      if (duracion <= DURACION_MAXIMA_VIDEO_SEG + 0.5) {
        setBorradorVideo({ archivo, previewUrl: URL.createObjectURL(archivo) });
        return;
      }
      if (duracion > DURACION_MAXIMA_ORIGINAL_SEG || archivo.size > TAMANO_MAXIMO_ORIGINAL_BYTES) {
        setMensaje(
          `Ese video dura ${Math.round(duracion)} segundos. El máximo para elegir un tramo son ${DURACION_MAXIMA_ORIGINAL_SEG} -- recórtalo desde tu galería antes de subirlo.`
        );
        return;
      }
      setVideoParaRecortar({ archivo, duracionTotal: duracion });
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo leer el video. Prueba con otro archivo.");
    }
  }

  function cancelarVideo() {
    if (borradorVideo) URL.revokeObjectURL(borradorVideo.previewUrl);
    setBorradorVideo(null);
  }

  async function publicar(items: ItemPublicar[]) {
    if (items.length === 0) return;
    setMensaje(null);
    setPublicando(true);
    setProgresoPublicacion(items.length > 1 ? { actual: 0, total: items.length } : null);
    try {
      for (let i = 0; i < items.length; i++) {
        // Sin miniatura: en el plan Hobby de Vercel cada archivo subido
        // gasta una de las ~2.000 operaciones del mes, y las historias son
        // las que más suben después de las marcaciones.
        const resultado = await crearHistoria(items[i].foto, items[i].texto);
        if (!resultado.exito) {
          reproducirSonidoAlerta();
          setMensaje(
            items.length > 1
              ? resultado.mensaje || `No se pudo publicar la foto ${i + 1} de ${items.length}.`
              : resultado.mensaje || "No se pudo publicar la foto."
          );
          return;
        }
        if (items.length > 1) setProgresoPublicacion({ actual: i + 1, total: items.length });
      }
      setBorradores(null);
      onPublicado?.();
    } catch (err: any) {
      reproducirSonidoAlerta();
      setMensaje(err?.message || "No se pudo publicar la foto.");
    } finally {
      setPublicando(false);
      setProgresoPublicacion(null);
    }
  }

  async function publicarTexto(fotoDataUrl: string) {
    setMensaje(null);
    setPublicando(true);
    try {
      const resultado = await crearHistoria(fotoDataUrl);
      if (resultado.exito) {
        setModoTexto(false);
        onPublicado?.();
      } else {
        reproducirSonidoAlerta();
        setMensaje(resultado.mensaje || "No se pudo publicar la historia.");
      }
    } catch (err: any) {
      reproducirSonidoAlerta();
      setMensaje(err?.message || "No se pudo publicar la historia.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <>
      {children({ abrir: () => setMenuAbierto(true), publicando, mensaje })}

      <input
        ref={inputTraseraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleArchivo}
      />
      <input
        ref={inputSelfieRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleArchivo}
      />
      <input
        ref={inputGaleriaRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleArchivo}
      />
      <input
        ref={inputVideoGrabarRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleArchivoVideo}
      />
      <input
        ref={inputVideoGaleriaRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleArchivoVideo}
      />

      {menuAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setMenuAbierto(false)}
        >
          <div
            className="relative w-full max-w-sm bg-marca-superficie2 border-t border-marca-borde rounded-t-2xl"
            style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-3">
              <span className="w-9 h-1 rounded-full bg-marca-borde" />
            </div>

            <div className="flex items-center justify-between px-5 pb-5">
              <span className="w-5" />
              <p className="text-marca-textofuerte text-sm font-black">Nueva historia</p>
              <button
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar"
                className="text-marca-tenue hover:text-marca-texto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-around px-2">
              <button
                type="button"
                onClick={() => {
                  setMenuAbierto(false);
                  inputTraseraRef.current?.click();
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <Camera className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Cámara</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuAbierto(false);
                  inputSelfieRef.current?.click();
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <UserRound className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Selfie</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuAbierto(false);
                  setMensaje(null);
                  setModoTexto(true);
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <Type className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Texto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuAbierto(false);
                  inputGaleriaRef.current?.click();
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <Images className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Galería</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuAbierto(false);
                  setMensaje(null);
                  setMenuVideoAbierto(true);
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <VideoIcon className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Video</span>
              </button>
            </div>

            <p className="text-marca-tenue text-[10.5px] text-center px-8 pt-5">
              En Galería puedes elegir varias fotos a la vez. Un video se publica hasta {DURACION_MAXIMA_VIDEO_SEG} segundos -- si dura más, eliges qué tramo usar.
            </p>
          </div>
        </div>
      )}

      {menuVideoAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setMenuVideoAbierto(false)}
        >
          <div
            className="relative w-full max-w-sm bg-marca-superficie2 border-t border-marca-borde rounded-t-2xl"
            style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-3">
              <span className="w-9 h-1 rounded-full bg-marca-borde" />
            </div>

            <div className="flex items-center justify-between px-5 pb-5">
              <span className="w-5" />
              <p className="text-marca-textofuerte text-sm font-black">Nuevo video</p>
              <button
                onClick={() => setMenuVideoAbierto(false)}
                aria-label="Cerrar"
                className="text-marca-tenue hover:text-marca-texto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-around px-2">
              <button
                type="button"
                onClick={() => {
                  setMenuVideoAbierto(false);
                  inputVideoGrabarRef.current?.click();
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <Camera className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">Grabar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuVideoAbierto(false);
                  inputVideoGaleriaRef.current?.click();
                }}
                className="flex flex-col items-center gap-2"
              >
                <span className="w-14 h-14 rounded-full bg-marca-superficie border border-marca-borde flex items-center justify-center text-marca-rojoclaro">
                  <Images className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-marca-texto font-bold">De galería</span>
              </button>
            </div>

            <p className="text-marca-tenue text-[10.5px] text-center px-8 pt-5">
              Se publican hasta {DURACION_MAXIMA_VIDEO_SEG} segundos -- si dura más, eliges qué tramo usar.
            </p>
          </div>
        </div>
      )}

      {videoParaRecortar && (
        <RecortarVideo
          archivo={videoParaRecortar.archivo}
          duracionTotal={videoParaRecortar.duracionTotal}
          onCancelar={() => setVideoParaRecortar(null)}
          onPublicado={() => {
            setVideoParaRecortar(null);
            onPublicado?.();
          }}
        />
      )}

      {borradorVideo && (
        <ComposerVideoHistoria
          archivo={borradorVideo.archivo}
          previewUrl={borradorVideo.previewUrl}
          onCancelar={cancelarVideo}
          onPublicado={() => {
            cancelarVideo();
            onPublicado?.();
          }}
        />
      )}

      {borradores && (
        <ComposerHistoria
          fotos={borradores}
          onCambiarFoto={(i, foto) =>
            setBorradores((prev) => (prev ? prev.map((f, idx) => (idx === i ? foto : f)) : prev))
          }
          onCancelar={() => {
            setBorradores(null);
            setMensaje(null);
          }}
          onPublicar={publicar}
          publicando={publicando}
          mensaje={mensaje}
          progresoPublicacion={progresoPublicacion}
        />
      )}

      {modoTexto && (
        <ComposerTexto
          onCancelar={() => {
            setModoTexto(false);
            setMensaje(null);
          }}
          onPublicar={publicarTexto}
          publicando={publicando}
          mensaje={mensaje}
        />
      )}
    </>
  );
}
