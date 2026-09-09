"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import {
  calcularConteoMedallas,
  progresoProximoBronce,
  type ConteoMedallas,
} from "@/lib/trofeos";
import { hoyPeru, sumarDias, diaSemanaPeru, diasEntreFechas } from "@/lib/fechas";

// Misma hora límite de puntualidad ya usada en Central Analítica para el
// ranking de tardanzas — un ingreso antes de esta hora suma puntos, uno
// después no suma nada (esa tardanza ya se refleja aparte en el ranking).
const HORA_LIMITE_PUNTUALIDAD: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
};

const ROLES_CON_PUNTOS = ["supervisor", "capacitador", "coordinador"];
const PUNTOS_POR_REPORTE = 10;

// Cada 5 días seguidos marcando ingreso a tiempo (saltando los días de
// descanso, que no cuentan ni rompen la racha) suma un bono fijo. Es un bono
// de por vida: una vez alcanzado un tramo de 5 días, ese bono ya quedó
// ganado aunque la racha se corte después.
const RACHA_TRAMO = 5;
const BONO_POR_TRAMO = 5;
const TOPE_DIAS_HACIA_ATRAS = 1095; // ~3 años, por seguridad ante datos raros

function minutosDesdeMedianoche(horaHHMMSS: string): number {
  const [h, m] = horaHHMMSS.split(":").map(Number);
  return h * 60 + m;
}

function puntosPorIngreso(rol: string, horaIngreso: string): number {
  const limite = HORA_LIMITE_PUNTUALIDAD[rol];
  if (!limite) return 0;

  const minutosAntes = minutosDesdeMedianoche(limite) - minutosDesdeMedianoche(horaIngreso);
  if (minutosAntes < 0) return 0; // llegó tarde, no suma
  if (minutosAntes >= 120) return 30;
  if (minutosAntes >= 60) return 20;
  if (minutosAntes >= 30) return 15;
  return 10; // puntual
}

// Recorre día por día desde que la persona ingresó hasta hoy, saltando sus
// días de descanso fijos. Cada marcación a tiempo suma a la racha; una
// tardanza o una ausencia (día laboral sin marcación) la corta a cero. El
// día de hoy, si todavía no marcó, no cuenta ni corta — el día no ha
// terminado. El bono de cada tramo de 5 es acumulativo y no se pierde
// aunque la racha se corte más adelante en la historia.
function calcularRachaYBono(
  fechaInicio: string,
  hoy: string,
  diasDescanso: string[],
  asistenciaPorFecha: Map<string, string>,
  rol: string
): { racha: number; bono: number } {
  let inicio = fechaInicio;
  if (diasEntreFechas(inicio, hoy) > TOPE_DIAS_HACIA_ATRAS) {
    inicio = sumarDias(hoy, -TOPE_DIAS_HACIA_ATRAS);
  }

  let racha = 0;
  let bono = 0;
  let cursor = inicio;

  while (cursor <= hoy) {
    const diaSemana = diaSemanaPeru(cursor);
    if (diasDescanso.includes(diaSemana)) {
      cursor = sumarDias(cursor, 1);
      continue;
    }

    const horaIngreso = asistenciaPorFecha.get(cursor);

    if (cursor === hoy && !horaIngreso) break; // el día de hoy aún no termina

    if (horaIngreso && puntosPorIngreso(rol, horaIngreso) > 0) {
      racha += 1;
      if (racha % RACHA_TRAMO === 0) bono += BONO_POR_TRAMO;
    } else {
      racha = 0;
    }

    cursor = sumarDias(cursor, 1);
  }

  return { racha, bono };
}

export type PuntosUsuario = {
  usuarioId: string;
  nombre: string;
  rol: string;
  puntos: number;
  rachaActual: number;
};

async function calcularPuntosDeTodos(): Promise<PuntosUsuario[]> {
  const supabase = supabaseServer();

  const [usuariosRes, asistenciaRes, reportesRes] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nombre, rol, dias_descanso, fecha_ingreso")
      .in("rol", ROLES_CON_PUNTOS),
    supabase
      .from("asistencia")
      .select("usuario_id, fecha, hora_ingreso, usuarios(rol)")
      .not("hora_ingreso", "is", null),
    supabase.from("rutas_diarias").select("usuario_id"),
  ]);

  if (usuariosRes.error || asistenciaRes.error || reportesRes.error) {
    throw new Error("No se pudo calcular los puntos.");
  }

  const puntosPorUsuario = new Map<string, number>();
  const asistenciaPorUsuario = new Map<string, Map<string, string>>();

  (asistenciaRes.data ?? []).forEach((a: any) => {
    const rol = a.usuarios?.rol as string | undefined;
    if (!rol || !a.hora_ingreso) return;
    const suma = puntosPorIngreso(rol, a.hora_ingreso);
    puntosPorUsuario.set(a.usuario_id, (puntosPorUsuario.get(a.usuario_id) ?? 0) + suma);

    const fechas = asistenciaPorUsuario.get(a.usuario_id) ?? new Map<string, string>();
    fechas.set(a.fecha, a.hora_ingreso);
    asistenciaPorUsuario.set(a.usuario_id, fechas);
  });

  (reportesRes.data ?? []).forEach((r: any) => {
    puntosPorUsuario.set(
      r.usuario_id,
      (puntosPorUsuario.get(r.usuario_id) ?? 0) + PUNTOS_POR_REPORTE
    );
  });

  const hoy = hoyPeru();

  return (usuariosRes.data ?? []).map((u: any) => {
    const asistenciaPorFecha = asistenciaPorUsuario.get(u.id) ?? new Map<string, string>();
    const primeraFecha = Array.from(asistenciaPorFecha.keys()).sort()[0];
    const fechaInicio = u.fecha_ingreso ?? primeraFecha ?? hoy;

    const { racha, bono } = calcularRachaYBono(
      fechaInicio,
      hoy,
      u.dias_descanso ?? [],
      asistenciaPorFecha,
      u.rol
    );

    return {
      usuarioId: u.id,
      nombre: u.nombre,
      rol: u.rol,
      puntos: (puntosPorUsuario.get(u.id) ?? 0) + bono,
      rachaActual: racha,
    };
  });
}

export type MisPuntos = {
  puntos: number;
  medallas: ConteoMedallas;
  progresoBronce: { actual: number; faltan: number };
  rachaActual: number;
};

export async function obtenerMisPuntos(): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const todos = await calcularPuntosDeTodos();
  const propio = todos.find((p) => p.usuarioId === sesion.id);

  return {
    puntos: propio?.puntos ?? 0,
    medallas: calcularConteoMedallas(propio?.puntos ?? 0),
    progresoBronce: progresoProximoBronce(propio?.puntos ?? 0),
    rachaActual: propio?.rachaActual ?? 0,
  };
}

export async function obtenerPuntosDeUsuario(usuarioId: string): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const todos = await calcularPuntosDeTodos();
  const propio = todos.find((p) => p.usuarioId === usuarioId);

  return {
    puntos: propio?.puntos ?? 0,
    medallas: calcularConteoMedallas(propio?.puntos ?? 0),
    progresoBronce: progresoProximoBronce(propio?.puntos ?? 0),
    rachaActual: propio?.rachaActual ?? 0,
  };
}

export type FilaVitrina = PuntosUsuario & { medallas: ConteoMedallas };

export async function obtenerVitrinaTrofeos(): Promise<FilaVitrina[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const todos = await calcularPuntosDeTodos();
  return todos
    .map((p) => ({ ...p, medallas: calcularConteoMedallas(p.puntos) }))
    .sort((a, b) => b.puntos - a.puntos);
}
