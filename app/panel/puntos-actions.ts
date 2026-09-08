"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import {
  calcularConteoMedallas,
  progresoProximoBronce,
  type ConteoMedallas,
} from "@/lib/trofeos";

// Misma hora límite de puntualidad ya usada en Central Analítica para el
// ranking de tardanzas — un ingreso antes de esta hora suma puntos, uno
// después no suma nada (esa tardanza ya se refleja aparte en el ranking).
const HORA_LIMITE_PUNTUALIDAD: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
};

const ROLES_CON_PUNTOS = ["supervisor", "capacitador", "coordinador"];
const PUNTOS_POR_REPORTE = 10;

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

export type PuntosUsuario = {
  usuarioId: string;
  nombre: string;
  rol: string;
  puntos: number;
};

async function calcularPuntosDeTodos(): Promise<PuntosUsuario[]> {
  const supabase = supabaseServer();

  const [usuariosRes, asistenciaRes, reportesRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, rol").in("rol", ROLES_CON_PUNTOS),
    supabase
      .from("asistencia")
      .select("usuario_id, hora_ingreso, usuarios(rol)")
      .not("hora_ingreso", "is", null),
    supabase.from("rutas_diarias").select("usuario_id"),
  ]);

  if (usuariosRes.error || asistenciaRes.error || reportesRes.error) {
    throw new Error("No se pudo calcular los puntos.");
  }

  const puntosPorUsuario = new Map<string, number>();

  (asistenciaRes.data ?? []).forEach((a: any) => {
    const rol = a.usuarios?.rol as string | undefined;
    if (!rol || !a.hora_ingreso) return;
    const suma = puntosPorIngreso(rol, a.hora_ingreso);
    puntosPorUsuario.set(a.usuario_id, (puntosPorUsuario.get(a.usuario_id) ?? 0) + suma);
  });

  (reportesRes.data ?? []).forEach((r: any) => {
    puntosPorUsuario.set(
      r.usuario_id,
      (puntosPorUsuario.get(r.usuario_id) ?? 0) + PUNTOS_POR_REPORTE
    );
  });

  return (usuariosRes.data ?? []).map((u: any) => ({
    usuarioId: u.id,
    nombre: u.nombre,
    rol: u.rol,
    puntos: puntosPorUsuario.get(u.id) ?? 0,
  }));
}

export type MisPuntos = {
  puntos: number;
  medallas: ConteoMedallas;
  progresoBronce: { actual: number; faltan: number };
};

export async function obtenerMisPuntos(): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const todos = await calcularPuntosDeTodos();
  const puntos = todos.find((p) => p.usuarioId === sesion.id)?.puntos ?? 0;

  return {
    puntos,
    medallas: calcularConteoMedallas(puntos),
    progresoBronce: progresoProximoBronce(puntos),
  };
}

export async function obtenerPuntosDeUsuario(usuarioId: string): Promise<MisPuntos> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const todos = await calcularPuntosDeTodos();
  const puntos = todos.find((p) => p.usuarioId === usuarioId)?.puntos ?? 0;

  return {
    puntos,
    medallas: calcularConteoMedallas(puntos),
    progresoBronce: progresoProximoBronce(puntos),
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
