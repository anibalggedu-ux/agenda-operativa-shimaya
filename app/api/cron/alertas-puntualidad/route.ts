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

  const [
    { data: colaboradores, error: errorColaboradores },
    { data: asistenciaHoy, error: errorAsistencia },
    { data: especialesHoy, error: errorEspeciales },
    { data: permisosHoy, error: errorPermisos },
    { data: yaNotificados, error: errorNotificados },
  ] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nombre, rol, dias_descanso, hora_limite_ingreso, horario_por_dia")
      .eq("activo", true)
      .in("rol", ROLES_CON_ASISTENCIA)
      // Las cuentas de prueba (sup-generico, cap-generico, coor-generico)
      // no marcan de verdad -- no deben disparar alertas.
      .not("nombre", "ilike", "%generico%"),
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

  // Si alguna consulta falla (ej. un hipo momentáneo de conexión), antes se
  // seguía igual con esos datos como [] -- y una tabla de asistencia "vacía"
  // hace ver a TODO el mundo como que no marcó llegada, mandando alertas
  // falsas en masa. Mejor no avisar nada esta corrida que avisar mal.
  const error = errorColaboradores || errorAsistencia || errorEspeciales || errorPermisos || errorNotificados;
  if (error) {
    console.error("alertas-puntualidad: no se pudo leer los datos de hoy, se omite esta corrida:", error);
    return NextResponse.json({ ok: false, avisados: 0, error: "No se pudo leer los datos de hoy." }, { status: 500 });
  }

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

  // Se reserva el aviso ANTES de mandarlo, una persona a la vez (no todo el
  // lote junto al final) -- si dos corridas del cron se solapan (pg_cron
  // puede disparar la siguiente antes de que la anterior termine), la
  // segunda pierde la carrera al insertar (choca con el "unique" de
  // usuario_id+fecha) y se salta esa persona en vez de mandar el push dos
  // veces. Antes se insertaba todo el lote junto al final: un solo choque
  // tumbaba el insert COMPLETO, así que ni siquiera quedaba registrado que
  // ya se había avisado -- eso fue lo que pasó hoy a las 11:05am.
  let avisados = 0;
  for (const colaborador of conProblemaHoy) {
    const { error: errorReserva } = await supabase
      .from("alertas_puntualidad_push")
      .insert({ usuario_id: colaborador.id, fecha: diaLaboral });
    if (errorReserva) continue; // otra corrida ya se la ganó -- no se avisa dos veces

    const registro = asistenciaPorUsuario.get(colaborador.id);
    await notificarPush(idsResponsables, {
      titulo: "🚨 Alerta de puntualidad",
      cuerpo: registro?.horaIngreso
        ? `${colaborador.nombre} llegó tarde hoy.`
        : `${colaborador.nombre} todavía no marca su llegada y ya pasó su hora límite.`,
    });
    avisados++;
  }

  return NextResponse.json({ ok: true, avisados });
}
