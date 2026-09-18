"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, User, Bot } from "lucide-react";
import { preguntarConsultorioIA, type MensajeConsultorio } from "./actions";

const SUGERENCIAS = [
  "¿Cómo marco mi llegada a una tienda?",
  "¿Cuántas tiendas tengo pendientes hoy?",
  "¿Cómo pido un cambio de día de descanso?",
  "¿Cómo va mi racha de puntualidad?",
];

export default function ConsultorioIA() {
  const [mensajes, setMensajes] = useState<MensajeConsultorio[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finalRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setError(null);
    const historialPrevio = mensajes;
    setMensajes((prev) => [...prev, { rol: "user", texto: limpio }]);
    setPregunta("");
    setEnviando(true);
    try {
      const respuesta = await preguntarConsultorioIA(limpio, historialPrevio);
      setMensajes((prev) => [...prev, { rol: "assistant", texto: respuesta }]);
    } catch (e: any) {
      setError(e?.message || "No se pudo conectar con la IA.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue mb-1">
          <Sparkles className="w-3.5 h-3.5 text-marca-rojoclaro" /> CONSULTORIO IA
        </h3>
        <p className="text-marca-tenue text-[11px]">
          Pregúntale cualquier cosa sobre cómo funciona el sistema, o sobre tus propios datos (tus tiendas de hoy,
          tu racha, tus kilómetros...).
        </p>
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 min-h-[320px] max-h-[520px] overflow-y-auto space-y-4">
        {mensajes.length === 0 && (
          <div className="space-y-3">
            <p className="text-marca-tenue text-sm italic">Prueba con alguna de estas preguntas:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="text-left text-xs bg-marca-fondo border border-marca-borde hover:border-marca-rojoclaro/50 rounded-full px-3 py-1.5 text-marca-texto transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.rol === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                m.rol === "user"
                  ? "bg-marca-rojo/20 text-marca-rojoclaro"
                  : "bg-marca-fondo border border-marca-borde text-marca-tenue"
              }`}
            >
              {m.rol === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`max-w-[80%] rounded-[3px] px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.rol === "user"
                  ? "bg-marca-rojo/15 text-marca-textofuerte"
                  : "bg-marca-fondo border border-marca-borde text-marca-texto"
              }`}
            >
              {m.texto}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-marca-fondo border border-marca-borde text-marca-tenue">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-marca-fondo border border-marca-borde rounded-[3px] px-3.5 py-2.5 text-sm text-marca-tenue animate-pulse">
              Pensando...
            </div>
          </div>
        )}

        <div ref={finalRef} />
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(pregunta);
        }}
        className="flex gap-2"
      >
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={enviando}
          className="flex-1 p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || !pregunta.trim()}
          className="flex items-center gap-1.5 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 px-4 rounded-[3px] text-xs uppercase tracking-widest transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
