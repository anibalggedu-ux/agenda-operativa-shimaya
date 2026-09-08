"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

// Umbral de tardanza al marcar ingreso: cada rol tiene su propia hora límite.
const HORA_LIMITE_POR_ROL: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
};

export type ReportesPorDia = { fecha: string; cantidad: number };

export async function obtenerReportesPorDia(
  desde: string,
  hasta: string
): Promise<ReportesPorDia[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar los reportes por día.");

  const conteo = new Map<string, number>();
  (data ?? []).forEach((r) => {
    conteo.set(r.fecha, (conteo.get(r.fecha) ?? 0) + 1);
  });

  return Array.from(conteo.entries())
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type RankingTienda = { tiendaNombre: string; visitas: number };

export async function obtenerRankingTiendas(
  desde: string,
  hasta: string
): Promise<RankingTienda[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha, tiendas(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar el ranking de tiendas.");

  const conteo = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    const nombre = r.tiendas?.nombre ?? "—";
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  });

  return Array.from(conteo.entries())
    .map(([tiendaNombre, visitas]) => ({ tiendaNombre, visitas }))
    .sort((a, b) => b.visitas - a.visitas)
    .slice(0, 10);
}

export type DesempenoPersona = { nombre: string; rol: string; reportes: number };

export async function obtenerDesempenoPorPersona(
  desde: string,
  hasta: string
): Promise<DesempenoPersona[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("rol, usuarios(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar el desempeño por persona.");

  const conteo = new Map<string, { nombre: string; rol: string; reportes: number }>();
  (data ?? []).forEach((r: any) => {
    const nombre = r.usuarios?.nombre ?? "—";
    const existente = conteo.get(nombre);
    if (existente) existente.reportes += 1;
    else conteo.set(nombre, { nombre, rol: r.rol ?? "—", reportes: 1 });
  });

  return Array.from(conteo.values()).sort((a, b) => b.reportes - a.reportes);
}

export type TendenciaAsistencia = { fecha: string; horaPromedioIngreso: number | null };

function horaADecimal(horaHHMMSS: string): number {
  const [h, m] = horaHHMMSS.split(":").map(Number);
  return h + m / 60;
}

export async function obtenerTendenciaAsistencia(
  desde: string,
  hasta: string
): Promise<TendenciaAsistencia[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .not("hora_ingreso", "is", null);

  if (error) throw new Error("No se pudo cargar la tendencia de asistencia.");

  const porDia = new Map<string, number[]>();
  (data ?? []).forEach((r) => {
    if (!r.hora_ingreso) return;
    const lista = porDia.get(r.fecha) ?? [];
    lista.push(horaADecimal(r.hora_ingreso));
    porDia.set(r.fecha, lista);
  });

  return Array.from(porDia.entries())
    .map(([fecha, horas]) => ({
      fecha,
      horaPromedioIngreso: horas.reduce((a, b) => a + b, 0) / horas.length,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type RankingTardanza = { nombre: string; rol: string; tardanzas: number };

export async function obtenerRankingTardanzas(
  desde: string,
  hasta: string
): Promise<RankingTardanza[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, usuarios(nombre, rol)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .not("hora_ingreso", "is", null);

  if (error) throw new Error("No se pudo cargar el ranking de tardanzas.");

  const conteo = new Map<string, { nombre: string; rol: string; tardanzas: number }>();
  (data ?? []).forEach((r: any) => {
    const rol = r.usuarios?.rol as string | undefined;
    if (!rol || !r.hora_ingreso) return;
    const limite = HORA_LIMITE_POR_ROL[rol];
    if (!limite) return;
    if (r.hora_ingreso <= limite) return;

    const nombre = r.usuarios?.nombre ?? "—";
    const existente = conteo.get(nombre);
    if (existente) existente.tardanzas += 1;
    else conteo.set(nombre, { nombre, rol, tardanzas: 1 });
  });

  return Array.from(conteo.values()).sort((a, b) => b.tardanzas - a.tardanzas);
}
