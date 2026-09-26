"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Lock, X } from "lucide-react";
import { obtenerEncuestasPendientes, responderEncuesta, type EncuestaPendiente } from "./actions";
import { CARITAS, MAX_LARGO_RESPUESTA_TEXTO, estaRespondida, type Respuesta } from "@/lib/encuestas-completas";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";
import { recordarUnaVez, reproducirSonidoExito } from "@/lib/sonido";

// Aviso fijo al inicio del panel mientras haya encuestas sin responder. Al
// tocarlo se abre la encuesta a pantalla completa, una pregunta por
// pantalla (como las Historias).
export default function EncuestasPendientes() {
  const [pendientes, setPendientes] = useState<EncuestaPendiente[]>([]);
  const [abierta, setAbierta] = useState<EncuestaPendiente | null>(null);

  useEffect(() => {
    obtenerEncuestasPendientes()
      .then((lista) => {
        setPendientes(lista);
        if (lista.length > 0) recordarUnaVez(`encuestas-${lista.map((e) => e.id).join(",")}`);
      })
      .catch(() => {});
  }, []);

  if (pendientes.length === 0 && !abierta) return null;

  return (
    <>
      {pendientes.length > 0 && (
        <div className="space-y-2">
          {pendientes.map((e) => {
            const n = e.preguntas.length;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setAbierta(e)}
                className="w-full text-left bg-marca-rojo/15 border border-marca-rojo rounded-[3px] p-4 flex items-center gap-3 hover:bg-marca-rojo/25 transition"
              >
                <span className="w-9 h-9 shrink-0 rounded-full bg-marca-rojo text-white font-black grid place-items-center">
                  ?
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-marca-textofuerte font-bold text-sm">
                    Tienes una encuesta pendiente
                  </span>
                  <span className="block text-marca-tenue text-[11px] truncate">
                    {e.titulo} · {n} {n === 1 ? "pregunta" : "preguntas"}
                    {e.puntos > 0 ? ` · +${e.puntos} pts` : ""}
                    {e.cierra ? ` · hasta el ${formatearFechaLegible(e.cierra)}` : ""}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-marca-tenue shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {abierta && (
        <ResponderEncuesta
          encuesta={abierta}
          onCerrar={(respondida) => {
            if (respondida) setPendientes((prev) => prev.filter((e) => e.id !== abierta.id));
            setAbierta(null);
          }}
        />
      )}
    </>
  );
}

function ResponderEncuesta({
  encuesta,
  onCerrar,
}: {
  encuesta: EncuestaPendiente;
  onCerrar: (respondida: boolean) => void;
}) {
  const total = encuesta.preguntas.length;
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Respuesta[]>(() => encuesta.preguntas.map(() => null));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puntosGanados, setPuntosGanados] = useState<number | null>(null);

  // Bloquea el scroll de la página de fondo mientras está abierta.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  const terminado = puntosGanados !== null;
  const pregunta = encuesta.preguntas[paso];
  const respuesta = respuestas[paso];
  const puedeSeguir = !pregunta || !pregunta.obligatoria || estaRespondida(respuesta);
  const esUltima = paso === total - 1;

  function responder(valor: Respuesta) {
    setRespuestas((prev) => prev.map((r, i) => (i === paso ? valor : r)));
    setError(null);
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await responderEncuesta(encuesta.id, respuestas);
      if (r.exito) {
        setPuntosGanados(r.puntos ?? 0);
        reproducirSonidoExito();
      } else {
        setError(r.mensaje || "No se pudo enviar.");
      }
    } catch {
      setError("Sin conexión. Tus respuestas siguen aquí: intenta de nuevo cuando tengas señal.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={encuesta.titulo}
      className="fixed inset-0 z-50 bg-marca-fondo flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-lg w-full mx-auto flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-4 pt-4">
          <div className="flex-1 flex gap-1">
            {encuesta.preguntas.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${terminado || i <= paso ? "bg-marca-rojo" : "bg-marca-borde"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onCerrar(terminado)}
            aria-label="Cerrar"
            className="text-marca-tenue hover:text-marca-textofuerte"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {terminado ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <p className="text-5xl">🎉</p>
              <p className="text-marca-textofuerte text-xl font-bold">¡Gracias por responder!</p>
              {puntosGanados > 0 ? (
                <>
                  <p className="font-data text-3xl font-bold text-marca-textofuerte">+{puntosGanados} pts</p>
                  <p className="text-marca-tenue text-sm">Se sumaron a tus puntos.</p>
                </>
              ) : (
                <p className="text-marca-tenue text-sm">Tus respuestas quedaron registradas.</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {paso === 0 && (
                <div className="space-y-1">
                  <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
                    {encuesta.titulo}
                  </p>
                  {encuesta.descripcion && <p className="text-marca-tenue text-sm">{encuesta.descripcion}</p>}
                  {encuesta.anonima && (
                    <p className="text-marca-tenue text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Anónima: en los resultados no aparece tu nombre
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <p className="font-data text-[11px] text-marca-tenue">
                  PREGUNTA {paso + 1} DE {total}
                  {pregunta.tipo === "multiple" ? " · puedes marcar varias" : ""}
                  {!pregunta.obligatoria ? " · opcional" : ""}
                </p>
                <p className="text-marca-textofuerte text-lg font-bold leading-snug">{pregunta.texto}</p>
              </div>

              {pregunta.tipo === "caritas" && (
                <div className="grid grid-cols-5 gap-2">
                  {CARITAS.map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      onClick={() => responder(c.valor)}
                      aria-pressed={respuesta === c.valor}
                      className={`rounded-[3px] border py-3 flex flex-col items-center gap-1 transition ${
                        respuesta === c.valor
                          ? "border-marca-rojo bg-marca-rojo/15"
                          : "border-marca-borde bg-marca-superficie hover:border-marca-rojoclaro"
                      }`}
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="text-[9px] text-marca-tenue leading-tight text-center">{c.etiqueta}</span>
                    </button>
                  ))}
                </div>
              )}

              {(pregunta.tipo === "unica" || pregunta.tipo === "multiple") && (
                <div className="space-y-2">
                  {(pregunta.opciones ?? []).map((texto, i) => {
                    const marcada =
                      pregunta.tipo === "unica"
                        ? respuesta === i
                        : Array.isArray(respuesta) && respuesta.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={marcada}
                        onClick={() => {
                          if (pregunta.tipo === "unica") return responder(i);
                          const actual = Array.isArray(respuesta) ? respuesta : [];
                          responder(marcada ? actual.filter((o) => o !== i) : [...actual, i].sort((a, b) => a - b));
                        }}
                        className={`w-full text-left rounded-[3px] border px-4 py-3 text-sm flex items-center gap-3 transition ${
                          marcada
                            ? "border-marca-rojo bg-marca-rojo/15 text-marca-textofuerte"
                            : "border-marca-borde bg-marca-superficie text-marca-texto hover:border-marca-rojoclaro"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 shrink-0 border ${
                            pregunta.tipo === "unica" ? "rounded-full" : "rounded-[2px]"
                          } ${marcada ? "bg-marca-rojo border-marca-rojo" : "border-marca-tenue"}`}
                        />
                        <span className="break-words">{texto}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {pregunta.tipo === "texto" && (
                <div>
                  <textarea
                    id={`encuesta-${encuesta.id}-texto-${paso}`}
                    value={typeof respuesta === "string" ? respuesta : ""}
                    onChange={(e) => responder(e.target.value)}
                    maxLength={MAX_LARGO_RESPUESTA_TEXTO}
                    rows={5}
                    placeholder={encuesta.anonima ? "Escribe aquí (es anónimo)" : "Escribe aquí"}
                    className="w-full p-3 bg-marca-superficie border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
                  />
                  <p className="text-marca-tenue text-[10px] text-right font-data">
                    {(typeof respuesta === "string" ? respuesta.length : 0)}/{MAX_LARGO_RESPUESTA_TEXTO}
                  </p>
                </div>
              )}

              {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex gap-2">
          {terminado ? (
            <button
              type="button"
              onClick={() => onCerrar(true)}
              className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro text-white font-black py-3 rounded-[3px] text-xs tracking-widest uppercase"
            >
              Listo
            </button>
          ) : (
            <>
              {paso > 0 && (
                <button
                  type="button"
                  onClick={() => setPaso((p) => p - 1)}
                  disabled={enviando}
                  className="px-5 border border-marca-borde text-marca-texto font-black py-3 rounded-[3px] text-xs tracking-widest uppercase disabled:opacity-50"
                >
                  Atrás
                </button>
              )}
              <button
                type="button"
                onClick={() => (esUltima ? enviar() : setPaso((p) => p + 1))}
                disabled={!puedeSeguir || enviando}
                className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-40 text-white font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
              >
                {enviando
                  ? "Enviando..."
                  : esUltima
                    ? "Enviar"
                    : !estaRespondida(respuesta) && !pregunta.obligatoria
                      ? "Saltar"
                      : "Siguiente"}
              </button>
            </>
          )}
        </div>
        {!terminado && encuesta.cierra === hoyPeru() && (
          <p className="text-center text-marca-tenue text-[10px] pb-3">Esta encuesta cierra hoy.</p>
        )}
      </div>
    </div>
  );
}
