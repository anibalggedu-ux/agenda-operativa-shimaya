"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirAccesoRegistro } from "./actions";
import { hoyPeru, sumarDias } from "@/lib/fechas";

// Ventana para "último acceso" / "último reporte": no busca en todo el
// historial (podría ser años de datos para nada, ya que lo que importa acá
// es detectar inactividad reciente) -- si no hay nada en este rango, se
// considera que no hay actividad reciente que mostrar.
const VENTANA_ULTIMA_ACTIVIDAD_DIAS = 180;

export type ActividadUsuario = {
  usuarioId: string;
  nombre: string;
  rol: string;
  accesosEnRango: number;
  reportesEnRango: number;
  ultimoAcceso: string | null;
  ultimoReporte: string | null;
};

export async function obtenerActividadUsuarios(
  desde: string,
  hasta: string
): Promise<ActividadUsuario[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();
  const desdeVentana = sumarDias(hoyPeru(), -VENTANA_ULTIMA_ACTIVIDAD_DIAS);

  const [
    { data: usuarios, error: errorUsuarios },
    { data: accesosRango, error: errorAccesosRango },
    { data: reportesRango, error: errorReportesRango },
    { data: ultimosAccesos, error: errorUltimosAccesos },
    { data: ultimosReportes, error: errorUltimosReportes },
  ] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre"),
    supabase
      .from("accesos_sistema")
      .select("usuario_id")
      .gte("created_at", desde + "T00:00:00")
      .lte("created_at", hasta + "T23:59:59"),
    supabase.from("rutas_diarias").select("usuario_id").gte("fecha", desde).lte("fecha", hasta),
    supabase
      .from("accesos_sistema")
      .select("usuario_id, created_at")
      .gte("created_at", desdeVentana + "T00:00:00")
      .order("created_at", { ascending: false }),
    supabase
      .from("rutas_diarias")
      .select("usuario_id, fecha")
      .gte("fecha", desdeVentana)
      .order("fecha", { ascending: false }),
  ]);

  if (
    errorUsuarios ||
    errorAccesosRango ||
    errorReportesRango ||
    errorUltimosAccesos ||
    errorUltimosReportes
  ) {
    throw new Error("No se pudo cargar la actividad de usuarios.");
  }

  const accesosPorUsuario = new Map<string, number>();
  (accesosRango ?? []).forEach((a) => {
    if (!a.usuario_id) return;
    accesosPorUsuario.set(a.usuario_id, (accesosPorUsuario.get(a.usuario_id) ?? 0) + 1);
  });

  const reportesPorUsuario = new Map<string, number>();
  (reportesRango ?? []).forEach((r) => {
    reportesPorUsuario.set(r.usuario_id, (reportesPorUsuario.get(r.usuario_id) ?? 0) + 1);
  });

  // Ya vienen ordenados de más reciente a más antiguo, así que el primero
  // que aparezca por usuario es su actividad más reciente en la ventana.
  const ultimoAccesoPorUsuario = new Map<string, string>();
  (ultimosAccesos ?? []).forEach((a) => {
    if (a.usuario_id && !ultimoAccesoPorUsuario.has(a.usuario_id)) {
      ultimoAccesoPorUsuario.set(a.usuario_id, a.created_at);
    }
  });

  const ultimoReportePorUsuario = new Map<string, string>();
  (ultimosReportes ?? []).forEach((r) => {
    if (!ultimoReportePorUsuario.has(r.usuario_id)) {
      ultimoReportePorUsuario.set(r.usuario_id, r.fecha);
    }
  });

  return (usuarios ?? []).map((u) => ({
    usuarioId: u.id,
    nombre: u.nombre,
    rol: u.rol,
    accesosEnRango: accesosPorUsuario.get(u.id) ?? 0,
    reportesEnRango: reportesPorUsuario.get(u.id) ?? 0,
    ultimoAcceso: ultimoAccesoPorUsuario.get(u.id) ?? null,
    ultimoReporte: ultimoReportePorUsuario.get(u.id) ?? null,
  }));
}
