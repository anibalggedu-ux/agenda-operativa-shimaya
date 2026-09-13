// Cálculo compartido de alertas de puntualidad — usado tanto para la vista
// personal (cada colaborador ve la suya) como para la vista de equipo
// (coordinador y gerente ven la de todos). Una sola fuente de verdad para
// no repetir la lógica en 3 lugares distintos.

import { diaSemanaPeru, sumarDias, formatearHora, formatearFechaLegible } from "./fechas";

// Misma hora límite que ya usa Central Analítica y el sistema de puntos —
// un ingreso después de esta hora cuenta como tarde.
export const HORA_LIMITE_PUNTUALIDAD: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
  coordinador: "12:00:00",
};

// No hace falta mirar más atrás que esto: si el problema viene de antes,
// ya se habría notado — y evita recorrer años de historial innecesariamente.
const TOPE_DIAS_HACIA_ATRAS = 45;

export type EstadoHoy = "a_tiempo" | "tarde" | "pendiente_tarde" | "pendiente" | "descanso" | "sin_limite";

export type RegistroAsistencia = { horaIngreso: string | null; horaSalida: string | null };

export type AlertaPuntualidad = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  estadoHoy: EstadoHoy;
  horaIngresoHoy: string | null;
  rachaTardanzas: number;
  fechaSinSalida: string | null;
  rachaSinSalida: number;
};

// Convierte un rango de asignación especial (vacaciones, permiso, descanso
// médico, misión especial) en el conjunto de fechas individuales que cubre,
// para poder consultarlas con .has(fecha) en O(1) dentro del cálculo.
export function expandirRangoFechas(fechaInicio: string, fechaFin: string): string[] {
  const fechas: string[] = [];
  let cursor = fechaInicio;
  while (cursor <= fechaFin) {
    fechas.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return fechas;
}

export function calcularEstadoPuntualidad(
  usuarioId: string,
  usuarioNombre: string,
  rol: string,
  diasDescanso: string[],
  asistenciaPorFecha: Map<string, RegistroAsistencia>,
  hoy: string,
  horaActual: string,
  diasExentos: Set<string> = new Set(),
  fechaIngreso: string | null = null
): AlertaPuntualidad {
  const limite = HORA_LIMITE_PUNTUALIDAD[rol];
  // No se evalúa puntualidad antes de que la persona existiera como
  // colaborador — evita marcar "tardanza" en días previos a su ingreso.
  const topeLookback = sumarDias(hoy, -TOPE_DIAS_HACIA_ATRAS);
  const limiteFecha = fechaIngreso && fechaIngreso > topeLookback ? fechaIngreso : topeLookback;

  function esDiaExento(fecha: string): boolean {
    return diasDescanso.includes(diaSemanaPeru(fecha)) || diasExentos.has(fecha);
  }

  let estadoHoy: EstadoHoy;
  const registroHoy = asistenciaPorFecha.get(hoy);

  if (!limite) {
    estadoHoy = "sin_limite";
  } else if (esDiaExento(hoy)) {
    estadoHoy = "descanso";
  } else if (registroHoy?.horaIngreso) {
    estadoHoy = registroHoy.horaIngreso > limite ? "tarde" : "a_tiempo";
  } else if (horaActual > limite) {
    estadoHoy = "pendiente_tarde";
  } else {
    estadoHoy = "pendiente";
  }

  // Racha de tardanzas: días laborales consecutivos ANTES de hoy (hoy aún
  // no termina, así que no cuenta todavía) donde llegó tarde o no marcó.
  // Un día de descanso o cubierto por vacaciones/permiso/misión especial no
  // cuenta ni corta la racha — simplemente se salta.
  let rachaTardanzas = 0;
  if (limite) {
    let cursor = sumarDias(hoy, -1);
    while (cursor >= limiteFecha) {
      if (esDiaExento(cursor)) {
        cursor = sumarDias(cursor, -1);
        continue;
      }
      const registro = asistenciaPorFecha.get(cursor);
      const tarde = !registro?.horaIngreso || registro.horaIngreso > limite;
      if (!tarde) break;
      rachaTardanzas += 1;
      cursor = sumarDias(cursor, -1);
    }
  }

  // Salida faltante: el día laboral más reciente antes de hoy donde marcó
  // ingreso pero nunca marcó salida — y cuántos de esos días seguidos van.
  let fechaSinSalida: string | null = null;
  let rachaSinSalida = 0;
  let cursorSalida = sumarDias(hoy, -1);
  while (cursorSalida >= limiteFecha) {
    if (esDiaExento(cursorSalida)) {
      cursorSalida = sumarDias(cursorSalida, -1);
      continue;
    }
    const registro = asistenciaPorFecha.get(cursorSalida);
    if (!registro?.horaIngreso) {
      // No trabajó ese día (o no quedó ningún registro) — no cuenta ni corta la racha.
      cursorSalida = sumarDias(cursorSalida, -1);
      continue;
    }
    if (registro.horaSalida) break;
    if (fechaSinSalida === null) fechaSinSalida = cursorSalida;
    rachaSinSalida += 1;
    cursorSalida = sumarDias(cursorSalida, -1);
  }

  return {
    usuarioId,
    usuarioNombre,
    rol,
    estadoHoy,
    horaIngresoHoy: registroHoy?.horaIngreso ?? null,
    rachaTardanzas,
    fechaSinSalida,
    rachaSinSalida,
  };
}

// Umbral de "vale la pena avisar": hoy con problema, racha de 2+ tardanzas,
// o al menos una salida sin marcar.
export function tieneAlertaActiva(estado: AlertaPuntualidad): boolean {
  return (
    estado.estadoHoy === "tarde" ||
    estado.estadoHoy === "pendiente_tarde" ||
    estado.rachaTardanzas >= 2 ||
    estado.rachaSinSalida >= 1
  );
}

// ---------- Alertas "atendidas" (marcadas como ya vistas por el coordinador/gerente) ----------
//
// Cada alerta se puede marcar como atendida — pero no desaparece para
// siempre: si el problema sigue después de la fecha en que se marcó (una
// tardanza nueva, o una salida nueva sin marcar), vuelve a aparecer sola,
// porque ya es una situación distinta a la que se atendió.

export type TipoAlertaPuntualidad = "tardanza" | "salida";

export type AtendidoPorTipo = { tardanzaDesde: string | null; salidaDesde: string | null };

export type AlertaPuntualidadItem = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  tipo: TipoAlertaPuntualidad;
  mensaje: string;
  // Racha del tipo correspondiente — para poder ordenar los casos más graves
  // primero dentro de un mismo tipo (una racha de 10 antes que una de 2).
  severidad: number;
};

