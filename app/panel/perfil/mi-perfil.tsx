"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, Camera, Star, Flame, Trophy, Plane, Images, BedDouble, Calendar, PartyPopper, ArrowLeft, ChevronRight } from "lucide-react";
import {
  obtenerPerfil,
  actualizarFotoPerfil,
  obtenerDirectorioEquipo,
  type PerfilCompleto,
  type PersonaDirectorio,
} from "./actions";
import { obtenerGaleriaDeUsuario, type FotoGaleria } from "../historias/actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { UMBRALES_MEDALLAS } from "@/lib/trofeos";

const ETIQUETA_ROL: Record<string, string> = {
  supervisor: "Supervisor",
  capacitador: "Capacitador",
  coordinador: "Coordinador",
  gerente: "Gerente",
};

// Un color por rol para identificar de un vistazo a cada quién en el
// directorio del equipo -- gerente usa el rojo de marca, los demás roles
// operativos se distinguen entre sí.
const COLOR_ROL: Record<string, string> = {
  gerente: "#e23744",
  coordinador: "#f59e0b",
  supervisor: "#3b82f6",
  capacitador: "#8b5cf6",
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function textoAntiguedad(a: PerfilCompleto["antiguedad"], esPropio: boolean): string | null {
  if (!a) return null;
  const anios = `${a.anios} año${a.anios !== 1 ? "s" : ""}`;
  const meses = a.meses > 0 ? ` y ${a.meses} mes${a.meses !== 1 ? "es" : ""}` : "";
  return `${esPropio ? "Miembro" : "En el equipo"} desde hace ${anios}${meses}`;
}

function Tile({ icono, etiqueta, valor, unidad }: { icono: React.ReactNode; etiqueta: string; valor: string; unidad?: string }) {
  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[9px] font-black uppercase tracking-widest">
        {icono} {etiqueta}
      </p>
      <p className="font-display text-marca-textofuerte text-[22px] font-extrabold mt-1">
        {valor} {unidad && <span className="text-xs font-bold text-marca-tenue">{unidad}</span>}
      </p>
    </div>
  );
}

