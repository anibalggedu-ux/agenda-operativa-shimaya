// Cálculo compartido de alertas de puntualidad — usado tanto para la vista
// personal (cada colaborador ve la suya) como para la vista de equipo
// (coordinador y gerente ven la de todos). Una sola fuente de verdad para
// no repetir la lógica en 3 lugares distintos.

import { diaSemanaPeru, sumarDias } from "./fechas";

// Misma hora límite que ya usa Central Analítica y el sistema de puntos —
// un ingreso después de esta hora cuenta como tarde.
export const HORA_LIMITE_PUNTUALIDAD: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
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
  diasExentos: Set<string> = new Set()
): AlertaPuntualidad {
  const limite = HORA_LIMITE_PUNTUALIDAD[rol];
  const limiteFecha = sumarDias(hoy, -TOPE_DIAS_HACIA_ATRAS);

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
