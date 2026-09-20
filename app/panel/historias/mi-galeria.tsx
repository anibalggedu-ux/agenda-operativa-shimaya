"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Images, Trophy } from "lucide-react";
import { obtenerMiGaleria, obtenerMiSaldoDeRegalo, type FotoGaleria, type SaldoRegalo } from "./actions";
import { marcarNotificacionesVistas, obtenerRankingRegalos, type FilaRankingRegalos } from "./social-actions";
import HistoriasFeed from "./historias-feed";

function claseBadge(minutosRestantes: number): string {
  if (minutosRestantes <= 120) return "bg-marca-rojo/20 border-marca-rojoclaro text-marca-rojoclaro";
  if (minutosRestantes <= 360) return "bg-amber-950/30 border-amber-500/50 text-amber-400";
  return "bg-marca-superficie2 border-marca-borde text-marca-tenue";
}

function textoVencimiento(minutosRestantes: number): string {
  if (minutosRestantes <= 0) return "venciendo...";
  if (minutosRestantes < 60) return `vence en ${minutosRestantes} min`;
  return `vence en ${Math.round(minutosRestantes / 60)} h`;
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
            foto.minutosRestantes
          )}`}
        >
          {textoVencimiento(foto.minutosRestantes)}
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

function FranjaPuntos({ saldo }: { saldo: SaldoRegalo }) {
  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-marca-borde">
      <div className="flex-1 p-4">
        <p className="text-marca-tenue text-[9px] font-black uppercase tracking-widest mb-1">Tus puntos</p>
        <p className="font-display text-2xl text-marca-textofuerte">
          {saldo.saldo} <span className="text-sm font-bold text-marca-tenue">pts</span>
        </p>
      </div>
      <div className="flex-1 p-4">
        <p className="text-marca-tenue text-[9px] font-black uppercase tracking-widest mb-1">🎁 Has donado</p>
        <p className="font-display text-2xl text-marca-rojoclaro">
          {saldo.totalDonado} <span className="text-sm font-bold text-marca-tenue">pts</span>
        </p>
      </div>
      <div className="flex-1 p-4">
        <p className="text-marca-tenue text-[9px] font-black uppercase tracking-widest mb-1">🎉 Te han donado</p>
        <p className="font-display text-2xl text-emerald-400">
          {saldo.totalRecibido} <span className="text-sm font-bold text-marca-tenue">pts</span>
        </p>
      </div>
    </div>
  );
}

function RankingRegalos({ filas }: { filas: FilaRankingRegalos[] }) {
  const topDonadores = [...filas].filter((f) => f.donado > 0).sort((a, b) => b.donado - a.donado).slice(0, 5);
  const topReceptores = [...filas].filter((f) => f.recibido > 0).sort((a, b) => b.recibido - a.recibido).slice(0, 5);

  if (topDonadores.length === 0 && topReceptores.length === 0) return null;

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 space-y-4">
      <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
        <Trophy className="w-3.5 h-3.5 text-marca-rojoclaro" /> RANKING DE REGALOS DEL EQUIPO
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className="text-marca-tenue text-[10px] font-black uppercase tracking-widest">🎁 Top donadores</p>
          {topDonadores.map((f, i) => (
            <div key={f.usuarioId} className="flex items-center justify-between text-xs">
              <span className="text-marca-texto">
                <span className="text-marca-tenue font-bold mr-1.5">{i + 1}.</span>
                {f.nombre}
              </span>
              <span className="text-marca-rojoclaro font-black">{f.donado} pts</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-marca-tenue text-[10px] font-black uppercase tracking-widest">🎉 Top receptores</p>
          {topReceptores.map((f, i) => (
            <div key={f.usuarioId} className="flex items-center justify-between text-xs">
              <span className="text-marca-texto">
                <span className="text-marca-tenue font-bold mr-1.5">{i + 1}.</span>
                {f.nombre}
              </span>
              <span className="text-emerald-400 font-black">{f.recibido} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MiGaleria({ miUsuarioId, miRol }: { miUsuarioId: string; miRol: string }) {
  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  const [saldo, setSaldo] = useState<SaldoRegalo | null>(null);
  const [ranking, setRanking] = useState<FilaRankingRegalos[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([obtenerMiGaleria(), obtenerMiSaldoDeRegalo(), obtenerRankingRegalos()])
      .then(([f, s, r]) => {
        setFotos(f);
        setSaldo(s);
        setRanking(r);
      })
      .catch(() => setFotos([]))
      .finally(() => setCargando(false));
    marcarNotificacionesVistas().catch(() => {});
  }, []);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  }

  return (
    <div className="space-y-6">
      {saldo && <FranjaPuntos saldo={saldo} />}

      <HistoriasFeed miUsuarioId={miUsuarioId} miRol={miRol} />

      <div className="space-y-4">
        <p className="text-marca-tenue text-[11px] flex items-start gap-1.5">
          <Images className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Tus fotos publicadas en Historias, hasta por 24 horas — se borran solas después.
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

      <RankingRegalos filas={ranking} />
    </div>
  );
}
