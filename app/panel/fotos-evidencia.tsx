"use client";

import { useRef, useState } from "react";
import { Camera, Check, ImagePlus, RotateCcw, X } from "lucide-react";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { subirFotoEvidencia } from "./evidencias-actions";
import {
  DIAS_RETENCION_EVIDENCIAS,
  MAX_FOTOS_EVIDENCIA,
  MAX_LARGO_PIE_FOTO,
  type FotoEvidencia,
  type TipoRegistroEvidencia,
} from "@/lib/evidencias-constantes";

// Fotos opcionales al final del checklist de visita y de la auditoría:
// varias fotos, cada una con su pie. Se comprimen al elegirlas y se suben
// una por una después de guardar el registro (ver subirFotosEvidencia).

export type FotoPendiente = {
  id: string;
  dataUrl: string;
  pie: string;
  estado: "lista" | "subiendo" | "subida" | "error";
  error?: string;
};

export function SelectorFotosEvidencia({
  fotos,
  onCambiar,
  bloqueado = false,
}: {
  fotos: FotoPendiente[];
  onCambiar: (fotos: FotoPendiente[]) => void;
  bloqueado?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const quedan = MAX_FOTOS_EVIDENCIA - fotos.length;

  async function agregar(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setAviso(null);
    const elegidos = Array.from(archivos).slice(0, quedan);
    if (archivos.length > quedan) setAviso(`Solo se agregaron ${quedan}: el máximo es ${MAX_FOTOS_EVIDENCIA} fotos.`);
    setProcesando(true);
    const nuevas: FotoPendiente[] = [];
    for (const archivo of elegidos) {
      try {
        const dataUrl = await comprimirFotoComoBase64(archivo);
        nuevas.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          pie: "",
          estado: "lista",
        });
      } catch (e: any) {
        setAviso(e?.message || "Una de las fotos no se pudo procesar.");
      }
    }
    setProcesando(false);
    onCambiar([...fotos, ...nuevas]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-1.5 text-marca-tenue text-[10px] uppercase font-bold">
          <Camera className="w-3.5 h-3.5" /> Fotos (opcional)
        </p>
        <p className="text-marca-tenue text-[10px] mt-0.5">
          Hasta {MAX_FOTOS_EVIDENCIA} fotos, cada una con su descripción. Se borran solas a los{" "}
          {DIAS_RETENCION_EVIDENCIAS} días; el resto del registro se conserva.
        </p>
      </div>

      {fotos.length > 0 && (
        <div className="space-y-2">
          {fotos.map((f, i) => (
            <div key={f.id} className="flex gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUrl} alt={f.pie || `Foto ${i + 1}`} className="w-20 h-20 object-cover rounded-[2px] shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <textarea
                  id={`foto-evidencia-pie-${f.id}`}
                  value={f.pie}
                  maxLength={MAX_LARGO_PIE_FOTO}
                  disabled={bloqueado || f.estado === "subida" || f.estado === "subiendo"}
                  onChange={(e) => onCambiar(fotos.map((x) => (x.id === f.id ? { ...x, pie: e.target.value } : x)))}
                  rows={2}
                  placeholder="Describe la foto (ej: Vitrina sin precios)"
                  aria-label={`Descripción de la foto ${i + 1}`}
                  className="w-full p-2 bg-marca-superficie border border-marca-borde rounded-[3px] text-marca-texto text-xs outline-none focus:border-marca-rojoclaro resize-none"
                />
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span
                    className={
                      f.estado === "subida"
                        ? "text-emerald-400 font-bold flex items-center gap-1"
                        : f.estado === "error"
                          ? "text-marca-rojoclaro font-bold"
                          : "text-marca-tenue"
                    }
                  >
                    {f.estado === "subida" ? (
                      <>
                        <Check className="w-3 h-3" /> Subida
                      </>
                    ) : f.estado === "subiendo" ? (
                      "Subiendo..."
                    ) : f.estado === "error" ? (
                      f.error || "No se subió"
                    ) : (
                      `Foto ${i + 1}`
                    )}
                  </span>
                  {!bloqueado && f.estado !== "subida" && f.estado !== "subiendo" && (
                    <button
                      type="button"
                      onClick={() => onCambiar(fotos.filter((x) => x.id !== f.id))}
                      className="text-marca-tenue hover:text-marca-rojoclaro flex items-center gap-1 font-bold uppercase"
                    >
                      <X className="w-3 h-3" /> Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!bloqueado && quedan > 0 && (
        <>
          <input
            ref={input}
            id="fotos-evidencia-archivos"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => agregar(e.target.files)}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={procesando}
            className="w-full border border-dashed border-marca-borde hover:border-marca-rojoclaro text-marca-tenue hover:text-marca-texto font-bold py-3 rounded-[3px] text-[11px] tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" />
            {procesando ? "Preparando fotos..." : fotos.length === 0 ? "Agregar fotos" : `Agregar más (quedan ${quedan})`}
          </button>
        </>
      )}
      {aviso && <p className="text-amber-400 text-[11px] font-bold">{aviso}</p>}
    </div>
  );
}

// Sube en orden las fotos que falten (las ya subidas se saltan, así que
// sirve también para reintentar). Devuelve cuántas quedaron sin subir.
export async function subirFotosEvidencia(
  tipo: TipoRegistroEvidencia,
  registroId: string,
  fotos: FotoPendiente[],
  onCambiar: (fotos: FotoPendiente[]) => void
): Promise<number> {
  let actuales = [...fotos];
  const actualizar = (id: string, cambio: Partial<FotoPendiente>) => {
    actuales = actuales.map((f) => (f.id === id ? { ...f, ...cambio } : f));
    onCambiar(actuales);
  };

  for (const foto of fotos) {
    if (foto.estado === "subida") continue;
    actualizar(foto.id, { estado: "subiendo", error: undefined });
    try {
      const r = await subirFotoEvidencia(tipo, registroId, foto.dataUrl, foto.pie);
      actualizar(foto.id, r.exito ? { estado: "subida" } : { estado: "error", error: r.mensaje });
    } catch {
      actualizar(foto.id, { estado: "error", error: "Sin conexión" });
    }
  }
  return actuales.filter((f) => f.estado !== "subida").length;
}

// Aviso con reintento para cuando alguna foto no se pudo subir.
export function AvisoFotosPendientes({
  fallidas,
  reintentando,
  onReintentar,
}: {
  fallidas: number;
  reintentando: boolean;
  onReintentar: () => void;
}) {
  if (fallidas === 0) return null;
  return (
    <div className="bg-amber-400/10 border border-amber-400/40 rounded-[3px] p-3 flex items-center justify-between gap-3">
      <p className="text-amber-400 text-xs font-bold">
        {fallidas === 1 ? "1 foto no se subió." : `${fallidas} fotos no se subieron.`} Lo demás ya quedó guardado.
      </p>
      <button
        type="button"
        onClick={onReintentar}
        disabled={reintentando}
        className="shrink-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-marca-textofuerte disabled:opacity-50"
      >
        <RotateCcw className="w-3.5 h-3.5" /> {reintentando ? "Subiendo..." : "Reintentar"}
      </button>
    </div>
  );
}

// Fotos ya guardadas, para el detalle en el historial.
export function GaleriaEvidencias({ fotos }: { fotos: FotoEvidencia[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-marca-tenue text-[10px] uppercase font-bold">
        <Camera className="w-3.5 h-3.5" /> Fotos ({fotos.length})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fotos.map((f, i) => (
          <figure key={f.id} className="bg-marca-fondo border border-marca-borde rounded-[3px] overflow-hidden">
            {f.url ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.pie || `Foto ${i + 1}`} className="w-full aspect-square object-cover" />
              </a>
            ) : (
              <div className="w-full aspect-square grid place-items-center text-marca-tenue text-[10px]">
                No disponible
              </div>
            )}
            {f.pie && <figcaption className="p-2 text-marca-texto text-[11px] break-words">{f.pie}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}
