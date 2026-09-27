"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

const TAMANO_MINIMO = 40;
const ANCHO_MAXIMO_CAJA = 340;
const ALTO_MAXIMO_CAJA = 420;

type Rect = { x: number; y: number; w: number; h: number };
type Asa = "nw" | "ne" | "sw" | "se" | null;

// Recorte manual simple, sin librería: la foto se dibuja del tamaño exacto
// de la caja visible (sin letterboxing) para que el rectángulo de recorte
// mapee 1 a 1 a coordenadas de pantalla, y al confirmar se escala de vuelta
// a los píxeles reales de la imagen con un canvas.
export default function RecortarFoto({
  src,
  onCancelar,
  onConfirmar,
}: {
  src: string;
  onCancelar: () => void;
  onConfirmar: (recortada: string) => void;
}) {
  const [dims, setDims] = useState<{ ancho: number; alto: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [procesando, setProcesando] = useState(false);
  const naturalRef = useRef({ ancho: 0, alto: 0 });
  const arrastreRef = useRef<{ modo: "mover" | "asa"; asa: Asa; x0: number; y0: number; rect0: Rect } | null>(null);

  function alCargarImagen(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    naturalRef.current = { ancho: img.naturalWidth, alto: img.naturalHeight };

    let ancho = Math.min(ANCHO_MAXIMO_CAJA, img.naturalWidth);
    let alto = (ancho * img.naturalHeight) / img.naturalWidth;
    if (alto > ALTO_MAXIMO_CAJA) {
      alto = ALTO_MAXIMO_CAJA;
      ancho = (alto * img.naturalWidth) / img.naturalHeight;
    }
    setDims({ ancho, alto });
    // Recorte inicial: 90% centrado, para que se note al tiro que se puede
    // ajustar sin partir de un cuadro que ya recorta de más.
    const w = ancho * 0.9;
    const h = alto * 0.9;
    setRect({ x: (ancho - w) / 2, y: (alto - h) / 2, w, h });
  }

  function clamp(r: Rect, ancho: number, alto: number): Rect {
    const w = Math.max(TAMANO_MINIMO, Math.min(r.w, ancho));
    const h = Math.max(TAMANO_MINIMO, Math.min(r.h, alto));
    const x = Math.max(0, Math.min(r.x, ancho - w));
    const y = Math.max(0, Math.min(r.y, alto - h));
    return { x, y, w, h };
  }

  function alPresionarMover(e: React.PointerEvent) {
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { modo: "mover", asa: null, x0: e.clientX, y0: e.clientY, rect0: rect };
  }

  function alPresionarAsa(asa: Asa) {
    return (e: React.PointerEvent) => {
      if (!rect) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      arrastreRef.current = { modo: "asa", asa, x0: e.clientX, y0: e.clientY, rect0: rect };
    };
  }

  function alMover(e: React.PointerEvent) {
    const arr = arrastreRef.current;
    if (!arr || !dims) return;
    const dx = e.clientX - arr.x0;
    const dy = e.clientY - arr.y0;

    if (arr.modo === "mover") {
      setRect(clamp({ ...arr.rect0, x: arr.rect0.x + dx, y: arr.rect0.y + dy }, dims.ancho, dims.alto));
      return;
    }

    const r0 = arr.rect0;
    let nuevo: Rect = { ...r0 };
    if (arr.asa === "se") {
      nuevo = { x: r0.x, y: r0.y, w: r0.w + dx, h: r0.h + dy };
    } else if (arr.asa === "sw") {
      nuevo = { x: r0.x + dx, y: r0.y, w: r0.w - dx, h: r0.h + dy };
    } else if (arr.asa === "ne") {
      nuevo = { x: r0.x, y: r0.y + dy, w: r0.w + dx, h: r0.h - dy };
    } else if (arr.asa === "nw") {
      nuevo = { x: r0.x + dx, y: r0.y + dy, w: r0.w - dx, h: r0.h - dy };
    }
    setRect(clamp(nuevo, dims.ancho, dims.alto));
  }

  function alSoltar() {
    arrastreRef.current = null;
  }

  async function confirmar() {
    if (!rect || !dims) return;
    setProcesando(true);
    try {
      const escalaX = naturalRef.current.ancho / dims.ancho;
      const escalaY = naturalRef.current.alto / dims.alto;
      const sx = rect.x * escalaX;
      const sy = rect.y * escalaY;
      const sw = rect.w * escalaX;
      const sh = rect.h * escalaY;

      const img = new Image();
      img.src = src;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("No se pudo recortar la foto."));
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo recortar la foto.");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onConfirmar(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      onConfirmar(src);
    } finally {
      setProcesando(false);
    }
  }

  const asas: { clave: Asa; clase: string }[] = [
    { clave: "nw", clase: "-top-2 -left-2 cursor-nwse-resize" },
    { clave: "ne", clase: "-top-2 -right-2 cursor-nesw-resize" },
    { clave: "sw", clase: "-bottom-2 -left-2 cursor-nesw-resize" },
    { clave: "se", clase: "-bottom-2 -right-2 cursor-nwse-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4 gap-4">
      <p className="text-white text-sm font-bold">Recortar foto</p>

      <div
        className="relative touch-none select-none overflow-hidden"
        style={dims ? { width: dims.ancho, height: dims.alto } : undefined}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
      >
        <img src={src} alt="" onLoad={alCargarImagen} className="block" style={dims ? { width: dims.ancho, height: dims.alto } : { display: "none" }} />
        {dims && rect && (
          <div
            className="absolute ring-2 ring-white cursor-move"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            }}
            onPointerDown={alPresionarMover}
          >
            {asas.map((a) => (
              <div
                key={a.clave}
                onPointerDown={alPresionarAsa(a.clave)}
                className={`absolute w-4 h-4 bg-white rounded-full border-2 border-marca-rojo ${a.clase}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onCancelar}
          disabled={procesando}
          className="flex-1 min-h-[44px] border border-white/25 text-white text-xs font-bold rounded-[3px] flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={confirmar}
          disabled={procesando || !rect}
          className="flex-1 min-h-[44px] bg-marca-rojo hover:bg-marca-rojoclaro text-white text-xs font-bold rounded-[3px] flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> {procesando ? "Recortando..." : "Listo"}
        </button>
      </div>
    </div>
  );
}
