"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Download, Lock, Plus, Trash2, X } from "lucide-react";
import {
  obtenerResultadosEncuestas,
  crearEncuestaCompleta,
  cerrarEncuestaCompleta,
  eliminarEncuestaCompleta,
  exportarEncuestaCsv,
  type ResultadoAccion,
  type ResultadoPregunta,
  type ResultadosEncuestaCompleta,
} from "../encuestas/actions";
import { obtenerComunicados, obtenerUsuariosYTiendas, type Comunicado, type UsuarioBasico } from "./actions";
import { SelectorDestinatarios } from "./anuncios";
import { FormEncuestaRapida, TarjetaEncuestaRapida } from "./encuesta-rapida";
import {
  CARITAS,
  MAX_LARGO_DESCRIPCION,
  MAX_LARGO_OPCION_PREGUNTA,
  MAX_LARGO_TEXTO_PREGUNTA,
  MAX_LARGO_TITULO,
  MAX_OPCIONES_PREGUNTA,
  MAX_PREGUNTAS,
  MAX_PUNTOS_ENCUESTA,
  TIPOS_PREGUNTA,
  tieneOpciones,
  type Pregunta,
  type TipoPregunta,
} from "@/lib/encuestas-completas";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";

const estadoInicial: ResultadoAccion = { exito: false };

const claseCampo =
  "w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";
const claseEtiqueta = "block text-marca-tenue text-[10px] uppercase font-bold mb-1";

function preguntaNueva(tipo: TipoPregunta = "caritas"): Pregunta {
  return {
    tipo,
    texto: "",
    opciones: tieneOpciones(tipo) ? ["", ""] : undefined,
    obligatoria: tipo !== "texto",
  };
}

function BotonPublicar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Publicando..." : "Publicar encuesta"}
    </button>
  );
}

// ---------- Editor de una pregunta ----------

