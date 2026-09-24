"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Users, GraduationCap, Calendar, MapPin, Target, BarChart3, Lock, Plus, X } from "lucide-react";
import {
  obtenerComunicados,
  crearComunicado,
  eliminarComunicado,
  cerrarEncuesta,
  obtenerUsuariosYTiendas,
  type Comunicado,
  type ResultadosEncuesta,
  type UsuarioBasico,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";
import { MAX_LARGO_OPCION, MAX_OPCIONES_ENCUESTA, MIN_OPCIONES_ENCUESTA } from "@/lib/encuestas";

const estadoInicial: ResultadoAccion = { exito: false };

function BotonPublicar({ esEncuesta }: { esEncuesta: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Publicando..." : esEncuesta ? "Publicar encuesta" : "Publicar anuncio"}
    </button>
  );
}

// Botones para restringir a quién le llega el anuncio: "Todos los
// supervisores"/"Todos los capacitadores" seleccionan o quitan de golpe a
// todo ese rol, y cada persona se puede además prender/apagar suelta —
// mismo mecanismo para "por rol" y "por persona", sin dos sistemas
// distintos. Vacío = sin restricción (le llega a todos, como siempre).
export function SelectorDestinatarios({
  usuarios,
  seleccionados,
  onCambiar,
}: {
  usuarios: UsuarioBasico[];
  seleccionados: Set<string>;
  onCambiar: (siguiente: Set<string>) => void;
}) {
  const supervisores = usuarios.filter((u) => u.rol === "supervisor");
  const capacitadores = usuarios.filter((u) => u.rol === "capacitador");

  function alternarPersona(id: string) {
    const siguiente = new Set(seleccionados);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onCambiar(siguiente);
  }

  function alternarRol(idsDelRol: string[]) {
    const todosYaIncluidos = idsDelRol.length > 0 && idsDelRol.every((id) => seleccionados.has(id));
    const siguiente = new Set(seleccionados);
    idsDelRol.forEach((id) => (todosYaIncluidos ? siguiente.delete(id) : siguiente.add(id)));
    onCambiar(siguiente);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => alternarRol(supervisores.map((u) => u.id))}
          className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border border-marca-borde bg-marca-fondo text-marca-tenue hover:border-marca-rojoclaro hover:text-marca-texto transition flex items-center gap-1.5"
        >
          <Users className="w-3 h-3" /> Todos los supervisores
        </button>
        <button
          type="button"
          onClick={() => alternarRol(capacitadores.map((u) => u.id))}
          className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border border-marca-borde bg-marca-fondo text-marca-tenue hover:border-marca-rojoclaro hover:text-marca-texto transition flex items-center gap-1.5"
        >
          <GraduationCap className="w-3 h-3" /> Todos los capacitadores
        </button>
        {seleccionados.size > 0 && (
          <button
            type="button"
            onClick={() => onCambiar(new Set())}
            className="text-[11px] font-bold uppercase tracking-wide text-marca-tenue hover:text-marca-rojoclaro underline"
          >
            Quitar selección — enviar a todos
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
        {[...supervisores, ...capacitadores].map((u) => {
          const activo = seleccionados.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => alternarPersona(u.id)}
              className={`text-left rounded-[3px] border p-2.5 transition ${
                activo
                  ? "border-marca-rojo bg-marca-rojo/15"
                  : "border-marca-borde bg-marca-fondo hover:brightness-125"
              }`}
            >
              <p
                className={`font-bold text-xs truncate ${
                  activo ? "text-marca-textofuerte" : "text-marca-texto"
                }`}
              >
                {u.nombre}
              </p>
              <p className="text-[9px] uppercase text-marca-tenue mt-0.5">{u.rol}</p>
            </button>
          );
        })}
      </div>

      {Array.from(seleccionados).map((id) => (
        <input key={id} type="hidden" name="usuariosDestino" value={id} />
      ))}

      <p className="text-marca-tenue text-[10px]">
        {seleccionados.size === 0
          ? "Sin nadie elegido: el anuncio llega a todos."
          : `Llegará solo a ${seleccionados.size} persona(s) elegida(s).`}
      </p>
    </div>
  );
}

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

