"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirGerenteOCoordinador } from "@/lib/session";
import { diaSemanaPeru, hoyPeru } from "@/lib/fechas";
import { esTarde, resolverHoraLimite, expandirRangoFechas } from "@/lib/puntualidad";

// Reporte de no cumplimiento: pensado para que coordinador/gerente revisen,
// en un rango de fechas, quiénes se salen de lo esperado en 6 frentes
// distintos -- cada uno independiente de los demás (alguien puede salir en
// varios a la vez). Solo supervisores y capacitadores activos y reales (sin
// cuentas genéricas) -- coordinador y gerente nunca entran a su propio
// reporte.

export type FilaCumplimiento = { usuarioId: string; usuarioNombre: string; rol: string; cantidad: number };

export type ReporteNoCumplimiento = {
  tardanzas: FilaCumplimiento[];
  sinSalida: FilaCumplimiento[];
  sinBreak: FilaCumplimiento[];
  sePasoBreak: FilaCumplimiento[];
  sinObservaciones: FilaCumplimiento[];
  sinChecklist: FilaCumplimiento[];
};

type UsuarioBase = {
  id: string;
  nombre: string;
  rol: string;
  dias_descanso: string[] | null;
  hora_limite_ingreso: string | null;
  horario_por_dia: Record<string, string> | null;
};

