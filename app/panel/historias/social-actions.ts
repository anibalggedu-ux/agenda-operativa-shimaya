"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirSesion } from "@/lib/session";
import { hoyPeru, sumarDias } from "@/lib/fechas";

// Cuántos comentarios, reacciones y regalos nuevos tiene la persona desde la
// última vez que revisó -- solo cuenta actividad de OTROS sobre lo suyo, no
// sus propias acciones.
export async function obtenerNotificacionesPendientes(): Promise<number> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data: estado } = await supabase
    .from("notificaciones_estado")
    .select("visto_en")
    .eq("usuario_id", sesion.id)
    .maybeSingle();
  const desde = estado?.visto_en ?? new Date(0).toISOString();

  const { data: misHistorias } = await supabase.from("historias").select("id").eq("usuario_id", sesion.id);
  const idsMisHistorias = (misHistorias ?? []).map((h) => h.id);

  let comentarios = 0;
  let reacciones = 0;

  if (idsMisHistorias.length > 0) {
    const [comentariosRes, reaccionesRes] = await Promise.all([
      supabase
        .from("historia_comentarios")
        .select("id", { count: "exact", head: true })
        .in("historia_id", idsMisHistorias)
        .gt("created_at", desde)
        .neq("usuario_id", sesion.id),
      supabase
        .from("historia_reacciones")
        .select("id", { count: "exact", head: true })
        .in("historia_id", idsMisHistorias)
        .gt("created_at", desde)
        .neq("usuario_id", sesion.id),
    ]);
    comentarios = comentariosRes.count ?? 0;
    reacciones = reaccionesRes.count ?? 0;
  }

  const { count: regalos } = await supabase
    .from("historia_regalos")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id_recibe", sesion.id)
    .gt("created_at", desde);

  return comentarios + reacciones + (regalos ?? 0);
}

export async function marcarNotificacionesVistas(): Promise<void> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();
  await supabase
    .from("notificaciones_estado")
    .upsert({ usuario_id: sesion.id, visto_en: new Date().toISOString() });
}

// Racha de días seguidos publicando al menos una historia -- se basa en
// historia_publicaciones, que no se borra cuando las fotos vencen a los 7
// días, así que la racha no se pierde con la limpieza automática.
export async function obtenerRachaPublicacion(): Promise<number> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data } = await supabase.from("historia_publicaciones").select("fecha").eq("usuario_id", sesion.id);
  const fechas = new Set((data ?? []).map((f) => f.fecha));
  if (fechas.size === 0) return 0;

  const hoy = hoyPeru();
  let cursor = fechas.has(hoy) ? hoy : sumarDias(hoy, -1);
  if (!fechas.has(cursor)) return 0;

  let racha = 0;
  while (fechas.has(cursor)) {
    racha += 1;
    cursor = sumarDias(cursor, -1);
  }
  return racha;
}

export type FilaRankingRegalos = { usuarioId: string; nombre: string; rol: string; donado: number; recibido: number };

export async function obtenerRankingRegalos(): Promise<FilaRankingRegalos[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data } = await supabase.from("historia_regalos").select("usuario_id_regala, usuario_id_recibe, puntos");
  if (!data || data.length === 0) return [];

  const mapa = new Map<string, { donado: number; recibido: number }>();
  data.forEach((r) => {
    const donante = mapa.get(r.usuario_id_regala) ?? { donado: 0, recibido: 0 };
    donante.donado += r.puntos;
    mapa.set(r.usuario_id_regala, donante);

    const receptor = mapa.get(r.usuario_id_recibe) ?? { donado: 0, recibido: 0 };
    receptor.recibido += r.puntos;
    mapa.set(r.usuario_id_recibe, receptor);
  });

  const ids = Array.from(mapa.keys());
  const { data: usuarios } = await supabase.from("usuarios").select("id, nombre, rol").in("id", ids);

  return (usuarios ?? [])
    .map((u) => {
      const totales = mapa.get(u.id)!;
      return { usuarioId: u.id, nombre: u.nombre, rol: u.rol, donado: totales.donado, recibido: totales.recibido };
    })
    .sort((a, b) => b.donado + b.recibido - (a.donado + a.recibido));
}
