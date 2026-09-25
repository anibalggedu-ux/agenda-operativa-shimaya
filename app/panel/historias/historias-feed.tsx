"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, AlertTriangle, Trash2, Send, Camera, UserRound, Images, Type } from "lucide-react";
import {
  obtenerFeedHistorias,
  crearHistoria,
  eliminarHistoria,
  obtenerDetalleHistoria,
  agregarComentario,
  eliminarComentario,
  alternarReaccion,
  registrarVista,
  obtenerMiSaldoDeRegalo,
  regalarPuntos,
  type GrupoHistorias,
  type DetalleHistoria,
  type SaldoRegalo,
} from "./actions";
import { obtenerRachaPublicacion } from "./social-actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { reproducirSonidoExito } from "@/lib/sonido";
import ComposerTexto from "./composer-texto";

// Mismo set en el compositor (pie de foto) y en las reacciones que deja el
// resto del equipo sobre una historia ya publicada.
const EMOJIS_HISTORIA = ["👍", "❤️", "😂", "😮", "🔥", "👏", "🎉", "💪", "🙌", "⭐"];
const TEXTO_MAXIMO = 200;
const COMENTARIO_MAXIMO = 300;
// Cuánto dura cada foto antes de avanzar sola, como en WhatsApp/Instagram.
const DURACION_AUTOAVANCE_MS = 5000;

// Solo +50 va relleno -- el tratamiento más celebratorio se reserva para el
// regalo más generoso, el resto queda como contorno discreto.
const BOTONES_REGALO = [
  { monto: 5, clase: "text-[11px] px-2.5 py-1 font-bold" },
  { monto: 10, clase: "text-xs px-3 py-1.5 font-bold" },
  { monto: 15, clase: "text-xs px-3 py-1.5 font-black" },
  { monto: 20, clase: "text-sm px-3.5 py-2 font-black" },
  { monto: 50, clase: "text-base px-5 py-2.5 font-black" },
];

// Corazón grande que aparece y se desvanece al doble-tocar la foto -- usa
// la Web Animations API en vez de CSS global, para no depender de una
// animación definida fuera de este componente.
function CorazonAnimado({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    ref.current?.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.35 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.7 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
      ],
      { duration: 800, easing: "ease-out" }
    );
  }, []);

  return (
    <span
      ref={ref}
      className="absolute text-7xl pointer-events-none"
      style={{ left: x, top: y, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))" }}
    >
      ❤️
    </span>
  );
}

