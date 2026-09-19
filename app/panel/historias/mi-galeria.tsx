"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Images } from "lucide-react";
import { obtenerMiGaleria, type FotoGaleria } from "./actions";

function claseBadge(diasRestantes: number): string {
  if (diasRestantes <= 1) return "bg-marca-rojo/20 border-marca-rojoclaro text-marca-rojoclaro";
  if (diasRestantes <= 3) return "bg-amber-950/30 border-amber-500/50 text-amber-400";
  return "bg-marca-superficie2 border-marca-borde text-marca-tenue";
}

function textoVencimiento(diasRestantes: number): string {
  if (diasRestantes <= 0) return "vence hoy";
  if (diasRestantes === 1) return "vence mañana";
  return `vence en ${diasRestantes} días`;
}

function TarjetaFoto({ foto }: { foto: FotoGaleria }) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function compartir() {
    setMensaje(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Historia Shimaya", text: foto.texto ?? undefined, url: foto.url });
      } else {
        await navigator.clipboard.writeText(foto.url);
        setMensaje("Enlace copiado.");
      }
    } catch {
      // el usuario canceló el share nativo -- no es un error real
    }
  }

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-marca-fondo">
        <img src={foto.url} alt="Foto de mi historia" className="w-full h-full object-cover" />
        <span
          className={`absolute top-2 right-2 text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${claseBadge(
            foto.diasRestantes
          )}`}
        >
          {textoVencimiento(foto.diasRestantes)}
        </span>
        {foto.texto && (
          <p className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent text-white text-[11px] font-semibold px-2.5 pt-5 pb-2 line-clamp-2">
            {foto.texto}
          </p>
        )}
      </div>
      <div className="flex border-t border-marca-borde">
        <a
          href={foto.urlDescarga}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-marca-texto hover:bg-marca-superficie2 border-r border-marca-borde transition"
        >
          <Download className="w-3.5 h-3.5" /> Descargar
        </a>
        <button
          type="button"
          onClick={compartir}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-marca-texto hover:bg-marca-superficie2 transition"
        >
          <Share2 className="w-3.5 h-3.5" /> Compartir
        </button>
      </div>
      {mensaje && <p className="text-center text-[10px] text-marca-tenue pb-1.5">{mensaje}</p>}
    </div>
  );
}

export default function MiGaleria() {
  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerMiGaleria()
      .then(setFotos)
      .catch(() => setFotos([]))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-marca-tenue text-[11px] flex items-start gap-1.5">
        <Images className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Tus fotos publicadas en Historias, hasta por 7 días — se borran solas después.
      </p>

      {fotos.length === 0 ? (
        <p className="text-marca-tenue text-sm">No tienes fotos activas en tu galería.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {fotos.map((f) => (
            <TarjetaFoto key={f.id} foto={f} />
          ))}
        </div>
      )}
    </div>
  );
}
