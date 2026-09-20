"use client";

import { useEffect, useRef, useState } from "react";
import { X, Type, AlertTriangle } from "lucide-react";

// Mismo set que el compositor de fotos, para que el emoji rápido sea
// consistente en toda la app.
const EMOJIS_HISTORIA = ["👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐"];
const TEXTO_MAXIMO = 200;

// Se carga con un <link> aparte (no con next/font como el resto de la app)
// para tener un nombre de familia literal que funcione igual en la vista
// previa y al dibujar en el <canvas> -- next/font renombra "Manrope" a un
// nombre interno que <canvas> no puede referenciar.
const FUENTES_HREF =
  "https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Playfair+Display:ital@1&family=Caveat:wght@600&display=swap";

type Fondo = {
  id: string;
  cssBackground: string;
  canvas: { tipo: "solido"; color: string } | { tipo: "degradado"; stops: [string, string] };
  colorTexto: string;
};

const FONDOS: Fondo[] = [
  {
    id: "marca",
    cssBackground: "linear-gradient(160deg,#e23744,#6b1620)",
    canvas: { tipo: "degradado", stops: ["#e23744", "#6b1620"] },
    colorTexto: "#ffffff",
  },
  { id: "oscuro", cssBackground: "#0d0e10", canvas: { tipo: "solido", color: "#0d0e10" }, colorTexto: "#ffffff" },
  {
    id: "morado-rosa",
    cssBackground: "linear-gradient(160deg,#8b5cf6,#ec4899)",
    canvas: { tipo: "degradado", stops: ["#8b5cf6", "#ec4899"] },
    colorTexto: "#ffffff",
  },
  {
    id: "azul-verde",
    cssBackground: "linear-gradient(160deg,#3b82f6,#14b8a6)",
    canvas: { tipo: "degradado", stops: ["#3b82f6", "#14b8a6"] },
    colorTexto: "#ffffff",
  },
  { id: "verde", cssBackground: "#10b981", canvas: { tipo: "solido", color: "#10b981" }, colorTexto: "#ffffff" },
  { id: "ambar", cssBackground: "#fbbf24", canvas: { tipo: "solido", color: "#fbbf24" }, colorTexto: "#3a1f0a" },
  {
    id: "rosa-ambar",
    cssBackground: "linear-gradient(160deg,#ec4899,#fbbf24)",
    canvas: { tipo: "degradado", stops: ["#ec4899", "#fbbf24"] },
    colorTexto: "#3a1f0a",
  },
  { id: "gris", cssBackground: "#1f2937", canvas: { tipo: "solido", color: "#1f2937" }, colorTexto: "#ffffff" },
];

type EstiloTexto = {
  id: string;
  nombre: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  uppercase: boolean;
  letterSpacing?: string;
};

const ESTILOS: EstiloTexto[] = [
  { id: "clasica", nombre: "Clásica", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontStyle: "normal", uppercase: false },
  {
    id: "elegante",
    nombre: "Elegante",
    fontFamily: "'Playfair Display', serif",
    fontWeight: 500,
    fontStyle: "italic",
    uppercase: false,
  },
  {
    id: "impacto",
    nombre: "Impacto",
    fontFamily: "Manrope, sans-serif",
    fontWeight: 800,
    fontStyle: "normal",
    uppercase: true,
    letterSpacing: "-0.5px",
  },
  {
    id: "manuscrita",
    nombre: "Manuscrita",
    fontFamily: "'Caveat', cursive",
    fontWeight: 600,
    fontStyle: "normal",
    uppercase: false,
  },
];

const ANCHO_LIENZO = 1080;
const ALTO_LIENZO = 1350;

