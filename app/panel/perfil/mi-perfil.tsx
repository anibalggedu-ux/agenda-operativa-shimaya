"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, Camera, Trophy, Plane, Images, BedDouble, Calendar, PartyPopper, ArrowLeft, Volume2, Smartphone, Gift } from "lucide-react";
import {
  obtenerPerfil,
  actualizarFotoPerfil,
  obtenerDirectorioEquipo,
  cambiarMostrarEdad,
  type PerfilCompleto,
  type PersonaDirectorio,
} from "./actions";
import {
  obtenerGaleriaDeUsuario,
  obtenerMiSaldoDeRegalo,
  type FotoGaleria,
  type SaldoRegalo,
} from "../historias/actions";
import {
  marcarNotificacionesVistas,
  obtenerRankingRegalos,
  type FilaRankingRegalos,
} from "../historias/social-actions";
import { FranjaPuntos, RankingRegalos, TarjetaFoto } from "../historias/mi-galeria";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { UMBRALES_MEDALLAS } from "@/lib/trofeos";
import { calcularPresencia } from "@/lib/presencia";
import {
  cambiarSonido,
  cambiarVibracion,
  reproducirSonidoExito,
  sonidoActivado,
  vibracionActivada,
} from "@/lib/sonido";

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

// Número que cuenta hacia arriba al abrir el perfil (menos de 1 s).
function Contador({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(valor);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || valor === 0) {
      setMostrado(valor);
      return;
    }
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / 800);
      setMostrado(Math.round(valor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);
  return <>{mostrado}</>;
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
  const ajustesRef = useRef<HTMLDivElement>(null);
  const [pestana, setPestana] = useState<"fotos" | "medallas" | "regalos" | "datos">("fotos");
  // Pestaña "Regalos" (antes en Mi Galería): se carga al abrirla.
  const [saldoRegalo, setSaldoRegalo] = useState<SaldoRegalo | null>(null);
  const [rankingRegalos, setRankingRegalos] = useState<FilaRankingRegalos[] | null>(null);

  // Al abrir tu propio perfil (que ahora incluye la galería) se dan por
  // vistas las notificaciones de regalos y comentarios, como hacía Mi Galería.
  const esPerfilPropio = perfil?.esPropio ?? false;
  useEffect(() => {
    if (esPerfilPropio) marcarNotificacionesVistas().catch(() => {});
  }, [esPerfilPropio]);

  useEffect(() => {
    if (pestana !== "regalos" || rankingRegalos !== null) return;
    Promise.all([obtenerMiSaldoDeRegalo(), obtenerRankingRegalos()])
      .then(([s, r]) => {
        setSaldoRegalo(s);
        setRankingRegalos(r);
      })
      .catch(() => setRankingRegalos([]));
  }, [pestana, rankingRegalos]);

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

  const color = COLOR_ROL[perfil.rol] ?? "#8b8d92";
  const presencia = calcularPresencia(perfil.ultimaActividad);
  const fotoPerfil = (perfil.esPropio && fotoRecienSubida) || perfil.fotoUrl;

  return (
    <div className="space-y-5">
      {/* Cabecera estilo Instagram: foto a la izquierda y los números al lado. */}
      <div className="flex items-center gap-5 aparecer">
        <div className="relative shrink-0">
          <div className="w-[88px] h-[88px] rounded-full p-[3px]" style={{ background: color }}>
            <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-marca-fondo bg-marca-superficie2 flex items-center justify-center">
              {fotoPerfil ? (
                <img src={fotoPerfil} alt={`Foto de perfil de ${perfil.nombre}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-marca-textofuerte text-2xl font-extrabold">{iniciales(perfil.nombre)}</span>
              )}
            </div>
          </div>
          {presencia?.enLinea && (
            <span className="absolute right-1 bottom-1 w-4 h-4 rounded-full bg-emerald-400 border-[3px] border-marca-fondo">
              <span className="absolute -inset-[3px] rounded-full border-2 border-emerald-400 animate-ping opacity-60" />
            </span>
          )}
        </div>
        <div className="flex-1 grid grid-cols-3 text-center tabular-nums">
          <div>
            <p className="font-display text-marca-textofuerte text-lg font-extrabold">
              <Contador valor={perfil.puntos} />
            </p>
            <p className="text-marca-tenue text-[10.5px]">puntos</p>
          </div>
          <div>
            <p className="font-display text-marca-textofuerte text-lg font-extrabold">
              {perfil.ranking ? (
                <>
                  #<Contador valor={perfil.ranking.posicion} />
                </>
              ) : (
                "—"
              )}
            </p>
            <p className="text-marca-tenue text-[10.5px]">{perfil.ranking ? `de ${perfil.ranking.total}` : "ranking"}</p>
          </div>
          <div>
            <p className="font-display text-marca-textofuerte text-lg font-extrabold">
              <Contador valor={perfil.rachaActual} />
            </p>
            <p className="text-marca-tenue text-[10.5px]">días racha</p>
          </div>
        </div>
      </div>

      <div className="space-y-1 aparecer [animation-delay:60ms]">
        <h2 className="font-display text-lg font-extrabold text-marca-textofuerte leading-tight">{perfil.nombre}</h2>
        <div className="flex items-center flex-wrap gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
            style={{ color, background: `${color}1f` }}
          >
            {ETIQUETA_ROL[perfil.rol] ?? perfil.rol}
          </span>
          {presencia && (
            <span className={`flex items-center gap-1 text-[11px] font-bold ${presencia.enLinea ? "text-emerald-400" : "text-marca-tenue"}`}>
              {presencia.enLinea && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {presencia.texto}
            </span>
          )}
          {subiendo && <span className="text-marca-tenue text-[11px]">Subiendo foto...</span>}
        </div>
        <p className="text-marca-tenue text-[11.5px]">
          {caption ? `${caption} · ` : ""}🎁 {esPropio ? "donaste" : "donó"} {perfil.totalDonado} · 🎉{" "}
          {esPropio ? "recibiste" : "recibió"} {perfil.totalRecibido}
        </p>
        {mensaje && <p className="text-marca-rojoclaro text-[11px]">{mensaje}</p>}
      </div>

      {esPropio && (
        <div className="grid grid-cols-2 gap-2 aparecer [animation-delay:120ms]">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="flex items-center justify-center gap-1.5 bg-marca-superficie2 hover:bg-marca-superficie text-marca-textofuerte text-[12.5px] font-bold py-2 rounded-lg disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" /> Cambiar foto
          </button>
          <button
            type="button"
            onClick={() => ajustesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="flex items-center justify-center gap-1.5 bg-marca-superficie2 hover:bg-marca-superficie text-marca-textofuerte text-[12.5px] font-bold py-2 rounded-lg"
          >
            <Volume2 className="w-3.5 h-3.5" /> Ajustes
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={alElegirFoto} />
        </div>
      )}

      {/* "Destacadas": medallas y viajes en círculos, como en Instagram. */}
      {perfil.tienePuntos && (
        <div className="flex gap-3.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden aparecer [animation-delay:180ms]">
          {UMBRALES_MEDALLAS.map((u) => (
            <div key={u.id} className={`shrink-0 flex flex-col items-center gap-1 ${perfil.medallas[u.id] === 0 ? "opacity-40" : ""}`}>
              <span className="w-14 h-14 rounded-full border-2 border-marca-borde bg-marca-superficie flex items-center justify-center text-2xl">
                {u.emoji}
              </span>
              <span className="text-marca-tenue text-[10.5px]">
                {perfil.medallas[u.id]} {u.etiqueta.toLowerCase()}
              </span>
            </div>
          ))}
          <div className={`shrink-0 flex flex-col items-center gap-1 ${perfil.viajesProvincia === 0 ? "opacity-40" : ""}`}>
            <span className="w-14 h-14 rounded-full border-2 border-marca-borde bg-marca-superficie flex items-center justify-center">
              <Plane className="w-5 h-5 text-marca-rojoclaro" />
            </span>
            <span className="text-marca-tenue text-[10.5px]">
              {perfil.viajesProvincia} viaje{perfil.viajesProvincia !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Pestañas: Fotos · Medallas · Datos */}
      <div>
        <div className={`grid ${esPropio ? "grid-cols-4" : "grid-cols-3"} border-b border-marca-borde`} role="tablist">
          {(
            [
              { id: "fotos", etiqueta: "Fotos", icono: Images },
              { id: "medallas", etiqueta: "Medallas", icono: Trophy },
              ...(esPropio ? [{ id: "regalos", etiqueta: "Regalos", icono: Gift }] : []),
              { id: "datos", etiqueta: "Datos", icono: Calendar },
            ] as { id: "fotos" | "medallas" | "regalos" | "datos"; etiqueta: string; icono: typeof Images }[]
          ).map(({ id, etiqueta, icono: Icono }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-bold border-b-2 -mb-px transition ${
                pestana === id ? "text-marca-textofuerte border-marca-textofuerte" : "text-marca-tenue border-transparent"
              }`}
            >
              <Icono className="w-3.5 h-3.5" /> {etiqueta}
            </button>
          ))}
        </div>

        <div className="pt-3">
          {pestana === "fotos" && (
            <>
              {fotos.length === 0 ? (
                <p className="text-marca-tenue text-sm py-6 text-center">
                  {esPropio ? "Aún no tienes fotos activas en tu galería." : "Todavía no tiene fotos activas."}
                </p>
              ) : esPropio ? (
                // Tu galería (antes "Mi Galería"): cuántos días le quedan a
                // cada foto, descargar y compartir.
                <div className="grid grid-cols-2 gap-2.5">
                  {fotos.map((f) => (
                    <TarjetaFoto key={f.id} foto={f} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {fotos.map((f) => (
                    <div key={f.id} className="aspect-square rounded-[3px] overflow-hidden bg-marca-fondo">
                      <img src={f.url} alt="Foto de historia" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-marca-tenue text-[10.5px] mt-2">Las fotos de historias se ven aquí hasta 7 días.</p>
            </>
          )}

          {pestana === "medallas" && (
            <div className="space-y-3">
              {perfil.tienePuntos ? (
                <div className="bg-marca-superficie rounded-xl divide-y divide-marca-borde">
                  {UMBRALES_MEDALLAS.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-marca-tenue text-xs">
                        <span className="text-lg leading-none">{u.emoji}</span> {u.etiqueta}
                        <span className="text-[10px]">· cada {u.puntos} pts</span>
                      </span>
                      <span className="text-marca-textofuerte text-sm font-black tabular-nums">{perfil.medallas[u.id]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-marca-tenue text-sm py-6 text-center">Todavía no suma puntos.</p>
              )}
              {esPropio && perfil.tienePuntos && (
                <div>
                  <p className="text-marca-tenue text-[10.5px] mb-1.5">
                    Te faltan <span className="text-marca-texto font-bold">{perfil.progresoBronce.faltan} pts</span> para
                    tu próxima medalla 🥉
                  </p>
                  <div className="h-[6px] bg-marca-borde rounded-full overflow-hidden">
                    <div className="h-full bg-marca-rojo rounded-full transition-all duration-700" style={{ width: progreso + "%" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {pestana === "regalos" && esPropio && (
            <div className="space-y-3">
              {rankingRegalos === null ? (
                <p className="text-marca-tenue text-sm animate-pulse py-6 text-center">Cargando regalos...</p>
              ) : (
                <>
                  {saldoRegalo && <FranjaPuntos saldo={saldoRegalo} />}
                  <RankingRegalos filas={rankingRegalos} />
                  {rankingRegalos.every((f) => f.donado === 0 && f.recibido === 0) && (
                    <p className="text-marca-tenue text-sm text-center py-4">Todavía no hay regalos en el equipo.</p>
                  )}
                </>
              )}
            </div>
          )}

          {pestana === "datos" && (
            <div className="bg-marca-superficie rounded-xl px-3.5 divide-y divide-marca-borde">
              <div className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-marca-tenue text-xs">
                  <BedDouble className="w-3.5 h-3.5 text-marca-rojoclaro" /> Descanso semanal
                </span>
                <span className="text-marca-textofuerte text-xs font-bold">{textoDescanso}</span>
              </div>
              <FilaEdad key={perfil.usuarioId} perfil={perfil} />
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
          )}
        </div>
      </div>

      {esPropio && (
        <div ref={ajustesRef}>
          <AjustesSonido />
        </div>
      )}

      {esPropio && directorio.length > 0 && (
        <CarruselEquipo directorio={directorio} onAbrirPerfil={onAbrirPerfil} />
      )}
    </div>
  );
}

const PLURAL_ROL: Record<string, string> = {
  coordinador: "Coordinadores",
  supervisor: "Supervisores",
  capacitador: "Capacitadores",
  gerente: "Gerencia",
};

// "Perfil de tu equipo": una tarjeta grande por compañero (portada del
// color de su rol, foto, puntos, medallas y racha) que se pasan deslizando,
// con puntitos abajo que marcan en cuál vas. El anillo de la foto se pone
// rojo-naranja si tiene historias sin ver, el punto verde indica que está
// en línea, y "📍 en campo" que hoy marcó llegada a una tienda y no ha salido.
function CarruselEquipo({
  directorio,
  onAbrirPerfil,
}: {
  directorio: PersonaDirectorio[];
  onAbrirPerfil: (usuarioId: string) => void;
}) {
  const [filtro, setFiltro] = useState<string>("todos");
  const [actual, setActual] = useState(0);
  const pistaRef = useRef<HTMLDivElement>(null);

  const roles = ["coordinador", "supervisor", "capacitador", "gerente"].filter((r) =>
    directorio.some((p) => p.rol === r)
  );
  const lista = filtro === "todos" ? directorio : directorio.filter((p) => p.rol === filtro);

  function alDeslizar() {
    const pista = pistaRef.current;
    if (!pista || !pista.firstElementChild) return;
    const ancho = (pista.firstElementChild as HTMLElement).offsetWidth + 12;
    setActual(Math.min(lista.length - 1, Math.round(pista.scrollLeft / ancho)));
  }

  function cambiarFiltro(r: string) {
    setFiltro(r);
    setActual(0);
    pistaRef.current?.scrollTo({ left: 0 });
  }

  function irA(i: number) {
    const pista = pistaRef.current;
    if (!pista || !pista.firstElementChild) return;
    const ancho = (pista.firstElementChild as HTMLElement).offsetWidth + 12;
    pista.scrollTo({ left: i * ancho, behavior: "smooth" });
  }

  // Con muchos compañeros, los puntitos se vuelven un contador ("3 / 24").
  const muchos = lista.length > 12;

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-marca-tenue text-[11px] font-black uppercase tracking-widest">Perfil de tu equipo</p>
        <p className="text-marca-tenue text-[10.5px]">Desliza para conocer a tu equipo.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {["todos", ...roles].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => cambiarFiltro(r)}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold border transition ${
              filtro === r
                ? "bg-marca-textofuerte text-marca-fondo border-marca-textofuerte"
                : "border-marca-borde text-marca-tenue"
            }`}
          >
            {r === "todos" ? "Todos" : (PLURAL_ROL[r] ?? r)}
          </button>
        ))}
      </div>

      <div
        ref={pistaRef}
        onScroll={alDeslizar}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lista.map((persona) => {
          const color = COLOR_ROL[persona.rol] ?? "#8b8d92";
          const presencia = calcularPresencia(persona.ultimaActividad);
          return (
            <div
              key={persona.usuarioId}
              className="snap-center shrink-0 w-[82%] max-w-[300px] rounded-2xl overflow-hidden bg-marca-superficie border border-marca-borde"
            >
              <div className="h-20" style={{ background: `linear-gradient(135deg, ${color}, ${color}10)` }} />
              <div className="-mt-11 flex justify-center">
                <div
                  className="relative w-20 h-20 rounded-full p-[3px]"
                  style={{
                    background: persona.historiasSinVer
                      ? "conic-gradient(from 200deg, #e23744, #f59e0b, #e23744)"
                      : color,
                  }}
                >
                  <div
                    className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-lg font-black border-[3px] border-marca-superficie"
                    style={{ background: persona.fotoUrl ? undefined : `${color}26`, color }}
                  >
                    {persona.fotoUrl ? (
                      <img src={persona.fotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      iniciales(persona.nombre)
                    )}
                  </div>
                  {presencia?.enLinea && (
                    <span
                      title="En línea"
                      className="absolute right-1 bottom-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-marca-superficie"
                    />
                  )}
                </div>
              </div>
              <div className="px-4 pt-2 pb-4 text-center space-y-1">
                <p className="text-marca-textofuerte text-[15px] font-bold leading-tight">{persona.nombre}</p>
                <p className="text-[11.5px] font-bold" style={{ color }}>
                  {ETIQUETA_ROL[persona.rol] ?? persona.rol}
                  {persona.enCampo ? <span className="text-marca-tenue"> · 📍 en campo</span> : null}
                </p>
                {presencia && (
                  <p className={`text-[11px] font-bold ${presencia.enLinea ? "text-emerald-400" : "text-marca-tenue"}`}>
                    {presencia.texto}
                  </p>
                )}
                <p className="text-base leading-none min-h-[20px]">
                  {persona.medallas
                    ? UMBRALES_MEDALLAS.flatMap((u) =>
                        Array.from({ length: Math.min(persona.medallas![u.id], 3) }, () => u.emoji)
                      ).join("") || "—"
                    : "—"}
                </p>
                <div className="grid grid-cols-3 pt-1.5 tabular-nums">
                  <div>
                    <p className="text-marca-textofuerte text-sm font-black">{persona.puntos.toLocaleString("es-PE")}</p>
                    <p className="text-marca-tenue text-[10px]">puntos</p>
                  </div>
                  <div>
                    <p className="text-marca-textofuerte text-sm font-black">{persona.rachaActual}</p>
                    <p className="text-marca-tenue text-[10px]">días de racha</p>
                  </div>
                  <div>
                    <p className="text-marca-textofuerte text-sm font-black">
                      {persona.historiasSinVer ? "Nuevas" : persona.tieneHistorias ? "Vistas" : "—"}
                    </p>
                    <p className="text-marca-tenue text-[10px]">historias</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAbrirPerfil(persona.usuarioId)}
                  className="w-full mt-2 bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2 rounded-lg text-[12px]"
                >
                  Ver perfil
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {lista.length > 1 &&
        (muchos ? (
          <p className="text-center text-marca-tenue text-[11px] font-bold tabular-nums">
            {actual + 1} / {lista.length}
          </p>
        ) : (
          <div className="flex justify-center gap-1.5">
            {lista.map((p, i) => (
              <button
                key={p.usuarioId}
                type="button"
                aria-label={`Ir a ${p.nombre}`}
                onClick={() => irA(i)}
                className={`h-1.5 rounded-full transition-all ${i === actual ? "w-4 bg-marca-textofuerte" : "w-1.5 bg-marca-borde"}`}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

// Interruptor con el mismo estilo en toda la pantalla de perfil.
function Interruptor({ activo }: { activo: boolean }) {
  return (
    <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${activo ? "bg-marca-rojo" : "bg-marca-borde"}`}>
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${activo ? "left-[18px]" : "left-0.5"}`}
      />
    </span>
  );
}

// Edad en "Datos". En tu perfil: la ves siempre y eliges si los demás la
// ven. En el de otro: se ve solo si esa persona la muestra y tú también
// muestras la tuya (recíproco, como la "última vez" de WhatsApp).
function FilaEdad({ perfil }: { perfil: PerfilCompleto }) {
  const [mostrar, setMostrar] = useState(perfil.mostrarEdad);
  const [guardando, setGuardando] = useState(false);

  async function alternar() {
    if (guardando) return;
    const nuevo = !mostrar;
    setMostrar(nuevo);
    setGuardando(true);
    const r = await cambiarMostrarEdad(nuevo).catch(() => ({ ok: false }));
    if (!r.ok) setMostrar(!nuevo);
    setGuardando(false);
  }

  const textoEdad =
    perfil.edad !== null
      ? `${perfil.edad} año${perfil.edad !== 1 ? "s" : ""}`
      : perfil.edadOculta
        ? "Oculta"
        : "No registrada";

  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-marca-tenue text-xs">
          <Cake className="w-3.5 h-3.5 text-marca-rojoclaro" /> Edad
        </span>
        <span className="text-marca-textofuerte text-xs font-bold">{textoEdad}</span>
      </div>
      {perfil.esPropio && (
        <button
          type="button"
          role="switch"
          aria-checked={mostrar}
          onClick={alternar}
          disabled={guardando}
          className="w-full flex items-center justify-between disabled:opacity-60"
        >
          <span className="text-marca-tenue text-[11px] text-left">
            {mostrar ? "Los demás pueden ver tu edad" : "Tu edad está oculta (tampoco verás la de otros)"}
          </span>
          <Interruptor activo={mostrar} />
        </button>
      )}
      {perfil.edadOculta === "tuya" && (
        <p className="text-marca-tenue text-[10px]">Activa tu edad en tu perfil para ver la de los demás.</p>
      )}
    </div>
  );
}

// Interruptores de sonido y vibración de la app. Se guardan en este celular
// (no en la cuenta): alguien puede querer silencio en el celular del trabajo
// y sonido en el propio.
function AjustesSonido() {
  const [sonido, setSonido] = useState(true);
  const [vibracion, setVibracion] = useState(true);

  useEffect(() => {
    setSonido(sonidoActivado());
    setVibracion(vibracionActivada());
  }, []);

  function alternarSonido() {
    const nuevo = !sonido;
    cambiarSonido(nuevo);
    setSonido(nuevo);
    if (nuevo) reproducirSonidoExito();
  }

  function alternarVibracion() {
    const nueva = !vibracion;
    cambiarVibracion(nueva);
    setVibracion(nueva);
    if (nueva) {
      try {
        navigator.vibrate?.(60);
      } catch {}
    }
  }

  const filas = [
    { etiqueta: "Sonidos de la app", icono: Volume2, activo: sonido, alternar: alternarSonido },
    { etiqueta: "Vibración", icono: Smartphone, activo: vibracion, alternar: alternarVibracion },
  ];

  return (
    <div>
      <p className="text-marca-tenue text-[11px] font-black uppercase tracking-widest mb-1">Sonido y vibración</p>
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] px-3.5 divide-y divide-marca-borde">
        {filas.map(({ etiqueta, icono: Icono, activo, alternar }) => (
          <button
            key={etiqueta}
            type="button"
            role="switch"
            aria-checked={activo}
            onClick={alternar}
            className="w-full flex items-center justify-between py-2.5"
          >
            <span className="flex items-center gap-2 text-marca-tenue text-xs">
              <Icono className="w-3.5 h-3.5 text-marca-rojoclaro" /> {etiqueta}
            </span>
            <Interruptor activo={activo} />
          </button>
        ))}
      </div>
      <p className="text-marca-tenue text-[10px] mt-1">Solo en este celular. En iPhone no hay vibración.</p>
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
