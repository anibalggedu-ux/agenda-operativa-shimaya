"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import {
  calcularConteoMedallas,
  progresoProximoBronce,
  type ConteoMedallas,
} from "@/lib/trofeos";
import { hoyPeru, sumarDias, diaSemanaPeru, diasEntreFechas } from "@/lib/fechas";
import { resolverHoraLimite } from "@/lib/puntualidad";

const ROLES_CON_PUNTOS = ["supervisor", "capacitador", "coordinador"];
const PUNTOS_POR_REPORTE = 10;

// Cada 5 días seguidos marcando ingreso a tiempo (saltando los días de
// descanso, que no cuentan ni rompen la racha) suma un bono fijo. Es un bono
// de por vida: una vez alcanzado un tramo de 5 días, ese bono ya quedó
// ganado aunque la racha se corte después.
const RACHA_TRAMO = 5;
const BONO_POR_TRAMO = 5;
const TOPE_DIAS_HACIA_ATRAS = 1095; // ~3 años, por seguridad ante datos raros

// Cuenta "viajes" a partir de fechas de reporte a una tienda de provincia:
// un viaje es un tramo de fechas cercanas entre sí (se viaja en avión y se
// hospeda varios días seguidos), sin importar cuánto dure. Un hueco de hasta
// 2 días sin reporte (ej. su descanso semanal en medio del viaje) no corta
// el viaje; un hueco mayor sí — ahí ya volvió y luego viajó de nuevo.
const MAX_HUECO_DIAS_MISMO_VIAJE = 3;

function contarViajesProvincia(fechas: string[]): number {
  const ordenadas = Array.from(new Set(fechas)).sort();
  let viajes = 0;
  let anterior: string | null = null;
  for (const fecha of ordenadas) {
    if (anterior === null || diasEntreFechas(anterior, fecha) > MAX_HUECO_DIAS_MISMO_VIAJE) {
      viajes += 1;
    }
    anterior = fecha;
  }
  return viajes;
}

function minutosDesdeMedianoche(horaHHMMSS: string): number {
  const [h, m] = horaHHMMSS.split(":").map(Number);
  return h * 60 + m;
}

function puntosPorIngreso(
  rol: string,
  horaIngreso: string,
  horaLimitePersonalizada?: string | null,
  horarioPorDia?: Record<string, string> | null,
  diaSemana?: string
): number {
  const limite = resolverHoraLimite(rol, horaLimitePersonalizada, horarioPorDia, diaSemana);
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
  rol: string,
  horaLimitePersonalizada?: string | null,
  horarioPorDia?: Record<string, string> | null
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

    if (horaIngreso && puntosPorIngreso(rol, horaIngreso, horaLimitePersonalizada, horarioPorDia, diaSemana) > 0) {
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
  // Cuántos viajes (tramos de días seguidos, con o sin huecos cortos) hizo a
  // una tienda de provincia — cada viaje completo suma una "copa" en la
  // Vitrina de Trofeos, sin importar cuántos días haya durado, aparte del
  // sistema de puntos (ver contarViajesProvincia).
  viajesProvincia: number;
};

// Suma neta de Historias: cuánto ha recibido menos cuánto ha regalado cada
// usuario. Se aplica como ajuste al total de puntos, igual que
// puntos_heredados -- un regalo es una transferencia real, no un bono.
async function obtenerNetoRegalosPorUsuario(): Promise<Map<string, number>> {
  const supabase = supabaseServer();
  const { data } = await supabase.from("historia_regalos").select("usuario_id_regala, usuario_id_recibe, puntos");

  const neto = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    neto.set(r.usuario_id_recibe, (neto.get(r.usuario_id_recibe) ?? 0) + r.puntos);
    neto.set(r.usuario_id_regala, (neto.get(r.usuario_id_regala) ?? 0) - r.puntos);
  });
  return neto;
}