function envolverTexto(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string[] {
  const parrafos = texto.split("\n");
  const lineas: string[] = [];
  for (const parrafo of parrafos) {
    if (parrafo === "") {
      lineas.push("");
      continue;
    }
    const palabras = parrafo.split(/\s+/);
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > maxAncho && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
  }
  return lineas;
}

function generarImagenTexto(texto: string, fondo: Fondo, estilo: EstiloTexto): string {
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO_LIENZO;
  canvas.height = ALTO_LIENZO;
  const ctx = canvas.getContext("2d")!;

  if (fondo.canvas.tipo === "solido") {
    ctx.fillStyle = fondo.canvas.color;
  } else {
    const grad = ctx.createLinearGradient(0, 0, ANCHO_LIENZO * 0.25, ALTO_LIENZO);
    grad.addColorStop(0, fondo.canvas.stops[0]);
    grad.addColorStop(1, fondo.canvas.stops[1]);
    ctx.fillStyle = grad;
  }
  ctx.fillRect(0, 0, ANCHO_LIENZO, ALTO_LIENZO);

  const textoFinal = estilo.uppercase ? texto.toUpperCase() : texto;
  const maxAnchoTexto = ANCHO_LIENZO - 160;
  const maxAltoTexto = ALTO_LIENZO - 260;

  let tamano = 96;
  let lineas: string[] = [];
  while (tamano > 30) {
    ctx.font = `${estilo.fontStyle} ${estilo.fontWeight} ${tamano}px ${estilo.fontFamily}`;
    lineas = envolverTexto(ctx, textoFinal, maxAnchoTexto);
    const alturaLinea = tamano * 1.3;
    if (lineas.length * alturaLinea <= maxAltoTexto) break;
    tamano -= 4;
  }

  ctx.font = `${estilo.fontStyle} ${estilo.fontWeight} ${tamano}px ${estilo.fontFamily}`;
  ctx.fillStyle = fondo.colorTexto;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 16;

  const alturaLinea = tamano * 1.3;
  const inicioY = ALTO_LIENZO / 2 - ((lineas.length - 1) * alturaLinea) / 2;
  lineas.forEach((linea, i) => {
    ctx.fillText(linea, ANCHO_LIENZO / 2, inicioY + i * alturaLinea);
  });

  return canvas.toDataURL("image/jpeg", 0.9);
}

function calcularTamanoPreview(longitud: number): number {
  if (longitud <= 20) return 34;
  if (longitud <= 50) return 27;
  if (longitud <= 100) return 22;
  if (longitud <= 160) return 18;
  return 15;
}

export default function ComposerTexto({
  onCancelar,
  onPublicar,
  publicando,
  mensaje,
}: {
  onCancelar: () => void;
  onPublicar: (fotoDataUrl: string) => void;
  publicando: boolean;
  mensaje: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [fondoIndex, setFondoIndex] = useState(0);
  const [estiloIndex, setEstiloIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!document.querySelector(`link[href="${FUENTES_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FUENTES_HREF;
      document.head.appendChild(link);
    }
  }, []);

  const fondo = FONDOS[fondoIndex];
  const estilo = ESTILOS[estiloIndex];

  function agregarEmoji(emoji: string) {
    setTexto((t) => (t.length + emoji.length <= TEXTO_MAXIMO ? t + emoji : t));
    textareaRef.current?.focus();
  }

  function siguienteEstilo() {
    setEstiloIndex((i) => (i + 1) % ESTILOS.length);
  }

  function publicar() {
    const limpio = texto.trim();
    if (!limpio) return;
    const dataUrl = generarImagenTexto(limpio, fondo, estilo);
    onPublicar(dataUrl);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="relative w-full max-w-sm rounded-[10px] overflow-hidden flex flex-col" style={{ height: "min(700px, 90vh)" }}>
        {/* Fondo elegido, a pantalla completa del compositor */}
        <div className="absolute inset-0" style={{ background: fondo.cssBackground }} />

        <div className="relative flex items-center justify-between p-4">
          <button
            onClick={onCancelar}
            disabled={publicando}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: "rgba(0,0,0,0.35)" }}
            aria-label="Cancelar"
          >
            <X className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={siguienteEstilo}
            disabled={publicando}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-black text-white disabled:opacity-40"
            style={{ background: "rgba(0,0,0,0.35)" }}
          >
            <Type className="w-3.5 h-3.5" /> Aa <span className="opacity-70 font-bold">· {estilo.nombre}</span>
          </button>
        </div>

        <div className="relative flex-1 flex items-center justify-center px-8">
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAXIMO))}
            placeholder="Escribe algo..."
            autoFocus
            rows={4}
            className="w-full bg-transparent border-none outline-none resize-none text-center placeholder-white/50"
            style={{
              color: fondo.colorTexto,
              fontFamily: estilo.fontFamily,
              fontWeight: estilo.fontWeight,
              fontStyle: estilo.fontStyle,
              textTransform: estilo.uppercase ? "uppercase" : "none",
              letterSpacing: estilo.letterSpacing,
              fontSize: calcularTamanoPreview(texto.length || 10),
              lineHeight: 1.3,
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          />
        </div>

        <div className="relative flex gap-2 overflow-x-auto px-4 pb-3">
          {EMOJIS_HISTORIA.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => agregarEmoji(emoji)}
              disabled={publicando}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base disabled:opacity-40"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="relative flex gap-2.5 overflow-x-auto px-4 pb-4">
          {FONDOS.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFondoIndex(i)}
              disabled={publicando}
              aria-label={`Fondo ${f.id}`}
              className="shrink-0 w-7 h-7 rounded-full disabled:opacity-40"
              style={{
                background: f.cssBackground,
                border: i === fondoIndex ? "2.5px solid white" : "2px solid rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </div>

        {mensaje && (
          <p className="relative flex items-center gap-1.5 text-white text-[11px] font-bold px-4 pb-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <div className="relative px-4 pb-5">
          <button
            type="button"
            onClick={publicar}
            disabled={publicando || !texto.trim()}
            className="w-full min-h-[48px] rounded-[10px] bg-white text-marca-fondo font-black text-sm disabled:opacity-50"
          >
            {publicando ? "Publicando..." : "Publicar historia"}
          </button>
        </div>
      </div>
    </div>
  );
}