function ResultadosDeEncuesta({
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

function TarjetaAnuncio({
  c,
  usuariosPorId,
  onEliminar,
  onRecargar,
}: {
  c: Comunicado;
  usuariosPorId: Map<string, UsuarioBasico>;
  onEliminar: (id: string) => void;
  onRecargar: () => void;
}) {
  const destino = c.usuariosDestino ?? [];
  const nombresDestino = destino.map((id) => usuariosPorId.get(id)?.nombre ?? "—");

  return (
    <div
      className={`flex items-start justify-between bg-marca-superficie border rounded-[3px] p-4 ${
        c.vigente ? "border-marca-borde" : "border-marca-borde/50 opacity-60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
          {c.encuesta && <BarChart3 className="w-3 h-3" />}
          {c.tipo}
        </p>
        <p className={`text-marca-textofuerte text-sm mt-1 ${c.encuesta ? "font-bold" : ""}`}>{c.mensaje}</p>
        {c.encuesta && <ResultadosDeEncuesta id={c.id} encuesta={c.encuesta} onCerrada={onRecargar} />}
        {c.fechaEvento && (
          <p className="text-marca-textofuerte text-[11px] font-bold mt-2 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> Evento: {formatearFechaLegible(c.fechaEvento)}
          </p>
        )}
        {c.ubicacion && (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-marca-tenue hover:text-marca-textofuerte underline text-[11px] font-bold mt-1"
          >
            <MapPin className="w-3 h-3" /> {c.ubicacion} — Ver en Maps
          </a>
        )}
        {nombresDestino.length > 0 && (
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mt-2 flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Solo para: {nombresDestino.join(", ")}
          </p>
        )}
        <p className="text-marca-tenue text-[11px] capitalize mt-2">
          {formatearFechaLegible(c.fecha)}
          {c.autor ? " · " + c.autor : ""}
        </p>
      </div>
      <button
        onClick={() => onEliminar(c.id)}
        className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase shrink-0 ml-3"
      >
        Eliminar
      </button>
    </div>
  );
}

export default function Anuncios() {
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set());
  const [esEncuesta, setEsEncuesta] = useState(false);
  const [opciones, setOpciones] = useState<string[]>(["", ""]);

  const [estado, formAction] = useFormState(crearComunicado, estadoInicial);

  function cargar() {
    setCargando(true);
    obtenerComunicados()
      .then(setComunicados)
      .catch((e) => setError(e.message || "Error al cargar anuncios."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    obtenerUsuariosYTiendas()
      .then(({ usuarios: todos }) =>
        setUsuarios(todos.filter((u) => u.rol === "supervisor" || u.rol === "capacitador"))
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (estado.exito) {
      cargar();
      setDestinatarios(new Set());
      setOpciones(["", ""]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    const anuncio = comunicados.find((c) => c.id === id);
    const aviso = anuncio?.encuesta
      ? "¿Eliminar la encuesta y todos sus votos? No se puede deshacer."
      : `¿Eliminar el anuncio "${anuncio?.tipo ?? ""}"? No se puede deshacer.`;
    if (!window.confirm(aviso)) return;

    const resultado = await eliminarComunicado(id);
    // Solo se saca de la lista si el servidor confirmó — antes se quitaba de
    // la pantalla aunque el borrado hubiera fallado.
    if (resultado.exito) setComunicados((prev) => prev.filter((c) => c.id !== id));
    else window.alert(resultado.mensaje || "No se pudo eliminar el anuncio.");
  }

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando anuncios...</p>;
  }

  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }

  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u]));
  const vigentes = comunicados.filter((c) => c.vigente);
  const historicos = comunicados.filter((c) => !c.vigente);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          {esEncuesta ? "NUEVA ENCUESTA" : "NUEVO ANUNCIO"}
        </h3>

        <div className="flex gap-2" role="group" aria-label="Qué publicar">
          {[
            { valor: false, texto: "Anuncio" },
            { valor: true, texto: "📊 Encuesta" },
          ].map((o) => (
            <button
              key={o.texto}
              type="button"
              aria-pressed={esEncuesta === o.valor}
              onClick={() => setEsEncuesta(o.valor)}
              className={`text-[11px] font-bold uppercase tracking-wide px-4 py-2 rounded-full border transition ${
                esEncuesta === o.valor
                  ? "border-marca-rojo bg-marca-rojo/15 text-marca-textofuerte"
                  : "border-marca-borde bg-marca-fondo text-marca-tenue hover:text-marca-texto"
              }`}
            >
              {o.texto}
            </button>
          ))}
        </div>
        {esEncuesta && <input type="hidden" name="esEncuesta" value="1" />}

        {!esEncuesta && (
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Tipo
            </label>
            <input
              id="anuncio-tipo"
              name="tipo"
              required
              className={claseCampo}
              placeholder="Ej: Reunión, Aviso general, Cumpleaños..."
            />
          </div>
        )}

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            {esEncuesta ? "Pregunta" : "Mensaje"}
          </label>
          <textarea
            id="anuncio-mensaje"
            name="mensaje"
            required
            rows={esEncuesta ? 2 : 3}
            className={claseCampo}
            placeholder={
              esEncuesta ? "Ej: ¿Qué día prefieren la capacitación de fin de mes?" : "Escribe el anuncio..."
            }
          />
        </div>

        {esEncuesta && (
          <>
            <div>
              <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                Opciones
              </label>
              <EditorOpciones opciones={opciones} onCambiar={setOpciones} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-marca-texto text-sm">
                  <input id="encuesta-anonima" type="checkbox" name="anonima" className="accent-marca-rojo" />
                  Anónima (no se muestra qué votó cada uno)
                </label>
                <label className="flex items-center gap-2 text-marca-texto text-sm">
                  <input id="encuesta-multiple" type="checkbox" name="multiple" className="accent-marca-rojo" />
                  Permitir marcar varias opciones
                </label>
              </div>
              <div>
                <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Se puede votar hasta (opcional)
                </label>
                <input
                  id="encuesta-cierra"
                  type="date"
                  name="encuestaCierra"
                  min={hoyPeru()}
                  className={claseCampo}
                />
                <p className="text-marca-tenue text-[10px] mt-1">
                  Pasada esa fecha la encuesta sale de Anuncios. Tú sigues viendo los resultados aquí.
                </p>
              </div>
            </div>
          </>
        )}

        {!esEncuesta && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Fecha del evento (opcional)
            </label>
            <input
              type="date"
              name="fechaEvento"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            />
            <p className="text-marca-tenue text-[10px] mt-1">
              Si la pones, el anuncio desaparece automáticamente al día siguiente del evento
              (queda guardado como histórico).
            </p>
          </div>

          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Ubicación exacta (opcional)
            </label>
            <input
              name="ubicacion"
              className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
              placeholder="Ej: Av 28 de julio 1445, Miraflores"
            />
            <p className="text-marca-tenue text-[10px] mt-1">
              Se mostrará como link directo a Google Maps.
            </p>
          </div>
        </div>
        )}

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Destinatarios (opcional)
          </label>
          <SelectorDestinatarios
            usuarios={usuarios}
            seleccionados={destinatarios}
            onCambiar={setDestinatarios}
          />
        </div>

        <BotonPublicar esEncuesta={esEncuesta} />

        {estado.mensaje && (
          <p
            className={`text-xs font-bold text-center ${
              estado.exito ? "text-emerald-400" : "text-marca-rojoclaro"
            }`}
          >
            {estado.mensaje}
          </p>
        )}
      </form>

      <div>
        <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
          ANUNCIOS VIGENTES ({vigentes.length})
        </h3>
        {vigentes.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">No hay anuncios vigentes.</p>
        ) : (
          <div className="space-y-2">
            {vigentes.map((c) => (
              <TarjetaAnuncio
                  key={c.id}
                  c={c}
                  usuariosPorId={usuariosPorId}
                  onEliminar={handleEliminar}
                  onRecargar={cargar}
                />
            ))}
          </div>
        )}
      </div>

      {historicos.length > 0 && (
        <div>
          <button
            onClick={() => setVerHistorico((v) => !v)}
            className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase tracking-widest mb-3"
          >
            {verHistorico ? "▾" : "▸"} Histórico de eventos y encuestas cerradas ({historicos.length})
          </button>
          {verHistorico && (
            <div className="space-y-2">
              {historicos.map((c) => (
                <TarjetaAnuncio
                  key={c.id}
                  c={c}
                  usuariosPorId={usuariosPorId}
                  onEliminar={handleEliminar}
                  onRecargar={cargar}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
