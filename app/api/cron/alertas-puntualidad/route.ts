import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { notificarPush } from "@/lib/notificar-push";
import { diaLaboralPeru, horaPeru } from "@/lib/fechas";
import { calcularEstadoPuntualidad, type RegistroAsistencia } from "@/lib/puntualidad";

// Mismo secreto que /api/cron/recordatorios-agenda -- lo manda pg_cron de
// Supabase cada 15 min. A diferencia de ese cron (que revisa una tabla de
// eventos propia), la alerta de puntualidad se calcula en vivo con la misma
// lógica que ya usa el panel del coordinador (lib/puntualidad.ts) -- este
// cron solo le agrega el push y evita repetir el aviso el mismo día
// (alertas_puntualidad_push).
export const dynamic = "force-dynamic";

const ROLES_CON_ASISTENCIA = ["supervisor", "capacitador"];

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const diaLaboral = diaLaboralPeru();
  const horaActual = horaPeru();

  const [{ data: colaboradores }, { data: asistenciaHoy }, { data: especialesHoy }, { data: permisosHoy }, { data: yaNotificados }] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nombre, rol, dias_descanso, hora_limite_ingreso, horario_por_dia")
        .eq("activo", true)
        .in("rol", ROLES_CON_ASISTENCIA),
      supabase
        .from("asistencia")
        .select("usuario_id, hora_ingreso, hora_salida")
        .eq("fecha", diaLaboral),
      supabase
        .from("asignaciones_especiales")
        .select("usuario_id")
        .lte("fecha_inicio", diaLaboral)
        .gte("fecha_fin", diaLaboral),
      supabase
        .from("solicitudes_permiso")
        .select("usuario_id")
        .eq("estado", "aprobado")
        .lte("fecha_inicio", diaLaboral)
        .gte("fecha_fin", diaLaboral),
      supabase.from("alertas_puntualidad_push").select("usuario_id").eq("fecha", diaLaboral),
    ]);

  if (!colaboradores || colaboradores.length === 0) {
    return NextResponse.json({ ok: true, avisados: 0 });
  }

  const asistenciaPorUsuario = new Map<string, RegistroAsistencia>();
  (asistenciaHoy ?? []).forEach((a) => {
    asistenciaPorUsuario.set(a.usuario_id, { horaIngreso: a.hora_ingreso, horaSalida: a.hora_salida });
  });

  const exentosHoy = new Set<string>([
    ...(especialesHoy ?? []).map((e) => e.usuario_id),
    ...(permisosHoy ?? []).map((p) => p.usuario_id),
  ]);

  const yaNotificadosHoy = new Set((yaNotificados ?? []).map((n) => n.usuario_id));

  const conProblemaHoy = colaboradores.filter((u) => {
    if (exentosHoy.has(u.id) || yaNotificadosHoy.has(u.id)) return false;

    const mapaAsistencia = new Map<string, RegistroAsistencia>();
    const registro = asistenciaPorUsuario.get(u.id);
    if (registro) mapaAsistencia.set(diaLaboral, registro);

    const estado = calcularEstadoPuntualidad(
      u.id,
      u.nombre,
      u.rol,
      u.dias_descanso ?? [],
      mapaAsistencia,
      diaLaboral,
      horaActual,
      new Set(),
      null,
      u.hora_limite_ingreso ?? null,
      (u.horario_por_dia as Record<string, string> | null) ?? null
    );

    return estado.estadoHoy === "tarde" || estado.estadoHoy === "pendiente_tarde";
  });

  if (conProblemaHoy.length === 0) {
    return NextResponse.json({ ok: true, avisados: 0 });
  }

  const { data: responsables } = await supabase
    .from("usuarios")
    .select("id")
    .in("rol", ["coordinador", "gerente"])
    .eq("activo", true);
  const idsResponsables = (responsables ?? []).map((r) => r.id);

  for (const colaborador of conProblemaHoy) {
    const registro = asistenciaPorUsuario.get(colaborador.id);
    await notificarPush(idsResponsables, {
      titulo: "🚨 Alerta de puntualidad",
      cuerpo: registro?.horaIngreso
        ? `${colaborador.nombre} llegó tarde hoy.`
        : `${colaborador.nombre} todavía no marca su llegada y ya pasó su hora límite.`,
    });
  }

  await supabase
    .from("alertas_puntualidad_push")
    .insert(conProblemaHoy.map((u) => ({ usuario_id: u.id, fecha: diaLaboral })));

  return NextResponse.json({ ok: true, avisados: conProblemaHoy.length });
}