function EditorPregunta({
  indice,
  total,
  pregunta,
  onCambiar,
  onQuitar,
  onMover,
}: {
  indice: number;
  total: number;
  pregunta: Pregunta;
  onCambiar: (p: Pregunta) => void;
  onQuitar: () => void;
  onMover: (direccion: -1 | 1) => void;
}) {
  const opciones = pregunta.opciones ?? [];

  function cambiarTipo(tipo: TipoPregunta) {
    onCambiar({
      ...pregunta,
      tipo,
      opciones: tieneOpciones(tipo) ? (opciones.length >= 2 ? opciones : ["", ""]) : undefined,
      obligatoria: tipo === "texto" ? false : pregunta.obligatoria,
    });
  }

  const botonIcono =
    "p-1.5 border border-marca-borde rounded-[3px] text-marca-tenue hover:text-marca-texto disabled:opacity-30";

  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-data text-[11px] text-marca-tenue">PREGUNTA {indice + 1}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMover(-1)} disabled={indice === 0} aria-label="Subir" className={botonIcono}>
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={indice === total - 1}
            aria-label="Bajar"
            className={botonIcono}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          {total > 1 && (
            <button type="button" onClick={onQuitar} aria-label={`Quitar pregunta ${indice + 1}`} className={botonIcono}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TIPOS_PREGUNTA.map((t) => (
          <button
            key={t.tipo}
            type="button"
            aria-pressed={pregunta.tipo === t.tipo}
            onClick={() => cambiarTipo(t.tipo)}
            className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-full border transition ${
              pregunta.tipo === t.tipo
                ? "border-marca-rojo bg-marca-rojo/15 text-marca-textofuerte"
                : "border-marca-borde text-marca-tenue hover:text-marca-texto"
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <input
        id={`pregunta-${indice}-texto`}
        value={pregunta.texto}
        maxLength={MAX_LARGO_TEXTO_PREGUNTA}
        onChange={(e) => onCambiar({ ...pregunta, texto: e.target.value })}
        className={claseCampo}
        placeholder={
          pregunta.tipo === "caritas"
            ? "Ej: ¿Cómo te sentiste en tu trabajo esta semana?"
            : pregunta.tipo === "texto"
              ? "Ej: ¿Qué podríamos mejorar?"
              : "Escribe la pregunta"
        }
      />

      {pregunta.tipo === "caritas" && (
        <p className="text-lg tracking-widest">
          {CARITAS.map((c) => c.emoji).join(" ")}{" "}
          <span className="text-marca-tenue text-[10px] tracking-normal">del 1 (muy mal) al 5 (muy bien)</span>
        </p>
      )}

      {tieneOpciones(pregunta.tipo) && (
        <div className="space-y-2">
          {opciones.map((texto, i) => (
            <div key={i} className="flex gap-2">
              <input
                id={`pregunta-${indice}-opcion-${i}`}
                value={texto}
                maxLength={MAX_LARGO_OPCION_PREGUNTA}
                onChange={(e) =>
                  onCambiar({ ...pregunta, opciones: opciones.map((o, j) => (j === i ? e.target.value : o)) })
                }
                className={claseCampo}
                placeholder={`Opción ${i + 1}`}
              />
              {opciones.length > 2 && (
                <button
                  type="button"
                  onClick={() => onCambiar({ ...pregunta, opciones: opciones.filter((_, j) => j !== i) })}
                  aria-label={`Quitar opción ${i + 1}`}
                  className="shrink-0 px-3 border border-marca-borde rounded-[3px] text-marca-tenue hover:text-marca-rojoclaro"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {opciones.length < MAX_OPCIONES_PREGUNTA && (
            <button
              type="button"
              onClick={() => onCambiar({ ...pregunta, opciones: [...opciones, ""] })}
              className="text-[11px] font-bold uppercase tracking-wide text-marca-tenue hover:text-marca-texto flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" /> Agregar opción
            </button>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-marca-texto text-xs">
        <input
          id={`pregunta-${indice}-opcional`}
          type="checkbox"
          checked={!pregunta.obligatoria}
          onChange={(e) => onCambiar({ ...pregunta, obligatoria: !e.target.checked })}
          className="accent-marca-rojo"
        />
        Opcional (se puede saltar)
      </label>
    </div>
  );
}

// ---------- Resultados ----------

function Barra({ etiqueta, valor, total, nombres }: { etiqueta: string; valor: number; total: number; nombres?: string[] }) {
  const pct = total > 0 ? Math.round((valor * 100) / total) : 0;
  return (
    <div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-marca-texto break-words">{etiqueta}</span>
        <span className="font-data text-marca-tenue tabular-nums shrink-0">
          {valor} · {pct}%
        </span>
      </div>
      <div className="h-2 mt-1 bg-marca-superficie2 rounded-[2px] overflow-hidden">
        <div className="h-full bg-marca-rojo" style={{ width: `${pct}%` }} />
      </div>
      {nombres && nombres.length > 0 && <p className="text-marca-tenue text-[10px] mt-1">{nombres.join(", ")}</p>}
    </div>
  );
}

function ResultadoDePregunta({ indice, r }: { indice: number; r: ResultadoPregunta }) {
  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3 space-y-2">
      <p className="text-marca-textofuerte text-sm font-semibold">
        <span className="font-data text-marca-tenue text-[11px] mr-1.5">{indice + 1}.</span>
        {r.texto}
      </p>

      {r.tipo === "caritas" && (
        <>
          <p className="text-marca-tenue text-[11px]">
            Promedio:{" "}
            <span className="font-data text-marca-textofuerte font-bold text-sm">
              {r.promedio !== null ? r.promedio.toFixed(1) : "—"}
            </span>{" "}
            de 5 · {r.respuestas} {r.respuestas === 1 ? "respuesta" : "respuestas"}
          </p>
          <div className="space-y-1.5">
            {[...CARITAS].reverse().map((c) => (
              <Barra
                key={c.valor}
                etiqueta={`${c.emoji} ${c.etiqueta}`}
                valor={r.conteos[c.valor - 1]}
                total={r.respuestas}
                nombres={r.nombresPorOpcion?.[c.valor - 1]}
              />
            ))}
          </div>
        </>
      )}

      {(r.tipo === "unica" || r.tipo === "multiple") && (
        <>
          <p className="text-marca-tenue text-[11px]">
            {r.respuestas} {r.respuestas === 1 ? "respuesta" : "respuestas"}
            {r.tipo === "multiple" ? " · se podían marcar varias, los % son sobre quienes respondieron" : ""}
          </p>
          <div className="space-y-1.5">
            {r.opciones.map((o, i) => (
              <Barra key={i} etiqueta={o} valor={r.conteos[i]} total={r.respuestas} nombres={r.nombresPorOpcion?.[i]} />
            ))}
          </div>
        </>
      )}

      {r.tipo === "texto" &&
        (r.comentarios.length === 0 ? (
          <p className="text-marca-tenue text-xs italic">Nadie escribió todavía.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {r.comentarios.map((c, i) => (
              <p key={i} className="text-marca-texto text-xs border-l-2 border-marca-borde pl-2 break-words">
                “{c.texto}”{c.nombre && <span className="text-marca-tenue"> — {c.nombre}</span>}
              </p>
            ))}
          </div>
        ))}
    </div>
  );
}

function TarjetaResultados({
  e,
  onCambio,
}: {
  e: ResultadosEncuestaCompleta;
  onCambio: () => void;
}) {
  const [abierta, setAbierta] = useState(!e.cerrada);
  const [verPendientes, setVerPendientes] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const pct = e.publico > 0 ? Math.round((e.respondieron * 100) / e.publico) : 0;

  async function handleCerrar() {
    if (!window.confirm("¿Cerrar la encuesta ahora? Ya nadie podrá responder.")) return;
    setOcupado(true);
    const r = await cerrarEncuestaCompleta(e.id);
    setOcupado(false);
    if (r.exito) onCambio();
    else window.alert(r.mensaje || "No se pudo cerrar la encuesta.");
  }

  async function handleEliminar() {
    if (
      !window.confirm(
        "¿Eliminar la encuesta y sus resultados? Los puntos que ya ganaron quienes respondieron se mantienen. No se puede deshacer."
      )
    )
      return;
    setOcupado(true);
    const r = await eliminarEncuestaCompleta(e.id);
    setOcupado(false);
    if (r.exito) onCambio();
    else window.alert(r.mensaje || "No se pudo eliminar la encuesta.");
  }

  async function handleDescargar() {
    setOcupado(true);
    try {
      const r = await exportarEncuestaCsv(e.id);
      if (!r.exito || !r.contenido) {
        window.alert(r.mensaje || "No se pudo generar el archivo.");
        return;
      }
      const url = URL.createObjectURL(new Blob([r.contenido], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombreArchivo || "encuesta.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setOcupado(false);
    }
  }

  const botonSecundario =
    "text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto hover:border-marca-rojoclaro disabled:opacity-50 flex items-center gap-1.5";

  return (
    <div className={`bg-marca-superficie border rounded-[3px] p-4 space-y-3 ${e.cerrada ? "border-marca-borde/50" : "border-marca-borde"}`}>
      <button type="button" onClick={() => setAbierta((v) => !v)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
              {e.cerrada ? "Encuesta cerrada" : "Encuesta en curso"}
            </p>
            <p className="text-marca-textofuerte font-bold mt-0.5 break-words">{e.titulo}</p>
          </div>
          <span className="text-marca-tenue text-xs shrink-0">{abierta ? "▾" : "▸"}</span>
        </div>
      </button>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-2">
          <p className="font-data text-marca-textofuerte font-bold tabular-nums">
            {e.respondieron}/{e.publico}
          </p>
          <p className="text-[9px] uppercase tracking-wide text-marca-tenue">Respondieron ({pct}%)</p>
        </div>
        <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-2">
          <p className="font-data text-marca-textofuerte font-bold tabular-nums">{e.preguntas.length}</p>
          <p className="text-[9px] uppercase tracking-wide text-marca-tenue">Preguntas</p>
        </div>
        <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-2">
          <p className="font-data text-marca-textofuerte font-bold tabular-nums">+{e.puntos}</p>
          <p className="text-[9px] uppercase tracking-wide text-marca-tenue">Pts por responder</p>
        </div>
      </div>

      <p className="text-marca-tenue text-[11px]">
        Publicada el {formatearFechaLegible(e.creada.slice(0, 10))}
        {e.autor ? ` por ${e.autor}` : ""}
        {e.cierra ? (e.cerrada ? " · Cerrada" : ` · Se responde hasta el ${formatearFechaLegible(e.cierra)}`) : " · Sin fecha de cierre"}
        {e.usuariosDestino && e.usuariosDestino.length > 0 ? ` · Solo para ${e.usuariosDestino.length} persona(s)` : ""}
      </p>
      {e.anonima && (
        <p className="text-marca-tenue text-[10px] flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> Anónima: no se muestra qué respondió cada uno
        </p>
      )}

      {abierta && (
        <>
          {e.descripcion && <p className="text-marca-texto text-sm">{e.descripcion}</p>}
          <div className="space-y-2">
            {e.preguntas.map((r, i) => (
              <ResultadoDePregunta key={i} indice={i} r={r} />
            ))}
          </div>

          {e.pendientes.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerPendientes((v) => !v)}
                className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase tracking-widest"
              >
                {verPendientes ? "▾" : "▸"} Faltan responder ({e.pendientes.length})
              </button>
              {verPendientes && <p className="text-marca-tenue text-[11px] mt-1">{e.pendientes.join(", ")}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDescargar} disabled={ocupado || e.respondieron === 0} className={botonSecundario}>
              <Download className="w-3 h-3" /> Descargar para Excel
            </button>
            {!e.cerrada && (
              <button type="button" onClick={handleCerrar} disabled={ocupado} className={botonSecundario}>
                Cerrar encuesta ahora
              </button>
            )}
            <button type="button" onClick={handleEliminar} disabled={ocupado} className={botonSecundario}>
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Pestaña ----------

type TipoNueva = "rapida" | "completa";

type ItemLista =
  | { tipo: "completa"; fecha: string; cerrada: boolean; e: ResultadosEncuestaCompleta }
  | { tipo: "rapida"; fecha: string; cerrada: boolean; c: Comunicado };

export default function EncuestasCoordinador() {
  const [encuestas, setEncuestas] = useState<ResultadosEncuestaCompleta[]>([]);
  const [rapidas, setRapidas] = useState<Comunicado[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState<TipoNueva | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([preguntaNueva("caritas")]);
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set());
  const [estado, formAction] = useFormState(crearEncuestaCompleta, estadoInicial);

  function cargar() {
    Promise.all([obtenerResultadosEncuestas(), obtenerComunicados()])
      .then(([completas, comunicados]) => {
        setEncuestas(completas);
        setRapidas(comunicados.filter((c) => c.encuesta));
        setError(null);
      })
      .catch((e) => setError(e.message || "Error al cargar las encuestas."))
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

  function publicada(mensaje: string) {
    cargar();
    setCreando(null);
    setAviso(mensaje);
  }

  useEffect(() => {
    if (estado.exito) {
      publicada(estado.mensaje || "Encuesta publicada.");
      setPreguntas([preguntaNueva("caritas")]);
      setDestinatarios(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  function moverPregunta(i: number, direccion: -1 | 1) {
    const j = i + direccion;
    if (j < 0 || j >= preguntas.length) return;
    const siguiente = [...preguntas];
    [siguiente[i], siguiente[j]] = [siguiente[j], siguiente[i]];
    setPreguntas(siguiente);
  }

  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u]));
  const items: ItemLista[] = [
    ...encuestas.map((e) => ({ tipo: "completa" as const, fecha: e.creada.slice(0, 10), cerrada: e.cerrada, e })),
    ...rapidas.map((c) => ({ tipo: "rapida" as const, fecha: c.fecha, cerrada: !!c.encuesta?.cerrada, c })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const enCurso = items.filter((i) => !i.cerrada);
  const cerradas = items.filter((i) => i.cerrada);

  function renderItem(i: ItemLista) {
    if (i.tipo === "completa") return <TarjetaResultados key={i.e.id} e={i.e} onCambio={cargar} />;
    return (
      <TarjetaEncuestaRapida
        key={i.c.id}
        c={i.c}
        encuesta={i.c.encuesta!}
        usuariosPorId={usuariosPorId}
        onCambio={cargar}
      />
    );
  }

  const claseTipo = (activo: boolean) =>
    `flex-1 text-left rounded-[3px] border p-3 transition ${
      activo ? "border-marca-rojo bg-marca-rojo/15" : "border-marca-borde bg-marca-fondo hover:border-marca-rojoclaro"
    }`;

  return (
    <div className="space-y-6">
      <h2 className="text-xs font-black tracking-widest text-marca-tenue">ENCUESTAS</h2>

      {creando === null ? (
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setCreando("rapida");
          }}
          className="w-full border border-dashed border-marca-rojo/60 hover:bg-marca-rojo/10 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva encuesta
        </button>
      ) : (
        <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-widest text-marca-tenue">NUEVA ENCUESTA</h3>
            <button
              type="button"
              onClick={() => setCreando(null)}
              className="text-[11px] font-bold uppercase text-marca-tenue hover:text-marca-texto"
            >
              Cancelar
            </button>
          </div>

          <div className="flex gap-2" role="group" aria-label="Tipo de encuesta">
            <button type="button" aria-pressed={creando === "rapida"} onClick={() => setCreando("rapida")} className={claseTipo(creando === "rapida")}>
              <span className="block text-marca-textofuerte text-sm font-bold">📊 Rápida</span>
              <span className="block text-marca-tenue text-[11px]">1 pregunta · se vota con un toque en Anuncios</span>
            </button>
            <button type="button" aria-pressed={creando === "completa"} onClick={() => setCreando("completa")} className={claseTipo(creando === "completa")}>
              <span className="block text-marca-textofuerte text-sm font-bold">📋 Completa</span>
              <span className="block text-marca-tenue text-[11px]">Varias preguntas · pantalla completa · con puntos</span>
            </button>
          </div>

          {creando === "rapida" ? (
            <FormEncuestaRapida usuarios={usuarios} onPublicada={publicada} />
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label htmlFor="encuesta-titulo" className={claseEtiqueta}>
                  Título
                </label>
                <input
                  id="encuesta-titulo"
                  name="titulo"
                  required
                  maxLength={MAX_LARGO_TITULO}
                  className={claseCampo}
                  placeholder="Ej: Clima del equipo · septiembre"
                />
              </div>

              <div>
                <label htmlFor="encuesta-descripcion" className={claseEtiqueta}>
                  Descripción (opcional)
                </label>
                <textarea
                  id="encuesta-descripcion"
                  name="descripcion"
                  rows={2}
                  maxLength={MAX_LARGO_DESCRIPCION}
                  className={claseCampo}
                  placeholder="Ej: Nos ayuda a mejorar. Toma 1 minuto."
                />
              </div>

              <div className="space-y-2">
                <p className={claseEtiqueta}>Preguntas</p>
                {preguntas.map((p, i) => (
                  <EditorPregunta
                    key={i}
                    indice={i}
                    total={preguntas.length}
                    pregunta={p}
                    onCambiar={(nueva) => setPreguntas(preguntas.map((x, j) => (j === i ? nueva : x)))}
                    onQuitar={() => setPreguntas(preguntas.filter((_, j) => j !== i))}
                    onMover={(d) => moverPregunta(i, d)}
                  />
                ))}
                {preguntas.length < MAX_PREGUNTAS && (
                  <button
                    type="button"
                    onClick={() => setPreguntas([...preguntas, preguntaNueva("unica")])}
                    className="text-[11px] font-bold uppercase tracking-wide text-marca-tenue hover:text-marca-texto flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" /> Agregar pregunta
                  </button>
                )}
                <input type="hidden" name="preguntas" value={JSON.stringify(preguntas)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="encuesta-puntos" className={claseEtiqueta}>
                    Puntos por responder
                  </label>
                  <input
                    id="encuesta-puntos"
                    name="puntos"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_PUNTOS_ENCUESTA}
                    step={1}
                    defaultValue={10}
                    className={claseCampo}
                  />
                  <p className="text-marca-tenue text-[10px] mt-1">Se suman a sus puntos al enviar. 0 = sin premio.</p>
                </div>
                <div>
                  <label htmlFor="encuesta-cierra" className={claseEtiqueta}>
                    Se puede responder hasta (opcional)
                  </label>
                  <input id="encuesta-cierra" name="cierra" type="date" min={hoyPeru()} className={claseCampo} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-marca-texto text-sm">
                <input id="encuesta-anonima" type="checkbox" name="anonima" defaultChecked className="accent-marca-rojo" />
                Anónima (en los resultados no aparece quién respondió qué)
              </label>

              <div>
                <p className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">Destinatarios (opcional)</p>
                <SelectorDestinatarios usuarios={usuarios} seleccionados={destinatarios} onCambiar={setDestinatarios} />
              </div>

              <BotonPublicar />
              {estado.mensaje && !estado.exito && (
                <p className="text-xs font-bold text-center text-marca-rojoclaro">{estado.mensaje}</p>
              )}
            </form>
          )}
        </div>
      )}

      {aviso && creando === null && <p className="text-xs font-bold text-center text-emerald-400">{aviso}</p>}

      {cargando ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando encuestas...</p>
      ) : error ? (
        <p className="text-marca-rojoclaro text-sm">{error}</p>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-xs font-black tracking-widest text-marca-tenue">EN CURSO ({enCurso.length})</h3>
            {enCurso.length === 0 ? (
              <p className="text-marca-tenue text-sm italic">No hay encuestas en curso.</p>
            ) : (
              enCurso.map(renderItem)
            )}
          </div>
          {cerradas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-black tracking-widest text-marca-tenue">CERRADAS ({cerradas.length})</h3>
              {cerradas.map(renderItem)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
