"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { BarChart3, Lock, Plus, Target, Trash2, X } from "lucide-react";
import {
  crearComunicado,
  cerrarEncuesta,
  eliminarComunicado,
  type Comunicado,
  type ResultadosEncuesta,
  type ResultadoAccion,
  type UsuarioBasico,
} from "./actions";
import { SelectorDestinatarios } from "./anuncios";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";
import { MAX_LARGO_OPCION, MAX_OPCIONES_ENCUESTA, MIN_OPCIONES_ENCUESTA } from "@/lib/encuestas";

// Encuesta rápida: una sola pregunta que el equipo vota con un toque desde
// su widget de Anuncios (se guarda como un comunicado con
// encuesta_opciones). Se crea y se revisa desde la pestaña Encuestas, junto
// a las encuestas completas.

const estadoInicial: ResultadoAccion = { exito: false };

const claseCampo =
  "w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function EditorOpciones({
  opciones,
  onCambiar,
}: {
  opciones: string[];
  onCambiar: (siguiente: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {opciones.map((texto, i) => (
        <div key={i} className="flex gap-2">
          <input
            id={`encuesta-opcion-${i}`}
            name="opcion"
            value={texto}
            maxLength={MAX_LARGO_OPCION}
            onChange={(e) => onCambiar(opciones.map((o, j) => (j === i ? e.target.value : o)))}
            required={i < MIN_OPCIONES_ENCUESTA}
            className={claseCampo}
            placeholder={`Opción ${i + 1}`}
          />
          {opciones.length > MIN_OPCIONES_ENCUESTA && (
            <button
              type="button"
              onClick={() => onCambiar(opciones.filter((_, j) => j !== i))}
              aria-label={`Quitar opción ${i + 1}`}
              className="shrink-0 px-3 border border-marca-borde rounded-[3px] text-marca-tenue hover:text-marca-rojoclaro hover:border-marca-rojoclaro"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {opciones.length < MAX_OPCIONES_ENCUESTA && (
        <button
          type="button"
          onClick={() => onCambiar([...opciones, ""])}
          className="text-[11px] font-bold uppercase tracking-wide text-marca-tenue hover:text-marca-texto flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Agregar opción
        </button>
      )}
    </div>
  );
}

export function ResultadosDeEncuesta({
  id,
  encuesta,
  onCerrada,
}: {
  id: string;
  encuesta: ResultadosEncuesta;
  onCerrada: () => void;
}) {
  const [verPendientes, setVerPendientes] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const totalVotos = encuesta.conteos.reduce((a, b) => a + b, 0);
  const porcentajeRespuesta =
    encuesta.publico > 0 ? Math.round((encuesta.votantes * 100) / encuesta.publico) : 0;

  async function handleCerrar() {
    if (!window.confirm("¿Cerrar la encuesta ahora? Ya nadie podrá votar.")) return;
    setCerrando(true);
    const r = await cerrarEncuesta(id);
    setCerrando(false);
    if (r.exito) onCerrada();
    else window.alert(r.mensaje || "No se pudo cerrar la encuesta.");
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-2">
        {encuesta.opciones.map((texto, i) => {
          const pct = totalVotos > 0 ? Math.round((encuesta.conteos[i] * 100) / totalVotos) : 0;
          const nombres = encuesta.nombresPorOpcion?.[i] ?? [];
          return (
            <div key={i}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-marca-texto break-words">{texto}</span>
                <span className="font-data text-marca-tenue tabular-nums shrink-0">
                  {encuesta.conteos[i]} · {pct}%
                </span>
              </div>
              <div className="h-2 mt-1 bg-marca-superficie2 rounded-[2px] overflow-hidden">
                <div className="h-full bg-marca-rojo" style={{ width: `${pct}%` }} />
              </div>
              {nombres.length > 0 && (
                <p className="text-marca-tenue text-[10px] mt-1">{nombres.join(", ")}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-marca-texto text-xs">
        <span className="font-bold">
          {encuesta.votantes} de {encuesta.publico}
        </span>{" "}
        respondieron ({porcentajeRespuesta}%)
        {encuesta.multiple ? " · Opción múltiple" : ""}
        {encuesta.cierra
          ? encuesta.cerrada
            ? " · Cerrada"
            : ` · Cierra el ${formatearFechaLegible(encuesta.cierra)}`
          : " · Sin fecha de cierre"}
      </p>
      {encuesta.anonima && (
        <p className="text-marca-tenue text-[10px] flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> Anónima: no se muestra qué votó cada uno
        </p>
      )}

      {encuesta.pendientes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerPendientes((v) => !v)}
            className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase tracking-widest"
          >
            {verPendientes ? "▾" : "▸"} Faltan responder ({encuesta.pendientes.length})
          </button>
          {verPendientes && (
            <p className="text-marca-tenue text-[11px] mt-1">{encuesta.pendientes.join(", ")}</p>
          )}
        </div>
      )}

      {!encuesta.cerrada && (
        <button
          type="button"
          onClick={handleCerrar}
          disabled={cerrando}
          className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto hover:border-marca-rojoclaro disabled:opacity-50"
        >
          {cerrando ? "Cerrando..." : "Cerrar encuesta ahora"}
        </button>
      )}
    </div>
  );
}

function BotonPublicar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Publicando..." : "Publicar encuesta rápida"}
    </button>
  );
}

export function FormEncuestaRapida({
  usuarios,
  onPublicada,
}: {
  usuarios: UsuarioBasico[];
  onPublicada: (mensaje: string) => void;
}) {
  const [opciones, setOpciones] = useState<string[]>(["", ""]);
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set());
  const [estado, formAction] = useFormState(crearComunicado, estadoInicial);

  useEffect(() => {
    if (estado.exito) onPublicada(estado.mensaje || "Encuesta publicada.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="esEncuesta" value="1" />
      <p className="text-marca-tenue text-xs">
        Una sola pregunta. Al equipo le aparece en Anuncios y vota con un toque.
      </p>

      <div>
        <label htmlFor="rapida-pregunta" className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Pregunta
        </label>
        <textarea
          id="rapida-pregunta"
          name="mensaje"
          required
          rows={2}
          className={claseCampo}
          placeholder="Ej: ¿Qué día prefieren la capacitación de fin de mes?"
        />
      </div>

      <div>
        <p className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Opciones</p>
        <EditorOpciones opciones={opciones} onCambiar={setOpciones} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-marca-texto text-sm">
            <input id="rapida-anonima" type="checkbox" name="anonima" className="accent-marca-rojo" />
            Anónima (no se muestra qué votó cada uno)
          </label>
          <label className="flex items-center gap-2 text-marca-texto text-sm">
            <input id="rapida-multiple" type="checkbox" name="multiple" className="accent-marca-rojo" />
            Permitir marcar varias opciones
          </label>
        </div>
        <div>
          <label htmlFor="rapida-cierra" className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Se puede votar hasta (opcional)
          </label>
          <input id="rapida-cierra" type="date" name="encuestaCierra" min={hoyPeru()} className={claseCampo} />
        </div>
      </div>

      <div>
        <p className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">Destinatarios (opcional)</p>
        <SelectorDestinatarios usuarios={usuarios} seleccionados={destinatarios} onCambiar={setDestinatarios} />
      </div>

      <BotonPublicar />
      {estado.mensaje && !estado.exito && (
        <p className="text-xs font-bold text-center text-marca-rojoclaro">{estado.mensaje}</p>
      )}
    </form>
  );
}

export function TarjetaEncuestaRapida({
  c,
  encuesta,
  usuariosPorId,
  onCambio,
}: {
  c: Comunicado;
  encuesta: ResultadosEncuesta;
  usuariosPorId: Map<string, UsuarioBasico>;
  onCambio: () => void;
}) {
  const [eliminando, setEliminando] = useState(false);
  const nombresDestino = (c.usuariosDestino ?? []).map((id) => usuariosPorId.get(id)?.nombre ?? "—");

  async function handleEliminar() {
    if (!window.confirm("¿Eliminar la encuesta y todos sus votos? No se puede deshacer.")) return;
    setEliminando(true);
    const r = await eliminarComunicado(c.id);
    setEliminando(false);
    if (r.exito) onCambio();
    else window.alert(r.mensaje || "No se pudo eliminar la encuesta.");
  }

  return (
    <div
      className={`bg-marca-superficie border rounded-[3px] p-4 ${
        encuesta.cerrada ? "border-marca-borde/50" : "border-marca-borde"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> Encuesta rápida{encuesta.cerrada ? " · cerrada" : ""}
          </p>
          <p className="text-marca-textofuerte text-sm font-bold mt-1 break-words">{c.mensaje}</p>
        </div>
        <button
          type="button"
          onClick={handleEliminar}
          disabled={eliminando}
          aria-label="Eliminar encuesta"
          className="shrink-0 p-1.5 border border-marca-borde rounded-[3px] text-marca-tenue hover:text-marca-rojoclaro disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <ResultadosDeEncuesta id={c.id} encuesta={encuesta} onCerrada={onCambio} />
      {nombresDestino.length > 0 && (
        <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mt-3 flex items-center gap-1.5">
          <Target className="w-3 h-3" /> Solo para: {nombresDestino.join(", ")}
        </p>
      )}
      <p className="text-marca-tenue text-[11px] capitalize mt-2">
        {formatearFechaLegible(c.fecha)}
        {c.autor ? " · " + c.autor : ""}
      </p>
    </div>
  );
}
