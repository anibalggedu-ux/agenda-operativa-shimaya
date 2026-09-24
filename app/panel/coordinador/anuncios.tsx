"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Users, GraduationCap, Calendar, MapPin, Target } from "lucide-react";
import {
  obtenerComunicados,
  crearComunicado,
  eliminarComunicado,
  obtenerUsuariosYTiendas,
  type Comunicado,
  type UsuarioBasico,
  type ResultadoAccion,
} from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";

const estadoInicial: ResultadoAccion = { exito: false };

function BotonPublicar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Publicando..." : "Publicar anuncio"}
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

function TarjetaAnuncio({
  c,
  usuariosPorId,
  onEliminar,
}: {
  c: Comunicado;
  usuariosPorId: Map<string, UsuarioBasico>;
  onEliminar: (id: string) => void;
}) {
  const destino = c.usuariosDestino ?? [];
  const nombresDestino = destino.map((id) => usuariosPorId.get(id)?.nombre ?? "—");

  return (
    <div
      className={`flex items-start justify-between bg-marca-superficie border rounded-[3px] p-4 ${
        c.vigente ? "border-marca-borde" : "border-marca-borde/50 opacity-60"
      }`}
    >
      <div className="min-w-0">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
          {c.tipo}
        </p>
        <p className="text-marca-textofuerte text-sm mt-1">{c.mensaje}</p>
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function handleEliminar(id: string) {
    const anuncio = comunicados.find((c) => c.id === id);
    if (!window.confirm(`¿Eliminar el anuncio "${anuncio?.tipo ?? ""}"? No se puede deshacer.`)) return;

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
  // Las encuestas rápidas también son comunicados, pero se crean y revisan
  // en la pestaña Encuestas (ver ./encuesta-rapida.tsx).
  const anuncios = comunicados.filter((c) => !c.encuesta);
  const vigentes = anuncios.filter((c) => c.vigente);
  const historicos = anuncios.filter((c) => !c.vigente);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">
          NUEVO ANUNCIO
        </h3>

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Tipo
          </label>
          <input
            name="tipo"
            required
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            placeholder="Ej: Reunión, Aviso general, Cumpleaños..."
          />
        </div>

        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Mensaje
          </label>
          <textarea
            name="mensaje"
            required
            rows={3}
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
            placeholder="Escribe el anuncio..."
          />
        </div>

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

        <BotonPublicar />

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
              <TarjetaAnuncio key={c.id} c={c} usuariosPorId={usuariosPorId} onEliminar={handleEliminar} />
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
            {verHistorico ? "▾" : "▸"} Histórico de eventos vencidos ({historicos.length})
          </button>
          {verHistorico && (
            <div className="space-y-2">
              {historicos.map((c) => (
                <TarjetaAnuncio key={c.id} c={c} usuariosPorId={usuariosPorId} onEliminar={handleEliminar} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
