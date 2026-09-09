"use client";

import { useEffect, useMemo, useState } from "react";
import { DIAS_SEMANA } from "@/lib/fechas";
import {
  obtenerCalendarioMes,
  obtenerMiCalendarioMes,
  type DatosCalendario,
  type EventoCalendario,
  type TipoEventoCalendario,
} from "./actions";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const ICONO: Record<TipoEventoCalendario, string> = {
  ruta: "📍",
  vacaciones: "🏖️",
  permiso: "📄",
  descanso_medico: "🩺",
  mision_especial: "🚀",
  evento: "📣",
};

const ETIQUETA: Record<TipoEventoCalendario, string> = {
  ruta: "Ruta asignada",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  descanso_medico: "Descanso médico",
  mision_especial: "Misión especial",
  evento: "Evento",
};

const CLASE_CHIP: Record<TipoEventoCalendario, string> = {
  ruta: "bg-marca-rojo/85",
  vacaciones: "bg-sky-600",
  permiso: "bg-amber-600",
  descanso_medico: "bg-fuchsia-600",
  mision_especial: "bg-orange-600",
  evento: "bg-indigo-500",
};

function formatoISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function Calendario({ modo, hoy }: { modo: "completo" | "propio"; hoy: string }) {
  const [anioHoy, mesHoy] = hoy.split("-").map(Number);
  const [anio, setAnio] = useState(anioHoy);
  const [mes, setMes] = useState(mesHoy); // 1-12
  const [datos, setDatos] = useState<DatosCalendario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroPersona, setFiltroPersona] = useState("todos");
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy);

  useEffect(() => {
    setCargando(true);
    setError(null);
    const cargar = modo === "completo" ? obtenerCalendarioMes : obtenerMiCalendarioMes;
    cargar(anio, mes)
      .then(setDatos)
      .catch((e) => setError(e.message || "No se pudo cargar el calendario."))
      .finally(() => setCargando(false));
  }, [anio, mes, modo]);

  const celdas = useMemo(() => {
    const primerDiaMes = new Date(anio, mes - 1, 1);
    const inicioGrid = new Date(primerDiaMes);
    inicioGrid.setDate(inicioGrid.getDate() - primerDiaMes.getDay());

    const resultado: {
      iso: string;
      numero: number;
      esDelMes: boolean;
      eventos: EventoCalendario[];
      descansoChip: boolean;
    }[] = [];

    for (let i = 0; i < 35; i++) {
      const fecha = new Date(inicioGrid);
      fecha.setDate(fecha.getDate() + i);
      const iso = formatoISO(fecha);
      const esDelMes = fecha.getMonth() === mes - 1;

      let eventosDia = (datos?.eventos ?? []).filter((e) => e.fecha === iso);
      let descansoChip = false;

      if (modo === "completo" && filtroPersona !== "todos") {
        eventosDia = eventosDia.filter((e) => e.personaId === filtroPersona || e.tipo === "evento");
        const persona = datos?.personas.find((p) => p.id === filtroPersona);
        if (persona && persona.diasDescanso.includes(DIAS_SEMANA[fecha.getDay()])) descansoChip = true;
      } else if (modo === "propio") {
        const propio = datos?.personas[0];
        if (propio && propio.diasDescanso.includes(DIAS_SEMANA[fecha.getDay()])) descansoChip = true;
      }

      resultado.push({ iso, numero: fecha.getDate(), esDelMes, eventos: eventosDia, descansoChip });
    }
    return resultado;
  }, [anio, mes, datos, filtroPersona, modo]);

  const rutasDelMes = (datos?.eventos ?? []).filter((e) => e.tipo === "ruta").length;
  const eventosHoy = (datos?.eventos ?? []).filter((e) => e.fecha === hoy);
  const especialesHoy = eventosHoy.filter((e) => e.tipo !== "ruta" && e.tipo !== "evento");
  const proximoEvento = (datos?.eventos ?? [])
    .filter((e) => e.tipo === "evento" && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];

  function cambiarMes(delta: number) {
    let m = mes + delta;
    let a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m);
    setAnio(a);
  }

  const detalle = useMemo(() => {
    const fecha = new Date(diaSeleccionado + "T00:00:00");
    const eventosDia = (datos?.eventos ?? []).filter((e) => e.fecha === diaSeleccionado);
    const enDescanso = (datos?.personas ?? []).filter((p) =>
      p.diasDescanso.includes(DIAS_SEMANA[fecha.getDay()])
    );
    return { fecha, eventosDia, enDescanso };
  }, [diaSeleccionado, datos]);

  if (cargando && !datos) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando calendario...</p>;
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-marca-tenue text-sm">
          {modo === "completo"
            ? "Rutas, descansos, asignaciones especiales y eventos de todo el personal."
            : "Tus rutas asignadas, tu descanso semanal y las asignaciones especiales que tengas."}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => cambiarMes(-1)}
            className="w-8 h-8 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto transition"
          >
            ‹
          </button>
          <span className="font-display text-lg font-semibold min-w-[160px] text-center capitalize">
            {MESES[mes - 1]} {anio}
          </span>
          <button
            onClick={() => cambiarMes(1)}
            className="w-8 h-8 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto transition"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
          <p className="font-display text-2xl font-semibold">{rutasDelMes}</p>
          <p className="text-marca-tenue text-[11px] uppercase tracking-wide mt-1">Rutas este mes</p>
        </div>
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
          <p className="font-display text-2xl font-semibold">
            {modo === "completo" ? especialesHoy.length : especialesHoy.length > 0 ? "Sí" : "No"}
          </p>
          <p className="text-marca-tenue text-[11px] uppercase tracking-wide mt-1">
            {modo === "completo" ? "Personas en asignación especial hoy" : "¿Asignación especial hoy?"}
          </p>
        </div>
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
          <p className="font-display text-2xl font-semibold">
            {proximoEvento
              ? new Date(proximoEvento.fecha + "T00:00:00").toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "short",
                })
              : "—"}
          </p>
          <p className="text-marca-tenue text-[11px] uppercase tracking-wide mt-1">Próximo evento</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {modo === "completo" ? (
          <select
            value={filtroPersona}
            onChange={(e) => setFiltroPersona(e.target.value)}
            className="p-2.5 bg-marca-superficie border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="todos">Ver: Todos</option>
            {(datos?.personas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-3">
          {(Object.keys(ETIQUETA) as TipoEventoCalendario[]).map((tipo) => (
            <span key={tipo} className="inline-flex items-center gap-1.5 text-[11px] text-marca-tenue">
              <span className={`w-2 h-2 rounded-full ${CLASE_CHIP[tipo]}`} />
              {ETIQUETA[tipo]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-marca-borde">
            {DIAS_CORTOS.map((d) => (
              <div
                key={d}
                className="text-center py-2.5 text-[10px] font-black uppercase tracking-widest text-marca-tenue"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celdas.map((celda) => {
              const visibles = celda.eventos.slice(0, celda.descansoChip ? 2 : 3);
              const restoOculto =
                celda.eventos.length - visibles.length + (celda.descansoChip ? 1 : 0);
              return (
                <button
                  key={celda.iso}
                  onClick={() => setDiaSeleccionado(celda.iso)}
                  className={`min-h-[92px] border-r border-b border-marca-borde/60 p-1.5 text-left flex flex-col gap-1 transition hover:bg-marca-superficie2 ${
                    celda.esDelMes ? "" : "opacity-35"
                  } ${celda.iso === diaSeleccionado ? "bg-marca-rojo/10 ring-1 ring-inset ring-marca-rojo/50" : ""}`}
                >
                  <span
                    className={`text-[11px] font-data ${
                      celda.iso === hoy
                        ? "bg-marca-rojo text-white w-5 h-5 rounded-full flex items-center justify-center font-semibold"
                        : "text-marca-tenue"
                    }`}
                  >
                    {celda.numero}
                  </span>
                  {visibles.map((ev, i) => (
                    <span
                      key={i}
                      className={`text-[9px] font-semibold text-white px-1.5 py-0.5 rounded truncate ${CLASE_CHIP[ev.tipo]}`}
                    >
                      {ICONO[ev.tipo]} {ev.personaNombre ? ev.personaNombre.split(" ")[0] + " — " : ""}
                      {ev.detalle}
                    </span>
                  ))}
                  {celda.descansoChip && (
                    <span className="text-[9px] text-marca-tenue border border-dashed border-marca-tenue/60 px-1.5 py-0.5 rounded">
                      😴 Descanso
                    </span>
                  )}
                  {restoOculto > 0 && (
                    <span className="text-[9px] text-marca-tenue">+{restoOculto} más</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 lg:sticky lg:top-4">
          <h3 className="font-display text-lg font-semibold">
            {detalle.fecha.getDate()} de {MESES[detalle.fecha.getMonth()]}
          </h3>
          <p className="text-marca-tenue text-[11px] capitalize mb-3">
            {DIAS_LARGOS[detalle.fecha.getDay()]}
            {diaSeleccionado === hoy ? " · Hoy" : ""}
          </p>

          {detalle.eventosDia.length === 0 ? (
            <p className="text-marca-tenue text-xs italic">Sin registros este día.</p>
          ) : (
            <div className="space-y-2.5">
              {detalle.eventosDia.map((ev, i) => (
                <div key={i} className="flex gap-2.5 pb-2.5 border-b border-marca-borde last:border-b-0">
                  <span className="text-sm">{ICONO[ev.tipo]}</span>
                  <div>
                    <p className="text-marca-textofuerte text-xs font-semibold">
                      {ev.personaNombre ?? ETIQUETA[ev.tipo]}
                    </p>
                    <p className="text-marca-tenue text-[11px] font-data">
                      {ev.personaNombre ? `${ETIQUETA[ev.tipo]} · ` : ""}
                      {ev.detalle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-dashed border-marca-borde">
            <h4 className="text-[10px] uppercase tracking-wide text-marca-tenue mb-1.5">
              {modo === "completo" ? "Personal en descanso" : "Tu descanso semanal"}
            </h4>
            {detalle.enDescanso.length === 0 ? (
              <p className="text-marca-tenue text-[11px]">
                {modo === "completo" ? "Nadie tiene descanso fijo este día." : "No descansas este día."}
              </p>
            ) : (
              detalle.enDescanso.map((p) => (
                <p key={p.id} className="text-marca-tenue text-[11px]">
                  😴 {p.nombre}
                  {modo === "completo" ? ` (${p.rol})` : ""}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
