"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import type { ReporteHistorialItem, MarcacionHistorial } from "@/lib/generar-pdf";
import { resolverHoraLimite, esTarde } from "@/lib/puntualidad";
import { diaSemanaPeru, hoyPeru, sumarDias } from "@/lib/fechas";

export async function obtenerHistorialReportes(
  desde: string,
  hasta: string
): Promise<ReporteHistorialItem[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("fecha, observacion, actividad, tiendas!tienda_id(nombre)")
    .eq("usuario_id", sesion.id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (error) throw new Error("No se pudo cargar el historial de reportes.");

  return (data ?? []).map((r: any) => ({
    fecha: r.fecha,
    tiendaNombre: r.tiendas.nombre,
    observacion: r.observacion,
    actividad: r.actividad,
  }));
}

export async function obtenerHistorialMarcaciones(
  desde: string,
  hasta: string
): Promise<MarcacionHistorial[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const [{ data, error }, { data: usuario }] = await Promise.all([
    supabase
      .from("asistencia")
      .select("fecha, hora_ingreso, hora_salida")
      .eq("usuario_id", sesion.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true }),
    supabase.from("usuarios").select("hora_limite_ingreso, horario_por_dia").eq("id", sesion.id).maybeSingle(),
  ]);

  if (error) throw new Error("No se pudo cargar las marcaciones.");

  return (data ?? []).map((a) => {
    const limite = resolverHoraLimite(
      sesion.rol,
      usuario?.hora_limite_ingreso,
      usuario?.horario_por_dia as Record<string, string> | null,
      diaSemanaPeru(a.fecha)
    );
    return {
      fecha: a.fecha,
      horaIngreso: a.hora_ingreso,
      horaSalida: a.hora_salida,
      tarde: !!(limite && a.hora_ingreso && esTarde(a.hora_ingreso, limite)),
    };
  });
}

// Minutos de diferencia (b - a), ambas "HH:MM:SS" del mismo día.
function minutosEntre(a: string, b: string): number {
  const [ha, ma] = a.split(":").map(Number);
  const [hb, mb] = b.split(":").map(Number);
  return hb * 60 + mb - (ha * 60 + ma);
}

// Solo los días con problema (no marcó break habiendo ido a trabajar, o lo
// marcó pero se pasó del tiempo) -- un break usado bien y a tiempo no sale
// en el PDF.
export async function obtenerMisIncidenciasBreak(
  desde: string,
  hasta: string
): Promise<{ fecha: string; detalle: string }[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const [{ data: asistencia, error: errorAsistencia }, { data: breaks, error: errorBreaks }] = await Promise.all([
    supabase
      .from("asistencia")
      .select("fecha, hora_ingreso")
      .eq("usuario_id", sesion.id)
      .gte("fecha", desde)
      .lte("fecha", hasta),
    supabase
      .from("marcaciones_break")
      .select("fecha, hora_salida, hora_limite, hora_entrada, no_salio")
      .eq("usuario_id", sesion.id)
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  if (errorAsistencia || errorBreaks) throw new Error("No se pudo cargar las incidencias de break.");

  // La función de break recién entra en vigencia a partir de
  // FECHA_INICIO_INCIDENCIAS_BREAK -- antes de eso nadie podía marcarlo,
  // así que esos días no cuentan como "no marcó".
  const FECHA_INICIO_INCIDENCIAS_BREAK = sumarDias(hoyPeru(), 1);
  const breakPorFecha = new Map((breaks ?? []).map((b) => [b.fecha, b]));
  const incidencias: { fecha: string; detalle: string }[] = [];

  (asistencia ?? [])
    .filter((a) => a.hora_ingreso && a.fecha >= FECHA_INICIO_INCIDENCIAS_BREAK)
    .forEach((a) => {
      const b = breakPorFecha.get(a.fecha);
      // Un "no salió al break" declarado a propósito no es una incidencia.
      if (!b || b.no_salio) {
        if (!b) incidencias.push({ fecha: a.fecha, detalle: "No marcó su break." });
        return;
      }
      if (!b.hora_entrada) {
        incidencias.push({
          fecha: a.fecha,
          detalle: `Salió a break a las ${b.hora_salida!.slice(0, 5)} y no marcó su entrada.`,
        });
        return;
      }
      const minutosPasados = minutosEntre(b.hora_limite!, b.hora_entrada);
      if (minutosPasados > 0) {
        incidencias.push({
          fecha: a.fecha,
          detalle: `Se pasó ${minutosPasados} min del break (volvió a las ${b.hora_entrada.slice(0, 5)}, debía a las ${b.hora_limite!.slice(0, 5)}).`,
        });
      }
    });

  incidencias.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return incidencias;
}

export async function obtenerMisAutoasignaciones(desde: string, hasta: string): Promise<number> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { count, error } = await supabase
    .from("rutas_diarias")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", sesion.id)
    .not("origen_tienda_id", "is", null)
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) throw new Error("No se pudo cargar las auto-asignaciones.");
  return count ?? 0;
}

export type AsignacionEspecialPdf = { tipo: string; fechaInicio: string; fechaFin: string; motivo: string | null };

export async function obtenerMisAsignacionesEspeciales(
  desde: string,
  hasta: string
): Promise<AsignacionEspecialPdf[]> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("asignaciones_especiales")
    .select("tipo, fecha_inicio, fecha_fin, motivo")
    .eq("usuario_id", sesion.id)
    .lte("fecha_inicio", hasta)
    .gte("fecha_fin", desde)
    .order("fecha_inicio", { ascending: true });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");
  return (data ?? []).map((a) => ({
    tipo: a.tipo,
    fechaInicio: a.fecha_inicio,
    fechaFin: a.fecha_fin,
    motivo: a.motivo ?? null,
  }));
}

export type PerfilPdf = {
  rol: string;
  tiendasPermanentes: string[];
  diasDescanso: string[];
};

export async function obtenerPerfilParaPdf(): Promise<PerfilPdf> {
  const sesion = await obtenerSesion();
  if (!sesion || !tieneBitacora(sesion.rol)) {
    throw new Error("No autorizado.");
  }

  const supabase = supabaseServer();
  const [{ data: usuario }, { data: permanentes }] = await Promise.all([
    supabase.from("usuarios").select("dias_descanso").eq("id", sesion.id).maybeSingle(),
    supabase.from("tiendas_permanentes").select("tiendas(nombre)").eq("usuario_id", sesion.id),
  ]);

  return {
    rol: sesion.rol,
    tiendasPermanentes: (permanentes ?? [])
      .map((p: any) => p.tiendas?.nombre as string | undefined)
      .filter((n): n is string => !!n),
    diasDescanso: usuario?.dias_descanso ?? [],
  };
}