// Última fecha con evidencia de tardanza: hoy mismo si hoy está tarde o
// pendiente de pasar su límite, o el día que cierra la racha (ayer) si
// viene arrastrando una racha sin que hoy sea (todavía) un problema.
function fechaProblemaTardanza(a: AlertaPuntualidad, hoy: string): string | null {
  if (a.estadoHoy === "tarde" || a.estadoHoy === "pendiente_tarde") return hoy;
  // rachaTardanzas === 1 no genera aviso propio (mensajeTardanza no tiene
  // texto para ese caso) — evita una alerta con mensaje vacío en la lista.
  if (a.rachaTardanzas >= 2) return sumarDias(hoy, -1);
  return null;
}

function mensajeTardanza(a: AlertaPuntualidad): string {
  const partes: string[] = [];
  if (a.estadoHoy === "pendiente_tarde") {
    partes.push("Todavía no marca su llegada hoy y ya pasó su hora límite.");
  } else if (a.estadoHoy === "tarde" && a.horaIngresoHoy) {
    partes.push(`Hoy llegó tarde — marcó a las ${formatearHora(a.horaIngresoHoy)}.`);
  }
  if (a.rachaTardanzas >= 2) {
    partes.push(`Lleva ${a.rachaTardanzas} días seguidos llegando tarde o sin marcar entrada.`);
  }
  return partes.join(" ");
}

function mensajeSalida(a: AlertaPuntualidad): string {
  if (!a.fechaSinSalida) return "";
  return a.rachaSinSalida === 1
    ? `No registró su salida el ${formatearFechaLegible(a.fechaSinSalida)}.`
    : `No registra su salida desde hace ${a.rachaSinSalida} días (${formatearFechaLegible(a.fechaSinSalida)}).`;
}

// Arma la lista de alertas de una persona ya filtrada por lo que marcó
// atendido el coordinador/gerente — cada tipo (tardanza / salida) se evalúa
// por separado, así que una persona puede tener una visible y la otra no.
export function construirItemsAlerta(
  a: AlertaPuntualidad,
  hoy: string,
  atendido?: AtendidoPorTipo
): AlertaPuntualidadItem[] {
  const items: AlertaPuntualidadItem[] = [];

  const fechaTardanza = fechaProblemaTardanza(a, hoy);
  if (fechaTardanza && (!atendido?.tardanzaDesde || fechaTardanza > atendido.tardanzaDesde)) {
    items.push({
      usuarioId: a.usuarioId,
      usuarioNombre: a.usuarioNombre,
      rol: a.rol,
      tipo: "tardanza",
      mensaje: mensajeTardanza(a),
      severidad: a.rachaTardanzas,
    });
  }

  if (a.fechaSinSalida && (!atendido?.salidaDesde || a.fechaSinSalida > atendido.salidaDesde)) {
    items.push({
      usuarioId: a.usuarioId,
      usuarioNombre: a.usuarioNombre,
      rol: a.rol,
      tipo: "salida",
      mensaje: mensajeSalida(a),
      severidad: a.rachaSinSalida,
    });
  }

  return items;
}