async function calcularPuntosDeTodos(): Promise<PuntosUsuario[]> {
  const supabase = supabaseServer();

  const [usuariosRes, asistenciaRes, reportesRes, rutasActivasRes, tiendasProvinciaRes, netoRegalos] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select(
          "id, nombre, rol, dias_descanso, fecha_ingreso, hora_limite_ingreso, horario_por_dia, puntos_heredados"
        )
        .in("rol", ROLES_CON_PUNTOS),
      supabase
        .from("asistencia")
        .select("usuario_id, fecha, hora_ingreso, usuarios(rol, hora_limite_ingreso, horario_por_dia)")
        .not("hora_ingreso", "is", null),
      supabase.from("rutas_diarias").select("usuario_id, tienda_id, fecha"),
      // Rutas ya asignadas pero aún no reportadas (se borran de aquí y pasan a
      // rutas_diarias recién cuando se envía el reporte — ver guardarReporte
      // en supervisor/actions.ts). Un viaje de provincia cuenta desde el día
      // que se asigna, no desde que se reporta, así que se incluyen acá.
      supabase.from("rutas_activas").select("usuario_id, tienda_id, fecha_planificada"),
      supabase.from("tiendas").select("id").eq("es_provincia", true),
      obtenerNetoRegalosPorUsuario(),
    ]);

  if (
    usuariosRes.error ||
    asistenciaRes.error ||
    reportesRes.error ||
    rutasActivasRes.error ||
    tiendasProvinciaRes.error
  ) {
    throw new Error("No se pudo calcular los puntos.");
  }

  const tiendasProvinciaIds = new Set((tiendasProvinciaRes.data ?? []).map((t) => t.id));

  // Fechas asignadas o reportadas en tienda de provincia (rutas_activas +
  // rutas_diarias — una fecha nunca está en ambas, ver guardarReporte),
  // agrupadas por usuario+tienda para contar "viajes" (más abajo).
  const fechasProvinciaPorUsuarioYTienda = new Map<string, string[]>();

  const puntosPorUsuario = new Map<string, number>();
  const asistenciaPorUsuario = new Map<string, Map<string, string>>();

  (asistenciaRes.data ?? []).forEach((a: any) => {
    const rol = a.usuarios?.rol as string | undefined;
    if (!rol || !a.hora_ingreso) return;
    const suma = puntosPorIngreso(
      rol,
      a.hora_ingreso,
      a.usuarios?.hora_limite_ingreso,
      a.usuarios?.horario_por_dia,
      diaSemanaPeru(a.fecha)
    );
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
    if (tiendasProvinciaIds.has(r.tienda_id)) {
      const clave = `${r.usuario_id}|${r.tienda_id}`;
      const fechas = fechasProvinciaPorUsuarioYTienda.get(clave) ?? [];
      fechas.push(r.fecha);
      fechasProvinciaPorUsuarioYTienda.set(clave, fechas);
    }
  });

  // Rutas asignadas pero aún no reportadas: no dan los 10 pts (eso es solo
  // por reporte enviado), pero sí cuentan para el viaje — la copa no espera
  // a que termine de reportar todos los días de su viaje.
  (rutasActivasRes.data ?? []).forEach((r: any) => {
    if (tiendasProvinciaIds.has(r.tienda_id)) {
      const clave = `${r.usuario_id}|${r.tienda_id}`;
      const fechas = fechasProvinciaPorUsuarioYTienda.get(clave) ?? [];
      fechas.push(r.fecha_planificada);
      fechasProvinciaPorUsuarioYTienda.set(clave, fechas);
    }
  });

  const viajesProvinciaPorUsuario = new Map<string, number>();
  fechasProvinciaPorUsuarioYTienda.forEach((fechas, clave) => {
    const usuarioId = clave.split("|")[0];
    const viajes = contarViajesProvincia(fechas);
    viajesProvinciaPorUsuario.set(usuarioId, (viajesProvinciaPorUsuario.get(usuarioId) ?? 0) + viajes);
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
      u.rol,
      u.hora_limite_ingreso,
      u.horario_por_dia
    );

    return {
      usuarioId: u.id,
      nombre: u.nombre,
      rol: u.rol,
      puntos: (puntosPorUsuario.get(u.id) ?? 0) + bono + (u.puntos_heredados ?? 0) + (netoRegalos.get(u.id) ?? 0),
      rachaActual: racha,
      viajesProvincia: viajesProvinciaPorUsuario.get(u.id) ?? 0,
    };
  });
}

export type MisPuntos = {
  puntos: number;
  medallas: ConteoMedallas;
  progresoBronce: { actual: number; faltan: number };
  rachaActual: number;
  viajesProvincia: number;
  totalDonado: number;
};

// Cuántos puntos ha regalado en total a través de Historias -- estadística
// aparte del saldo (que ya descuenta lo regalado), para que se vea cuánto ha
// donado sin tener que restarlo mentalmente.
export async function obtenerTotalDonado(usuarioId?: string): Promise<number> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("historia_regalos")
    .select("puntos")
    .eq("usuario_id_regala", usuarioId ?? sesion.id);

  return (data ?? []).reduce((acc: number, r: any) => acc + r.puntos, 0);
}

// Cuánto puede regalar ahora mismo desde una historia. Supervisor,
// capacitador y coordinador usan su saldo real de puntos (puntualidad +
// reportes + heredados + neto de regalos, ver calcularPuntosDeTodos).
// Gerente no participa de ese sistema (no hace bitácora de campo), así que
// su saldo para regalar sale solo de lo que ha recibido en regalos.
export async function obtenerSaldoDisponibleParaRegalo(): Promise<number> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  if (ROLES_CON_PUNTOS.includes(sesion.rol)) {
    const mis = await obtenerMisPuntos();
    return mis.puntos;
  }

  const neto = await obtenerNetoRegalosPorUsuario();
  return neto.get(sesion.id) ?? 0;
}

export async function obtenerMisPuntos(): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const [todos, totalDonado] = await Promise.all([calcularPuntosDeTodos(), obtenerTotalDonado(sesion.id)]);
  const propio = todos.find((p) => p.usuarioId === sesion.id);

  return {
    puntos: propio?.puntos ?? 0,
    medallas: calcularConteoMedallas(propio?.puntos ?? 0),
    progresoBronce: progresoProximoBronce(propio?.puntos ?? 0),
    rachaActual: propio?.rachaActual ?? 0,
    viajesProvincia: propio?.viajesProvincia ?? 0,
    totalDonado,
  };
}

export async function obtenerPuntosDeUsuario(usuarioId: string): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const [todos, totalDonado] = await Promise.all([calcularPuntosDeTodos(), obtenerTotalDonado(usuarioId)]);
  const propio = todos.find((p) => p.usuarioId === usuarioId);

  return {
    puntos: propio?.puntos ?? 0,
    medallas: calcularConteoMedallas(propio?.puntos ?? 0),
    progresoBronce: progresoProximoBronce(propio?.puntos ?? 0),
    rachaActual: propio?.rachaActual ?? 0,
    viajesProvincia: propio?.viajesProvincia ?? 0,
    totalDonado,
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