function VistaPerfil({ usuarioId, onAbrirPerfil }: { usuarioId?: string; onAbrirPerfil: (id: string) => void }) {
  const [perfil, setPerfil] = useState<PerfilCompleto | null>(null);
  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  const [directorio, setDirectorio] = useState<PersonaDirectorio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [fotoRecienSubida, setFotoRecienSubida] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    const p = await obtenerPerfil(usuarioId);
    const [f, d] = await Promise.all([
      obtenerGaleriaDeUsuario(p.usuarioId),
      p.esPropio ? obtenerDirectorioEquipo() : Promise.resolve([]),
    ]);
    setPerfil(p);
    setFotos(f);
    setDirectorio(d);
  }

  useEffect(() => {
    setCargando(true);
    cargar()
      .catch(() => setMensaje("No se pudo cargar el perfil."))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    setMensaje(null);
    setSubiendo(true);
    try {
      const dataUrl = await comprimirFotoComoBase64(archivo, 480, 0.82);
      const resultado = await actualizarFotoPerfil(dataUrl);
      if (!resultado.ok) {
        setMensaje(resultado.mensaje || "No se pudo subir la foto.");
        return;
      }
      // El enlace firmado de la foto puede repetirse por un rato (ver
      // vencimientoEstable en lib/blob-storage.ts) y el navegador mostraría
      // la anterior desde su caché: se muestra la recién subida.
      setFotoRecienSubida(dataUrl);
      await cargar();
    } catch (error: any) {
      setMensaje(error.message || "No se pudo procesar la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando perfil...</p>;
  }

  if (!perfil) {
    return <p className="text-marca-rojoclaro text-sm">{mensaje}</p>;
  }

  const esPropio = perfil.esPropio;
  const progreso = Math.round(
    (perfil.progresoBronce.actual / (perfil.progresoBronce.actual + perfil.progresoBronce.faltan)) * 100
  );
  const textoDescanso =
    perfil.diasDescanso.length === 0 ? "Sin descanso fijo asignado" : perfil.diasDescanso.join(" y ");
  const caption = textoAntiguedad(perfil.antiguedad, esPropio);

  return (
    <div className="space-y-6">
      <div>
        <div className="h-[92px] rounded-t-[6px]" style={{ background: "linear-gradient(135deg,#e23744,#a6121d)" }} />
        <div className="px-1">
          <div className="relative w-24 h-24 -mt-12">
            <div className="w-24 h-24 rounded-full border-4 border-marca-fondo bg-marca-superficie2 flex items-center justify-center overflow-hidden">
              {(perfil.esPropio && fotoRecienSubida) || perfil.fotoUrl ? (
                <img src={(perfil.esPropio && fotoRecienSubida) || perfil.fotoUrl || ""} alt={`Foto de perfil de ${perfil.nombre}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-marca-textofuerte text-2xl font-extrabold">{iniciales(perfil.nombre)}</span>
              )}
            </div>
            {esPropio && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={subiendo}
                aria-label="Cambiar foto de perfil"
                className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-marca-rojoclaro border-[3px] border-marca-fondo flex items-center justify-center disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            )}
            {esPropio && (
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={alElegirFoto} />
            )}
          </div>

          <div className="mt-2.5">
            <h2 className="font-display text-xl font-extrabold text-marca-textofuerte">{perfil.nombre}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="bg-marca-superficie2 border border-marca-borde rounded-full px-2.5 py-1 text-[9.5px] font-black uppercase tracking-widest text-marca-rojoclaro">
                {ETIQUETA_ROL[perfil.rol] ?? perfil.rol}
              </span>
              {subiendo && <span className="text-marca-tenue text-[11px]">Subiendo foto...</span>}
            </div>
            {caption && <p className="text-marca-tenue text-[11px] mt-1.5">{caption}</p>}
            {mensaje && <p className="text-marca-rojoclaro text-[11px] mt-1.5">{mensaje}</p>}
          </div>
        </div>
      </div>

      {perfil.tienePuntos && (
        <div className="grid grid-cols-2 gap-2.5">
          <Tile icono={<Star className="w-2.5 h-2.5" />} etiqueta="Puntos" valor={String(perfil.puntos)} />
          <Tile
            icono={<Flame className="w-2.5 h-2.5" />}
            etiqueta="Racha actual"
            valor={String(perfil.rachaActual)}
            unidad={perfil.rachaActual === 1 ? "día" : "días"}
          />
          <Tile
            icono={<Trophy className="w-2.5 h-2.5" />}
            etiqueta="Ranking"
            valor={perfil.ranking ? `#${perfil.ranking.posicion}` : "—"}
            unidad={perfil.ranking ? `de ${perfil.ranking.total}` : undefined}
          />
          <Tile
            icono={<Plane className="w-2.5 h-2.5" />}
            etiqueta="Viajes a provincia"
            valor={String(perfil.viajesProvincia)}
          />
        </div>
      )}

      <div className="flex gap-2.5">
        <div className="flex-1 bg-marca-superficie border border-marca-borde rounded-[3px] px-3.5 py-3">
          <p className="text-marca-tenue text-[9px] font-black uppercase tracking-widest">
            🎁 {esPropio ? "Has donado" : "Ha donado"}
          </p>
          <p className="font-display text-lg font-extrabold text-marca-rojoclaro mt-1">
            {perfil.totalDonado} <span className="text-[11px] font-bold text-marca-tenue">pts</span>
          </p>
        </div>
        <div className="flex-1 bg-marca-superficie border border-marca-borde rounded-[3px] px-3.5 py-3">
          <p className="text-marca-tenue text-[9px] font-black uppercase tracking-widest">
            🎉 {esPropio ? "Te han donado" : "Le han donado"}
          </p>
          <p className="font-display text-lg font-extrabold text-emerald-400 mt-1">
            {perfil.totalRecibido} <span className="text-[11px] font-bold text-marca-tenue">pts</span>
          </p>
        </div>
      </div>

      {perfil.tienePuntos && (
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-marca-tenue uppercase mb-2.5">
            <Trophy className="w-3.5 h-3.5 text-marca-rojoclaro" /> {esPropio ? "Tus medallas" : "Sus medallas"}
          </h3>
          <div className="flex gap-2">
            {UMBRALES_MEDALLAS.map((u) => (
              <div key={u.id} className="flex-1 bg-marca-superficie2 border border-marca-borde rounded-[3px] py-2.5 text-center">
                <div className="text-2xl leading-none">{u.emoji}</div>
                <div className="text-marca-texto font-black text-sm mt-1">{perfil.medallas[u.id]}</div>
              </div>
            ))}
          </div>
          {esPropio && (
            <div className="mt-2.5">
              <p className="text-marca-tenue text-[10.5px] mb-1.5">
                Te faltan <span className="text-marca-texto font-bold">{perfil.progresoBronce.faltan} pts</span> para
                tu próxima medalla 🥉
              </p>
              <div className="h-[5px] bg-marca-borde rounded-full overflow-hidden">
                <div className="h-full bg-marca-rojo rounded-full" style={{ width: progreso + "%" }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-marca-tenue text-[11px] font-black uppercase tracking-widest mb-1">Datos</p>
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] px-3.5 divide-y divide-marca-borde">
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-marca-tenue text-xs">
              <BedDouble className="w-3.5 h-3.5 text-marca-rojoclaro" /> Descanso semanal
            </span>
            <span className="text-marca-textofuerte text-xs font-bold">{textoDescanso}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-marca-tenue text-xs">
              <Cake className="w-3.5 h-3.5 text-marca-rojoclaro" /> Edad
            </span>
            <span className="text-marca-textofuerte text-xs font-bold">
              {perfil.edad !== null ? `${perfil.edad} año${perfil.edad !== 1 ? "s" : ""}` : "No registrada"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-marca-tenue text-xs">
              <Calendar className="w-3.5 h-3.5 text-marca-rojoclaro" /> Antigüedad
            </span>
            <span className="text-marca-textofuerte text-xs font-bold">
              {perfil.antiguedad
                ? `${perfil.antiguedad.anios} año${perfil.antiguedad.anios !== 1 ? "s" : ""}` +
                  (perfil.antiguedad.meses > 0 ? ` y ${perfil.antiguedad.meses} mes${perfil.antiguedad.meses !== 1 ? "es" : ""}` : "")
                : "No registrada"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2 text-marca-tenue text-xs">
              <PartyPopper className="w-3.5 h-3.5 text-marca-rojoclaro" /> Próximo aniversario
            </span>
            <span className="text-marca-textofuerte text-xs font-bold">
              {perfil.proximoAniversario
                ? perfil.proximoAniversario.diasFaltantes === 0
                  ? "¡Hoy!"
                  : `En ${perfil.proximoAniversario.diasFaltantes} día${perfil.proximoAniversario.diasFaltantes !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-marca-tenue text-[11px] font-black uppercase tracking-widest mb-2.5">
          <Images className="w-3.5 h-3.5" /> {esPropio ? "Tus fotos recientes" : "Sus fotos recientes"}
        </p>
        {fotos.length === 0 ? (
          <p className="text-marca-tenue text-sm">
            {esPropio ? "Aún no tienes fotos activas en tu galería." : "Todavía no tiene fotos activas."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {fotos.map((f) => (
              <div key={f.id} className="aspect-square rounded-[3px] overflow-hidden bg-marca-fondo">
                <img src={f.url} alt="Foto de historia" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
        <p className="text-marca-tenue text-[10.5px] mt-2">Se ven aquí hasta 7 días, igual que en Mi Galería.</p>
      </div>

      {esPropio && directorio.length > 0 && (
        <div>
          <p className="text-marca-tenue text-[11px] font-black uppercase tracking-widest mb-1">Perfil de tu equipo</p>
          <p className="text-marca-tenue text-[10.5px] mb-2">Toca un nombre para ver su perfil.</p>
          <div className="bg-marca-superficie border border-marca-borde rounded-[3px] divide-y divide-marca-borde">
            {directorio.map((persona) => {
              const color = COLOR_ROL[persona.rol] ?? "#8b8d92";
              return (
                <button
                  key={persona.usuarioId}
                  type="button"
                  onClick={() => onAbrirPerfil(persona.usuarioId)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-marca-superficie2 transition"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 overflow-hidden"
                    style={{
                      border: `2px solid ${color}`,
                      background: persona.fotoUrl ? undefined : `${color}26`,
                      color: persona.fotoUrl ? undefined : color,
                    }}
                  >
                    {persona.fotoUrl ? (
                      <img src={persona.fotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      iniciales(persona.nombre)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-marca-textofuerte text-[13px] font-bold truncate">{persona.nombre}</p>
                    <p className="text-[10.5px] font-bold" style={{ color }}>
                      {ETIQUETA_ROL[persona.rol] ?? persona.rol}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-marca-tenue shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MiPerfil() {
  const [verUsuarioId, setVerUsuarioId] = useState<string | undefined>(undefined);

  return (
    <div className="space-y-4">
      {verUsuarioId && (
        <button
          type="button"
          onClick={() => setVerUsuarioId(undefined)}
          className="flex items-center gap-1.5 text-marca-tenue hover:text-marca-texto text-xs font-bold transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a tu perfil
        </button>
      )}
      <VistaPerfil key={verUsuarioId ?? "propio"} usuarioId={verUsuarioId} onAbrirPerfil={setVerUsuarioId} />
    </div>
  );
}