export async function obtenerReporteNoCumplimiento(desde: string, hasta: string): Promise<ReporteNoCumplimiento> {
  const sesion = await exigirGerenteOCoordinador();
  void sesion;
  const supabase = supabaseServer();

  const [
    { data: usuarios, error: errorUsuarios },
    { data: asistencia, error: errorAsistencia },
    { data: breaks, error: errorBreaks },
    { data: reportes, error: errorReportes },
    { data: checklists, error: errorChecklists },
    { data: especiales, error: errorEspeciales },
  ] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nombre, rol, dias_descanso, hora_limite_ingreso, horario_por_dia")
      .eq("activo", true)
      .in("rol", ["supervisor", "capacitador"])
      .not("nombre", "ilike", "%generico%"),
    supabase
      .from("asistencia")
      .select("usuario_id, fecha, hora_ingreso, hora_salida")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    supabase
      .from("marcaciones_break")
      .select("usuario_id, fecha, hora_salida, hora_limite, hora_entrada, no_salio")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    supabase.from("rutas_diarias").select("usuario_id, fecha").gte("fecha", desde).lte("fecha", hasta),
    supabase.from("checklists_visita").select("usuario_id, fecha").gte("fecha", desde).lte("fecha", hasta),
    supabase
      .from("asignaciones_especiales")
      .select("usuario_id, fecha_inicio, fecha_fin")
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde),
  ]);

  if (errorUsuarios || errorAsistencia || errorBreaks || errorReportes || errorChecklists || errorEspeciales) {
    throw new Error("No se pudo cargar el reporte de no cumplimiento.");
  }

  const hoy = hoyPeru();
  const usuariosBase = (usuarios ?? []) as UsuarioBase[];
  const mapaUsuarios = new Map(usuariosBase.map((u) => [u.id, u]));

  // Días en que cada persona está exenta de marcar nada (vacaciones, permiso,
  // licencia, misión especial) -- mismo criterio que calcularPendientesBreak
  // en break-actions.ts, pero acumulado por usuario para consultarlo rápido.
  const diasEspecialesPorUsuario = new Map<string, Set<string>>();
  (especiales ?? []).forEach((e: any) => {
    const fechas = expandirRangoFechas(e.fecha_inicio, e.fecha_fin).filter((f) => f >= desde && f <= hasta);
    const set = diasEspecialesPorUsuario.get(e.usuario_id) ?? new Set<string>();
    fechas.forEach((f) => set.add(f));
    diasEspecialesPorUsuario.set(e.usuario_id, set);
  });

  function diaExentoDeTrabajar(usuarioId: string, fecha: string): boolean {
    const usuario = mapaUsuarios.get(usuarioId);
    if (!usuario) return true;
    if ((usuario.dias_descanso ?? []).includes(diaSemanaPeru(fecha))) return true;
    if (diasEspecialesPorUsuario.get(usuarioId)?.has(fecha)) return true;
    return false;
  }

  function sumar(mapa: Map<string, number>, usuarioId: string) {
    mapa.set(usuarioId, (mapa.get(usuarioId) ?? 0) + 1);
  }

  function aFilas(mapa: Map<string, number>): FilaCumplimiento[] {
    return Array.from(mapa.entries())
      .map(([usuarioId, cantidad]) => {
        const u = mapaUsuarios.get(usuarioId);
        return { usuarioId, usuarioNombre: u?.nombre ?? "—", rol: u?.rol ?? "—", cantidad };
      })
      .sort((a, b) => b.cantidad - a.cantidad || a.usuarioNombre.localeCompare(b.usuarioNombre));
  }

  // ---------- 1) Tardanzas y 2) No marcó salida (asistencia) ----------
  const tardanzasPorUsuario = new Map<string, number>();
  const sinSalidaPorUsuario = new Map<string, number>();

  (asistencia ?? []).forEach((a: any) => {
    const usuario = mapaUsuarios.get(a.usuario_id);
    if (!usuario) return; // no es supervisor/capacitador activo real

    if (a.hora_ingreso) {
      const limite = resolverHoraLimite(
        usuario.rol,
        usuario.hora_limite_ingreso,
        usuario.horario_por_dia,
        diaSemanaPeru(a.fecha)
      );
      if (limite && esTarde(a.hora_ingreso, limite)) sumar(tardanzasPorUsuario, a.usuario_id);

      // El día de hoy puede seguir en curso -- recién de mañana en adelante
      // cuenta como "no marcó salida" para no avisar antes de tiempo.
      if (!a.hora_salida && a.fecha < hoy) sumar(sinSalidaPorUsuario, a.usuario_id);
    }
  });

  // ---------- 3) No marcó break y 4) Se pasó del tiempo de break ----------
  const sePasoBreakPorUsuario = new Map<string, number>();
  const diasConBreakPorUsuario = new Map<string, Set<string>>();

  (breaks ?? []).forEach((b: any) => {
    if (!mapaUsuarios.has(b.usuario_id)) return;
    const set = diasConBreakPorUsuario.get(b.usuario_id) ?? new Set<string>();
    set.add(b.fecha);
    diasConBreakPorUsuario.set(b.usuario_id, set);

    if (b.hora_entrada && b.hora_limite && b.hora_entrada > b.hora_limite) {
      sumar(sePasoBreakPorUsuario, b.usuario_id);
    }
  });

  const diasConReportePorUsuario = new Map<string, Set<string>>();
  (reportes ?? []).forEach((r: any) => {
    if (!mapaUsuarios.has(r.usuario_id)) return;
    const set = diasConReportePorUsuario.get(r.usuario_id) ?? new Set<string>();
    set.add(r.fecha);
    diasConReportePorUsuario.set(r.usuario_id, set);
  });

  const sinBreakPorUsuario = new Map<string, number>();
  const sinObservacionesPorUsuario = new Map<string, number>();
  const diasDelRango = expandirRangoFechas(desde, hasta).filter((f) => f < hoy); // día en curso no cuenta como falta

  usuariosBase.forEach((u) => {
    diasDelRango.forEach((fecha) => {
      if (diaExentoDeTrabajar(u.id, fecha)) return;
      if (!diasConBreakPorUsuario.get(u.id)?.has(fecha)) sumar(sinBreakPorUsuario, u.id);
      if (!diasConReportePorUsuario.get(u.id)?.has(fecha)) sumar(sinObservacionesPorUsuario, u.id);
    });
  });

  // ---------- 6) No hace checklist (total del rango, no por día -- la
  // frecuencia esperada es semanal, no diaria) ----------
  const checklistsPorUsuario = new Set<string>();
  (checklists ?? []).forEach((c: any) => {
    if (mapaUsuarios.has(c.usuario_id)) checklistsPorUsuario.add(c.usuario_id);
  });
  const sinChecklist: FilaCumplimiento[] = usuariosBase
    .filter((u) => !checklistsPorUsuario.has(u.id))
    .map((u) => ({ usuarioId: u.id, usuarioNombre: u.nombre, rol: u.rol, cantidad: 0 }))
    .sort((a, b) => a.usuarioNombre.localeCompare(b.usuarioNombre));

  return {
    tardanzas: aFilas(tardanzasPorUsuario),
    sinSalida: aFilas(sinSalidaPorUsuario),
    sinBreak: aFilas(sinBreakPorUsuario),
    sePasoBreak: aFilas(sePasoBreakPorUsuario),
    sinObservaciones: aFilas(sinObservacionesPorUsuario),
    sinChecklist,
  };
}