function BarraReacciones({
  reacciones,
  miReaccion,
  onReaccionar,
  deshabilitado,
}: {
  reacciones: { emoji: string; cantidad: number }[];
  miReaccion: string | null;
  onReaccionar: (emoji: string) => void;
  deshabilitado: boolean;
}) {
  function cantidadDe(emoji: string) {
    return reacciones.find((r) => r.emoji === emoji)?.cantidad ?? 0;
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {EMOJIS_HISTORIA.map((emoji) => {
        const cantidad = cantidadDe(emoji);
        const esMia = miReaccion === emoji;
        return (
          <button
            key={emoji}
            type="button"
            disabled={deshabilitado}
            onClick={() => onReaccionar(emoji)}
            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border text-sm transition disabled:opacity-50 ${
              esMia
                ? "bg-marca-rojo/20 border-marca-rojoclaro"
                : "bg-white/5 border-white/15 hover:border-white/35"
            }`}
          >
            <span>{emoji}</span>
            {cantidad > 0 && <span className="text-[10px] font-bold text-white/80">{cantidad}</span>}
          </button>
        );
      })}
    </div>
  );
}

function VisorHistorias({
  grupo,
  indiceInicial,
  miUsuarioId,
  miRol,
  onCerrar,
  onEliminada,
  onVista,
  onGrupoSiguiente,
  onGrupoAnterior,
}: {
  grupo: GrupoHistorias;
  indiceInicial: number;
  miUsuarioId: string;
  miRol: string;
  onCerrar: () => void;
  onEliminada: () => void;
  onVista: (historiaId: string) => void;
  // Al terminar la última historia (o tocar "Siguiente" en ella) se pasa a
  // la persona que sigue, como en WhatsApp; si no hay más, se cierra.
  onGrupoSiguiente: () => void;
  // Tocar "Anterior" en la primera historia vuelve a la persona anterior.
  onGrupoAnterior: (() => void) | null;
}) {
  const [indice, setIndice] = useState(indiceInicial);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [detalle, setDetalle] = useState<DetalleHistoria | null>(null);
  const [reaccionando, setReaccionando] = useState(false);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  const [saldoRegalo, setSaldoRegalo] = useState<SaldoRegalo | null>(null);
  const [enviandoRegalo, setEnviandoRegalo] = useState(false);
  const [mensajeRegalo, setMensajeRegalo] = useState<string | null>(null);
  const [montoConfirmado, setMontoConfirmado] = useState<number | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [corazonAnimado, setCorazonAnimado] = useState<{ x: number; y: number; clave: number } | null>(null);

  const historia = grupo.historias[indice];
  const esPropia = grupo.usuarioId === miUsuarioId;
  const esModerador = miRol === "coordinador" || miRol === "gerente";
  const puedeBorrarFoto = esPropia || esModerador;
  const primerNombre = grupo.nombre.split(" ")[0];
  const esUltima = indice === grupo.historias.length - 1;

  const pausadoRef = useRef(false);
  const inicioRef = useRef(0);
  const acumuladoRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const ultimoTapRef = useRef(0);
  const tapPendienteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!corazonAnimado) return;
    const t = setTimeout(() => setCorazonAnimado(null), 800);
    return () => clearTimeout(t);
  }, [corazonAnimado]);

  useEffect(() => {
    setDetalle(null);
    setComentarioTexto("");
    obtenerDetalleHistoria(historia.id)
      .then(setDetalle)
      .catch(() => setDetalle({ comentarios: [], reacciones: [], miReaccion: null, vistas: [] }));
    if (!esPropia) {
      registrarVista(historia.id).catch(() => {});
      onVista(historia.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historia.id]);

  // Auto-avance: la foto actual se llena sola y pasa a la siguiente, como en
  // WhatsApp/Instagram; al terminar la última pasa a la persona que sigue.
  useEffect(() => {
    setProgreso(0);
    acumuladoRef.current = 0;
    inicioRef.current = performance.now();
    pausadoRef.current = false;

    function tick(ahora: number) {
      if (!pausadoRef.current) {
        const transcurrido = acumuladoRef.current + (ahora - inicioRef.current);
        const p = Math.min(transcurrido / DURACION_AUTOAVANCE_MS, 1);
        setProgreso(p);
        if (p >= 1) {
          if (!esUltima) setIndice((i) => i + 1);
          else onGrupoSiguiente();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historia.id]);

  function pausar() {
    if (pausadoRef.current) return;
    acumuladoRef.current += performance.now() - inicioRef.current;
    pausadoRef.current = true;
  }

  function reanudar() {
    if (!pausadoRef.current) return;
    inicioRef.current = performance.now();
    pausadoRef.current = false;
  }

  function alTocarImagen(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const esIzquierda = x < rect.width * 0.3;
    const ahora = Date.now();

    if (ahora - ultimoTapRef.current < 300) {
      if (tapPendienteRef.current) {
        clearTimeout(tapPendienteRef.current);
        tapPendienteRef.current = null;
      }
      ultimoTapRef.current = 0;
      setCorazonAnimado({ x, y, clave: ahora });
      if (detalle?.miReaccion !== "❤️") reaccionar("❤️");
      return;
    }

    ultimoTapRef.current = ahora;
    tapPendienteRef.current = setTimeout(() => {
      tapPendienteRef.current = null;
      if (esIzquierda) {
        if (indice > 0) setIndice((i) => i - 1);
        else onGrupoAnterior?.();
      } else if (!esUltima) {
        setIndice((i) => i + 1);
      } else {
        onGrupoSiguiente();
      }
    }, 280);
  }

  useEffect(() => {
    if (esPropia) return;
    obtenerMiSaldoDeRegalo().then(setSaldoRegalo).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function regalar(monto: number) {
    setEnviandoRegalo(true);
    setMensajeRegalo(null);
    const resultado = await regalarPuntos(historia.id, monto);
    if (resultado.exito) {
      setSaldoRegalo((s) => (s ? { ...s, saldo: resultado.saldo ?? s.saldo, totalDonado: s.totalDonado + monto } : s));
      setMontoConfirmado(monto);
      reproducirSonidoExito();
      setTimeout(() => setMontoConfirmado(null), 2500);
    } else {
      setMensajeRegalo(resultado.mensaje || "No se pudo enviar el regalo.");
      if (resultado.saldo !== undefined) {
        setSaldoRegalo((s) => (s ? { ...s, saldo: resultado.saldo! } : s));
      }
    }
    setEnviandoRegalo(false);
  }

  async function confirmarBorrado() {
    setEliminando(true);
    setMensaje(null);
    const resultado = await eliminarHistoria(historia.id);
    if (resultado.exito) {
      onEliminada();
    } else {
      setMensaje(resultado.mensaje || "No se pudo borrar la foto.");
      setEliminando(false);
      setConfirmando(false);
    }
  }

  async function reaccionar(emoji: string) {
    setReaccionando(true);
    const resultado = await alternarReaccion(historia.id, emoji);
    if (resultado.exito) {
      setDetalle((d) => (d ? { ...d, reacciones: resultado.reacciones ?? [], miReaccion: resultado.miReaccion ?? null } : d));
      if (resultado.miReaccion) reproducirSonidoExito();
    } else {
      setMensaje(resultado.mensaje || "No se pudo reaccionar.");
    }
    setReaccionando(false);
  }

  async function enviarComentario() {
    const texto = comentarioTexto.trim();
    if (!texto) return;
    setEnviandoComentario(true);
    const resultado = await agregarComentario(historia.id, texto);
    if (resultado.exito) {
      setComentarioTexto("");
      const actualizado = await obtenerDetalleHistoria(historia.id);
      setDetalle(actualizado);
      reproducirSonidoExito();
    } else {
      setMensaje(resultado.mensaje || "No se pudo publicar el comentario.");
    }
    setEnviandoComentario(false);
  }

  async function borrarComentario(comentarioId: string) {
    const resultado = await eliminarComentario(comentarioId);
    if (resultado.exito) {
      setDetalle((d) => (d ? { ...d, comentarios: d.comentarios.filter((c) => c.id !== comentarioId) } : d));
    } else {
      setMensaje(resultado.mensaje || "No se pudo borrar el comentario.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 mb-2">
          {grupo.historias.map((_, i) => (
            <span key={i} className="h-0.5 flex-1 rounded bg-white/25 overflow-hidden">
              <span
                className="block h-full bg-marca-rojoclaro"
                style={{
                  width: i < indice ? "100%" : i === indice ? `${progreso * 100}%` : "0%",
                  transition: i === indice ? "none" : "width 0.15s linear",
                }}
              />
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-white text-sm font-bold truncate">
              {grupo.nombre} <span className="text-white/50 font-normal text-xs capitalize">· {grupo.rol}</span>
            </p>
            {puedeBorrarFoto && (
              <button
                onClick={() => setConfirmando(true)}
                className="shrink-0 text-white/45 hover:text-marca-rojoclaro p-1 -m-1"
                aria-label="Borrar esta foto"
                title={esPropia ? "Borrar mi foto" : "Borrar por moderación"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button onClick={onCerrar} className="shrink-0 text-white/70 hover:text-white p-1 -m-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="relative select-none"
          onClick={confirmando ? undefined : alTocarImagen}
          onMouseDown={pausar}
          onMouseUp={reanudar}
          onMouseLeave={reanudar}
          onTouchStart={pausar}
          onTouchEnd={reanudar}
        >
          {/* El texto va dentro de los bordes de la foto (no del recuadro
              completo), en una franja oscura para que se lea aunque la foto
              sea clara. */}
          <div className="flex justify-center">
            <div className="relative inline-block max-w-full">
              <img
                src={historia.url}
                alt={`Historia de ${grupo.nombre}`}
                className="block max-w-full max-h-[48vh] w-auto h-auto object-contain rounded-[3px]"
                draggable={false}
              />
              {historia.texto && (
                <p className="absolute bottom-2 inset-x-2 bg-black/70 backdrop-blur-sm text-white text-[13px] font-semibold leading-snug text-center whitespace-pre-line break-words px-3 py-2 rounded-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                  {historia.texto}
                </p>
              )}
            </div>
          </div>

          {corazonAnimado && <CorazonAnimado key={corazonAnimado.clave} x={corazonAnimado.x} y={corazonAnimado.y} />}

          {confirmando && (
            <div
              className="absolute inset-0 bg-black/85 flex items-center justify-center rounded-[3px] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-marca-superficie2 border border-marca-borde rounded-[3px] p-4 space-y-3 max-w-xs text-center">
                <p className="text-marca-texto text-sm font-bold">¿Borrar esta foto?</p>
                <p className="text-marca-tenue text-xs">
                  {esPropia
                    ? "Se elimina para todo el equipo y no se puede deshacer."
                    : "Se elimina por moderación, para todo el equipo, y no se puede deshacer."}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={eliminando}
                    className="flex-1 min-h-[40px] border border-marca-borde text-marca-texto text-xs font-bold rounded-[3px] disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarBorrado}
                    disabled={eliminando}
                    className="flex-1 min-h-[40px] bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte text-xs font-black rounded-[3px] disabled:opacity-60"
                  >
                    {eliminando ? "Borrando..." : "Sí, borrar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {(esPropia || esModerador) && detalle && (
          <p className="text-white/45 text-[10.5px] mt-2">
            👁 Visto por{" "}
            {detalle.vistas.length === 0
              ? "nadie todavía"
              : detalle.vistas.map((v) => v.nombre.split(" ")[0]).join(", ")}
          </p>
        )}

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <div className="mt-3">
          <BarraReacciones
            reacciones={detalle?.reacciones ?? []}
            miReaccion={detalle?.miReaccion ?? null}
            onReaccionar={reaccionar}
            deshabilitado={reaccionando || !detalle}
          />
        </div>

        {(esPropia || esModerador) &&
          detalle &&
          detalle.reacciones.some((r) => r.nombres && r.nombres.length > 0) && (
            <p className="text-white/45 text-[10.5px] mt-1.5">
              {detalle.reacciones
                .filter((r) => r.nombres && r.nombres.length > 0)
                .map((r) => `${r.emoji} ${r.nombres!.map((n) => n.split(" ")[0]).join(", ")}`)
                .join(" · ")}
            </p>
          )}

        {!esPropia && (
          <div className="mt-3 bg-marca-rojo/10 border border-marca-rojo/30 rounded-[3px] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-white text-xs font-black">🎁 Regalar puntos a {primerNombre}</p>
              {saldoRegalo && (
                <p className="text-white/60 text-[10.5px]">Tienes {saldoRegalo.saldo} pts disponibles</p>
              )}
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              {BOTONES_REGALO.map(({ monto, clase }) => (
                <button
                  key={monto}
                  type="button"
                  disabled={enviandoRegalo || !saldoRegalo || saldoRegalo.saldo < monto}
                  onClick={() => regalar(monto)}
                  className={`rounded-full border transition disabled:opacity-40 ${clase} ${
                    monto === 50
                      ? "bg-marca-rojo border-marca-rojo text-white"
                      : "bg-transparent border-white/25 text-white/85 hover:border-marca-rojoclaro"
                  }`}
                >
                  +{monto}
                </button>
              ))}
            </div>

            {montoConfirmado && (
              <p className="text-emerald-400 text-xs font-bold">
                🎉 Le regalaste {montoConfirmado} pts a {primerNombre}.
              </p>
            )}
            {mensajeRegalo && <p className="text-marca-rojoclaro text-[11px] font-bold">{mensajeRegalo}</p>}
          </div>
        )}

        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {detalle && detalle.comentarios.length === 0 && (
            <p className="text-white/40 text-[11px]">Todavía no hay comentarios.</p>
          )}
          {detalle?.comentarios.map((c) => {
            const puedeBorrar = c.usuarioId === miUsuarioId || esModerador;
            return (
              <div key={c.id} className="flex items-start justify-between gap-2 bg-white/5 rounded-[3px] px-2.5 py-1.5">
                <p className="text-white text-xs min-w-0 break-words">
                  <span className="font-bold">{c.nombre}</span>{" "}
                  <span className="text-white/40 text-[10px] uppercase">({c.rol})</span>{" "}
                  <span className="text-white/85">{c.texto}</span>
                </p>
                {puedeBorrar && (
                  <button
                    onClick={() => borrarComentario(c.id)}
                    className="shrink-0 text-white/40 hover:text-marca-rojoclaro"
                    aria-label="Borrar comentario"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <input
            value={comentarioTexto}
            onFocus={pausar}
            onBlur={() => {
              if (!comentarioTexto.trim()) reanudar();
            }}
            onChange={(e) => setComentarioTexto(e.target.value.slice(0, COMENTARIO_MAXIMO))}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviarComentario();
            }}
            placeholder="Escribe un comentario..."
            className="flex-1 bg-white/10 border border-white/20 rounded-full px-3.5 py-2 text-xs text-white placeholder:text-white/40"
          />
          <button
            onClick={enviarComentario}
            disabled={enviandoComentario || !comentarioTexto.trim()}
            aria-label="Enviar comentario"
            className="shrink-0 w-9 h-9 flex items-center justify-center bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 rounded-full text-white"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-between mt-3 text-xs font-bold">
          <button
            disabled={indice === 0 && !onGrupoAnterior}
            onClick={() => (indice > 0 ? setIndice((i) => i - 1) : onGrupoAnterior?.())}
            className="text-white/70 hover:text-white disabled:opacity-30 disabled:hover:text-white/70"
          >
            ← Anterior
          </button>
          <button
            onClick={() => (esUltima ? onGrupoSiguiente() : setIndice((i) => i + 1))}
            className="text-white/70 hover:text-white disabled:opacity-30 disabled:hover:text-white/70"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

export type ItemPublicar = { foto: string; texto: string };

function ComposerHistoria({
  fotos,
  onCancelar,
  onPublicar,
  publicando,
  mensaje,
  progresoPublicacion,
}: {
  fotos: string[];
  onCancelar: () => void;
  onPublicar: (items: ItemPublicar[]) => void;
  publicando: boolean;
  mensaje: string | null;
  progresoPublicacion: { actual: number; total: number } | null;
}) {
  const [indice, setIndice] = useState(0);
  const [textos, setTextos] = useState<string[]>(() => fotos.map(() => ""));
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

        <img
          src={fotos[indice]}
          alt="Foto a publicar"
          className="w-full max-h-[45vh] object-contain rounded-[3px] bg-black"
        />

        <textarea
          value={textoActual}
          onChange={(e) => cambiarTexto(e.target.value)}
          placeholder="Escribe un pie de foto (opcional)..."
          rows={2}
          className="w-full bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3 py-2 text-sm text-marca-texto placeholder:text-marca-tenue resize-none"
        />
        <p className="text-right text-[10px] text-marca-tenue -mt-2">{textoActual.length}/{TEXTO_MAXIMO}</p>

        <div className="flex flex-wrap gap-2">
          {EMOJIS_HISTORIA.map((emoji) => (
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

export default function HistoriasFeed({ miUsuarioId, miRol }: { miUsuarioId: string; miRol: string }) {
  const [grupos, setGrupos] = useState<GrupoHistorias[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borradores, setBorradores] = useState<string[] | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [progresoPublicacion, setProgresoPublicacion] = useState<{ actual: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ grupo: GrupoHistorias; indice: number } | null>(null);
  const [vistosLocalmente, setVistosLocalmente] = useState<Set<string>>(new Set());
  const [racha, setRacha] = useState(0);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modoTexto, setModoTexto] = useState(false);
  const inputTraseraRef = useRef<HTMLInputElement>(null);
  const inputSelfieRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);

  // Como en WhatsApp: se abre en la primera historia que no has visto (o en
  // la primera, si ya viste todas).
  function abrirGrupo(g: GrupoHistorias, desdeElFinal = false) {
    if (desdeElFinal) {
      setVisor({ grupo: g, indice: g.historias.length - 1 });
      return;
    }
    const primeraSinVer = g.historias.findIndex((h) => !h.vistoPorMi && !vistosLocalmente.has(h.id));
    setVisor({ grupo: g, indice: g.usuarioId === miUsuarioId || primeraSinVer < 0 ? 0 : primeraSinVer });
  }

  const posicionVisor = visor ? grupos.findIndex((g) => g.usuarioId === visor.grupo.usuarioId) : -1;

  function irAlGrupoSiguiente() {
    const siguiente = posicionVisor >= 0 ? grupos[posicionVisor + 1] : undefined;
    if (siguiente) abrirGrupo(siguiente);
    else setVisor(null);
  }

  function cargar() {
    obtenerFeedHistorias()
      .then(setGrupos)
      .catch(() => setGrupos([]))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);
  useEffect(() => {
    obtenerRachaPublicacion().then(setRacha).catch(() => {});
  }, []);

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
      cargar();
      obtenerRachaPublicacion().then(setRacha).catch(() => {});
    } catch (err: any) {
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
        cargar();
        obtenerRachaPublicacion().then(setRacha).catch(() => {});
      } else {
        setMensaje(resultado.mensaje || "No se pudo publicar la historia.");
      }
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo publicar la historia.");
    } finally {
      setPublicando(false);
    }
  }

  if (cargando) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">HISTORIAS DEL EQUIPO</h3>
        {racha > 0 && (
          <span className="bg-orange-950/30 border border-orange-700/40 text-orange-300 text-[10px] font-black px-2.5 py-1 rounded-full">
            🔥 {racha} día{racha === 1 ? "" : "s"} publicando seguido
          </span>
        )}
      </div>

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

      <div className="flex gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          className="shrink-0 flex flex-col items-center gap-1 w-16"
        >
          <span className="w-14 h-14 rounded-full border-2 border-dashed border-marca-rojo/50 flex items-center justify-center text-marca-rojoclaro">
            <Plus className="w-5 h-5" />
          </span>
          <span className="text-[10px] text-marca-tenue truncate w-full text-center">Publicar</span>
        </button>

        {grupos.map((g) => {
          const ultima = g.historias[g.historias.length - 1];
          const esMiPropioGrupo = g.usuarioId === miUsuarioId;
          const todoVisto =
            esMiPropioGrupo || g.historias.every((h) => h.vistoPorMi || vistosLocalmente.has(h.id));
          return (
            <button
              key={g.usuarioId}
              type="button"
              onClick={() => abrirGrupo(g)}
              className="shrink-0 flex flex-col items-center gap-1 w-16"
            >
              <span className="relative w-14 h-14">
                <span
                  className={`block w-full h-full rounded-full p-[2px] ${
                    todoVisto ? "bg-marca-borde" : "bg-gradient-to-tr from-marca-rojo to-marca-rojoclaro"
                  }`}
                >
                  <span
                    className="block w-full h-full rounded-full bg-cover bg-center border-2 border-marca-fondo"
                    style={{ backgroundImage: `url(${ultima.url})` }}
                  />
                </span>
                {ultima.interacciones > 0 && (
                  <span className="absolute -bottom-1 -right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full bg-marca-rojo border-2 border-marca-fondo text-white text-[9px] font-black">
                    {ultima.interacciones > 9 ? "9+" : ultima.interacciones}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] truncate w-full text-center ${
                  todoVisto ? "text-marca-tenue" : "text-marca-texto"
                }`}
              >
                {g.nombre.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {mensaje && !borradores && !modoTexto && (
        <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
        </p>
      )}

      {grupos.length === 0 && (
        <p className="text-marca-tenue text-[11px]">Nadie ha publicado historias todavía — sé el primero.</p>
      )}

      {borradores && (
        <ComposerHistoria
          fotos={borradores}
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

      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
          onClick={() => setMenuAbierto(false)}
        >
          <div
            className="relative w-full max-w-sm bg-marca-superficie2 border-t border-marca-borde rounded-t-2xl pb-6"
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
            </div>

            <p className="text-marca-tenue text-[10.5px] text-center px-8 pt-5">
              En Galería puedes elegir varias fotos a la vez.
            </p>
          </div>
        </div>
      )}

      {visor && (
        <VisorHistorias
          key={visor.grupo.usuarioId}
          grupo={visor.grupo}
          indiceInicial={visor.indice}
          miUsuarioId={miUsuarioId}
          miRol={miRol}
          onCerrar={() => setVisor(null)}
          onEliminada={() => {
            setVisor(null);
            cargar();
          }}
          onVista={(historiaId) => setVistosLocalmente((prev) => new Set(prev).add(historiaId))}
          onGrupoSiguiente={irAlGrupoSiguiente}
          onGrupoAnterior={posicionVisor > 0 ? () => abrirGrupo(grupos[posicionVisor - 1], true) : null}
        />
      )}
    </div>
  );
}
